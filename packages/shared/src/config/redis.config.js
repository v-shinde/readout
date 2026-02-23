const Redis = require('ioredis');
const logger = require('../utils/logger.util');

const createRedisClient = () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
  });
  redis.on('connect', () => logger.info('Redis Connected'));
  redis.on('error', (err) => logger.error('Redis Error:', err));
  return redis;
};

module.exports = { createRedisClient };
