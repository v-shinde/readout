require('dotenv').config({ path: '../../.env' });
const express = require('express');
const { connectDB, createRedisClient } = require('@readout/shared').config;
const { errorHandler } = require('@readout/shared').middleware;
const logger = require('@readout/shared').utils.logger;

const app = express();
app.use(express.json());

app.get('/health', (_, res) => res.json({ service: 'notification-service', status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.NOTIFICATION_PORT || 5004;
(async () => {
  await connectDB();
  const redis = createRedisClient(); await redis.connect(); app.locals.redis = redis;
  app.listen(PORT, () => logger.info(`[notification-service] Running on port ${PORT}`));
})();
module.exports = app;
