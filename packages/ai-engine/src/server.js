require('dotenv').config({ path: '../../.env' });
const express = require('express');
const morgan = require('morgan');
const { connectDB, createRedisClient } = require('@readout/shared').config;
const { errorHandler } = require('@readout/shared').middleware;
const logger = require('@readout/shared').utils.logger;

const app = express();
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_, res) => res.json({ service: 'ai-engine', status: 'ok' }));

app.use('/ai/v1/summarize', require('./routes/summarize.route'));
app.use('/ai/v1/personalize', require('./routes/personalize.route'));
app.use('/ai/v1/trending', require('./routes/trending.route'));

app.use(errorHandler);

const PORT = process.env.AI_ENGINE_PORT || 5002;
(async () => {
  await connectDB();
  const redis = createRedisClient(); await redis.connect(); app.locals.redis = redis;
  app.listen(PORT, () => logger.info(`[ai-engine] Running on port ${PORT}`));
})();
module.exports = app;
