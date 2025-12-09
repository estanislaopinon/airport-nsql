const express = require('express');
const router = express.Router();

const Airport = require('../models/Airport');
const { redisGeo, redisPop } = require('../config/redis');

// Ruta: GET /airports/nearby
// Descripción: Busca aeropuertos cerca de una coordenada usando GEORADIUS en Redis
// Parámetros query esperados: lat, lng, radius (km)
// Validaciones: parámetros presentes, numéricos y dentro de rangos válidos
router.get('/nearby', async (req, res) => {
    const { lat, lng, radius } = req.query;
    console.log('Handling GET /airports/nearby with params:', { lat, lng, radius });

    // Validación de parámetros requeridos
    if (!lat || !lng || !radius) {
        return res.status(400).json({ error: 'Missing required parameters: lat, lng, radius' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const rad = parseFloat(radius);

    // Validación de valores numéricos y rangos geográficos
    if (
        isNaN(latitude) || isNaN(longitude) || isNaN(rad) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180 ||
        rad <= 0
    ) {
        return res.status(400).json({ error: 'Invalid parameters: lat, lng, or radius' });
    }

    try {
        // Llamada a Redis GEORADIUS: devuelve [member, distance, [lon, lat]] por cada resultado
        const airports = await redisGeo.sendCommand([
            'GEORADIUS',
            'airports_geo',
            String(longitude),
            String(latitude),
            String(rad),
            'km',
            'WITHDIST',
            'WITHCOORD'
        ]);
        console.log('Raw GEORADIUS output:', JSON.stringify(airports, null, 2));

        // Mapear cada resultado a un objeto enriquecido con los datos de MongoDB
        const results = await Promise.all(
            airports.map(async ([identifier, dist, coords]) => {
                if (!coords || coords.length < 2) {
                    // Si Redis devuelve coordenadas inválidas, ignorar ese miembro
                    console.warn('Invalid coordinates for:', identifier, coords);
                    return null;
                }

                // Buscar el aeropuerto en MongoDB por IATA o ICAO
                const airport = await Airport.findOne({
                    $or: [{ iata_code: identifier }, { icao: identifier }]
                });
                if (!airport) {
                    // Si no existe registro en Mongo, también ignorar
                    console.warn('No MongoDB record for:', identifier);
                    return null;
                }

                // Construir objeto de respuesta
                return {
                    identifier,
                    iata_code: airport.iata_code || null,
                    icao: airport.icao || null,
                    name: airport.name || 'Unknown',
                    distance: parseFloat(dist) || 0,
                    longitude: parseFloat(coords[0]) || 0,
                    latitude: parseFloat(coords[1]) || 0,
                };
            })
        );

        // Filtrar entradas nulas (fallos de mapeo)
        const filteredResults = results.filter(result => result !== null);
        console.log('Mapped results:', filteredResults.length, 'airports');
        res.json(filteredResults);
    } catch (err) {
        // Manejo de errores en la consulta a Redis o en el mapeo
        console.error('GEORADIUS error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Ruta: GET /airports/popular
// Descripción: Devuelve los aeropuertos más populares usando un ZSET en Redis
router.get('/popular', async (req, res) => {
    try {
        console.log('Fetching popular airports');
        // ZREVRANGE con WITHSCORES devuelve [member1, score1, member2, score2, ...]
        const popular = await redisPop.sendCommand([
            'ZREVRANGE',
            'airport_popularity',
            '0',
            '9',
            'WITHSCORES'
        ]);
        console.log('ZREVRANGE result:', JSON.stringify(popular, null, 2));

        // Convertir array plano en pares [identifier, score]
        const results = await Promise.all(
            popular.reduce((acc, val, index, arr) => {
                if (index % 2 === 0) {
                    acc.push([val, arr[index + 1]]);
                }
                return acc;
            }, []).map(async ([identifier, score]) => {
                // Enriquecer con datos de MongoDB
                const airport = await Airport.findOne({
                    $or: [{ iata_code: identifier }, { icao: identifier }]
                });
                if (!airport) {
                    console.warn('No MongoDB record for:', identifier);
                    return null;
                }
                return {
                    identifier,
                    iata_code: airport.iata_code || null,
                    icao: airport.icao || null,
                    name: airport.name || 'Unknown',
                    visits: parseInt(score) || 0
                };
            })
        );

        const filteredResults = results.filter(result => result !== null);
        console.log('Mapped popular results:', filteredResults.length, 'airports');
        res.json(filteredResults);
    } catch (err) {
        console.error('Popular error:', err);
        res.status(500).json({ error: err.message });
    }
});

// CRUD Operations

// Crear un nuevo aeropuerto (POST /airports)
// Se requiere al menos iata_code o icao. Guarda en MongoDB y añade a index geoespacial en Redis.
router.post('/', async (req, res) => {
    try {
        const airport = new Airport(req.body);
        if (!airport.iata_code && !airport.icao) {
            return res.status(400).json({ error: 'Either iata_code or icao is required' });
        }
        await airport.save();

        // Añadir al set geoespacial de Redis para búsquedas por proximidad
        await redisGeo.geoAdd('airports_geo', {
            longitude: airport.longitude,
            latitude: airport.latitude,
            member: airport.iata_code || airport.icao
        });

        res.status(201).json(airport);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Listar todos los aeropuertos (GET /airports)
router.get('/', async (req, res) => {
    const airports = await Airport.find();
    res.json(airports);
});

// Obtener un aeropuerto por identificador (IATA o ICAO) (GET /airports/:identifier)
// Incrementa contador de popularidad en Redis y setea expiración de la clave
router.get('/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        console.log('Handling GET /airports/:identifier with identifier:', identifier);

        const airport = await Airport.findOne({
            $or: [{ iata_code: identifier }, { icao: identifier }]
        });
        if (!airport) return res.status(404).json({ error: 'Airport not found' });

        // Incrementar popularidad en ZSET y asegurar expiración diaria
        await redisPop.ZINCRBY('airport_popularity', 1, airport.iata_code || airport.icao);
        await redisPop.EXPIRE('airport_popularity', 86400);

        res.json(airport);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar un aeropuerto (PUT /airports/:identifier)
// Si cambian lat/lon actualizar también el index geoespacial en Redis
router.put('/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        const airport = await Airport.findOneAndUpdate(
            { $or: [{ iata_code: identifier }, { icao: identifier }] },
            req.body,
            { new: true }
        );
        if (!airport) return res.status(404).json({ error: 'Airport not found' });

        // Si se actualizaron coordenadas, actualizar en Redis
        if (req.body.latitude != null && req.body.longitude != null) {
            await redisGeo.ZREM('airports_geo', airport.iata_code || airport.icao);
            await redisGeo.geoAdd('airports_geo', {
                longitude: req.body.longitude,
                latitude: req.body.latitude,
                member: airport.iata_code || airport.icao
            });
        }
        res.json(airport);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Borrar un aeropuerto (DELETE /airports/:identifier)
// Elimina de MongoDB y de las estructuras relacionadas en Redis
router.delete('/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        const airport = await Airport.findOneAndDelete({
            $or: [{ iata_code: identifier }, { icao: identifier }]
        });
        if (!airport) return res.status(404).json({ error: 'Airport not found' });

        // Remover del índice geoespacial y del ZSET de popularidad
        await redisGeo.zRem('airports_geo', airport.iata_code || airport.icao);
        await redisPop.zRem('airport_popularity', airport.iata_code || airport.icao);
        res.json({ message: 'Airport deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;