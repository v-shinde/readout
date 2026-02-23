require('dotenv').config({ path: '../../.env' });
const express = require('express');
const cron = require('node-cron');
const { connectDB, createRedisClient } = require('@readout/shared').config;
const { errorHandler } = require('@readout/shared').middleware;
const logger = require('@readout/shared').utils.logger;

const app = express();
app.use(express.json());

app.get('/health', (_, res) => res.json({ service: 'scraper', status: 'ok' }));

// Cron: Scrape all sources every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  logger.info('[scraper] Running scheduled scrape...');
  // TODO: Call scrapeAll.job
});

app.use(errorHandler);

const PORT = process.env.SCRAPER_PORT || 5003;
(async () => {
  await connectDB();
  const redis = createRedisClient(); await redis.connect(); app.locals.redis = redis;
  app.listen(PORT, () => logger.info(`[scraper] Running on port ${PORT}`));
})();
module.exports = app;
