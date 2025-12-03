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

// Connect to databases
connectDB();

// Initialize data
const initData = async () => {
    const rawAirports = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/airports.json')));

    // Filter and transform airports
    const airports = rawAirports
        .filter((airport) => airport.iata_faa || airport.icao)
        .map((airport) => ({
            iata_code: airport.iata_faa,
            icao: airport.icao,
            name: airport.name,
            city: airport.city.split(',')[0],
            latitude: airport.lat,
            longitude: airport.lng,
            altitude: airport.alt,
            timezone: airport.tz,
        }));

    // Clear existing data
    await Airport.deleteMany({});
    await redisGeo.del('airports_geo');
    await redisPop.del('airport_popularity');

    // Insert airports
    let insertedCount = 0;
    for (const airport of airports) {
        try {
            const savedAirport = await Airport.create(airport);
            const identifier = savedAirport.iata_code || savedAirport.icao;
            if (!identifier) {
                console.warn(`Skipping Redis GEO for airport with no iata_code or icao:`, airport);
                continue;
            }
            if (savedAirport.latitude != null && savedAirport.longitude != null) {
                await redisGeo.GEOADD('airports_geo', {
                    longitude: savedAirport.longitude,
                    latitude: savedAirport.latitude,
                    member: identifier,
                });
                insertedCount++;
            } else {
                console.warn(`Skipping Redis GEO for ${identifier} due to invalid coordinates:`, {
                    lat: savedAirport.latitude,
                    lng: savedAirport.longitude,
                });
            }
        } catch (err) {
            if (err.code === 11000) {
                console.warn(`Skipping duplicate airport: ${airport.iata_code || airport.icao}`);
            } else {
                console.error(`Error inserting airport ${airport.iata_code || airport.icao}:`, err.message);
            }
        }
    }
    console.log(`Inserted ${insertedCount} airports into MongoDB and Redis GEO`);

    // Initialize Redis Popularity ZSET
    await redisPop.EXPIRE('airport_popularity', 86400); // 1 day TTL
    //Commands to check
    //docker exec -it aviones-nsql-redis-pop-1 redis-cli
    //TTL airport_popularity
    //EXPIRE airport_popularity 10
};

initData().catch(console.error);

// Routes
app.use('/airports', airportRoutes);

app.listen(3000, () => console.log('Server running on port 3000'));