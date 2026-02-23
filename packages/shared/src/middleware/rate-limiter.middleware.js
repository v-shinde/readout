const rateLimit = require('express-rate-limit');

const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100) =>
  rateLimit({
    windowMs,
    max,
    message: { success: false, error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });

const feedLimiter = createRateLimiter(60 * 1000, 30);     // 30 req/min for feeds
const authLimiter = createRateLimiter(15 * 60 * 1000, 10); // 10 req/15min for auth
const activityLimiter = createRateLimiter(60 * 1000, 60);  // 60 req/min for activity tracking
const searchLimiter = createRateLimiter(60 * 1000, 20);    // 20 req/min for search

module.exports = { createRateLimiter, feedLimiter, authLimiter, activityLimiter, searchLimiter };
