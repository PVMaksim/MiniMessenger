// backend/src/config/redis.js

const { createClient } = require('redis');

const redis = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  // FIX: поддержка пароля — нужна когда Redis запущен с --requirepass
  // В dev-окружении REDIS_PASSWORD можно не ставить (Redis без пароля)
  password: process.env.REDIS_PASSWORD || undefined,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

redis.connect().catch(console.error);

module.exports = redis;
