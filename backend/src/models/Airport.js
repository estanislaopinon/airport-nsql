const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema({
    iata_code: { type: String, unique: true, sparse: true }, 
    icao: { type: String, unique: true, sparse: true }, 
    name: String,
    city: String,
    latitude: Number,
    longitude: Number,
    altitude: Number,
    timezone: String,
});

module.exports = mongoose.model('Airport', airportSchema);