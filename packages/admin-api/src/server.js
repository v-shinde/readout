require('dotenv').config({ path: '../../.env' });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { connectDB, createRedisClient } = require('@readout/shared').config;
const { errorHandler } = require('@readout/shared').middleware;
const logger = require('@readout/shared').utils.logger;

const app = express();
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_, res) => res.json({ service: 'admin-api', status: 'ok' }));

app.use('/admin/v1/dashboard', require('./routes/dashboard.route'));
app.use('/admin/v1/articles', require('./routes/articles.route'));
app.use('/admin/v1/sources', require('./routes/sources.route'));
app.use('/admin/v1/users', require('./routes/users.route'));
app.use('/admin/v1/ads', require('./routes/ads.route'));
app.use('/admin/v1/notifications', require('./routes/notifications.route'));
app.use('/admin/v1/moderation', require('./routes/moderation.route'));
app.use('/admin/v1/digest', require('./routes/digest.route'));

app.use(errorHandler);

const PORT = process.env.ADMIN_API_PORT || 5001;
(async () => {
  await connectDB();
  const redis = createRedisClient(); await redis.connect(); app.locals.redis = redis;
  app.listen(PORT, () => logger.info(`[admin-api] Running on port ${PORT}`));
})();
module.exports = app;
