require('dotenv').config({ path: '../../.env' });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { connectDB, createRedisClient } = require('@readout/shared').config;
const { errorHandler, deviceTracker } = require('@readout/shared').middleware;
const logger = require('@readout/shared').utils.logger;

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(deviceTracker);

// Health check
app.get('/health', (_, res) => res.json({ service: 'user-api', status: 'ok', timestamp: new Date() }));

// Routes
app.use('/api/v1/auth', require('./routes/auth.route'));
app.use('/api/v1/feed', require('./routes/feed.route'));
app.use('/api/v1/articles', require('./routes/article.route'));
app.use('/api/v1/bookmarks', require('./routes/bookmark.route'));
app.use('/api/v1/search', require('./routes/search.route'));
app.use('/api/v1/users', require('./routes/user.route'));
app.use('/api/v1/notifications', require('./routes/notification.route'));
app.use('/api/v1/comments', require('./routes/comment.route'));
app.use('/api/v1/polls', require('./routes/poll.route'));
app.use('/api/v1/activity', require('./routes/activity.route'));

app.use(errorHandler);

const PORT = process.env.USER_API_PORT || 5000;

(async () => {
  await connectDB();
  const redis = createRedisClient();
  await redis.connect();
  app.locals.redis = redis;
  app.listen(PORT, () => logger.info(`[user-api] Running on port ${PORT}`));
})();

module.exports = app;
