const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');
const { redisGeo, redisPop } = require('./config/redis');
const airportRoutes = require('./routes/airports');
const Airport = require('./models/Airport');

const app = express();

app.use(cors());
app.use(express.json());

// Conectar a la base de datos MongoDB
connectDB();

// Inicialización de datos: carga desde data/airports.json, limpia colecciones y llena MongoDB + Redis
const initData = async () => {
    // Leer archivo JSON con datos de aeropuertos
    const rawAirports = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/airports.json')));

    // Filtrar y transformar cada registro al esquema usado en la app
    const airports = rawAirports
        .filter((airport) => airport.iata_faa || airport.icao) // conservar solo con identificador IATA o ICAO
        .map((airport) => ({
            iata_code: airport.iata_faa,
            icao: airport.icao,
            name: airport.name,
            city: airport.city.split(',')[0], // tomar solo la primera parte de la ciudad si contiene coma
            latitude: airport.lat,
            longitude: airport.lng,
            altitude: airport.alt,
            timezone: airport.tz,
        }));

    // Limpiar datos existentes en MongoDB y en Redis antes de reinsertar
    await Airport.deleteMany({});
    await redisGeo.del('airports_geo');         // clave geoespacial
    await redisPop.del('airport_popularity');  // ZSET de popularidad

    // Insertar aeropuertos uno por uno (se hace así para manejar duplicados y errores por registro)
    let insertedCount = 0;
    for (const airport of airports) {
        try {
            const savedAirport = await Airport.create(airport);
            const identifier = savedAirport.iata_code || savedAirport.icao;
            if (!identifier) {
                // Si por alguna razón el registro no tiene identificador, saltarlo para Redis
                console.warn(`Skipping Redis GEO for airport with no iata_code or icao:`, airport);
                continue;
            }
            if (savedAirport.latitude != null && savedAirport.longitude != null) {
                // Añadir al índice geoespacial de Redis para búsquedas por proximidad
                await redisGeo.GEOADD('airports_geo', {
                    longitude: savedAirport.longitude,
                    latitude: savedAirport.latitude,
                    member: identifier,
                });
                insertedCount++;
            } else {
                // Si faltan coordenadas, no se añade al índice geoespacial
                console.warn(`Skipping Redis GEO for ${identifier} due to invalid coordinates:`, {
                    lat: savedAirport.latitude,
                    lng: savedAirport.longitude,
                });
            }
        } catch (err) {
            // Manejo básico de errores: duplicados y otros
            if (err.code === 11000) {
                // 11000 es código de violación de unique index en Mongo
                console.warn(`Skipping duplicate airport: ${airport.iata_code || airport.icao}`);
            } else {
                console.error(`Error inserting airport ${airport.iata_code || airport.icao}:`, err.message);
            }
        }
    }
    console.log(`Inserted ${insertedCount} airports into MongoDB and Redis GEO`);

    // Inicializar TTL de la clave de popularidad (se usa EXPIRE para asegurar caducidad diaria)
    await redisPop.EXPIRE('airport_popularity', 86400); // 1 día en segundos

    // Notas útiles para depuración desde entorno Docker:
    // docker exec -it aviones-nsql-redis-pop-1 redis-cli
    // TTL airport_popularity
    // EXPIRE airport_popularity 10
};

initData().catch(console.error);

// Registrar rutas de la API bajo /airports
app.use('/airports', airportRoutes);

// Arrancar servidor en puerto 3000
app.listen(3000, () => console.log('Server running on port 3000'));