//Conexion a Redis 
const { createClient } = require('redis');

const redisGeo = createClient({ url: `redis://${process.env.REDIS_GEO_HOST}:6379` });
const redisPop = createClient({ url: `redis://${process.env.REDIS_POP_HOST}:6379` });

redisGeo.connect().catch(console.error);
redisPop.connect().catch(console.error);

module.exports = { redisGeo, redisPop };