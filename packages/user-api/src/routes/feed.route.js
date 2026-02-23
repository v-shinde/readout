const router = require('express').Router();
const c = require('../controllers/feed.controller');
const { authenticate, optionalAuth, feedLimiter } = require('@readout/shared').middleware;

router.use(feedLimiter);

// ---- Primary Feeds (anonymous + logged-in) ----
router.get('/personalized', authenticate, c.getPersonalizedFeed);
router.get('/for-you', authenticate, c.getForYouFeed);
router.get('/trending', authenticate, c.getTrendingFeed);
router.get('/latest', authenticate, c.getLatestFeed);
router.get('/breaking', authenticate, c.getBreakingFeed);
router.get('/category/:category', authenticate, c.getCategoryFeed);
router.get('/explore', authenticate, c.getExploreFeed);

// ---- Content Discovery ----
router.get('/daily-digest', authenticate, c.getDailyDigest);
router.get('/topics/trending', authenticate, c.getTrendingTopics);
router.get('/topics/:topicId', authenticate, c.getTopicFeed);
router.get('/timelines', authenticate, c.getTimelines);
router.get('/timelines/:timelineId', authenticate, c.getTimelineDetail);

// ---- Source-specific ----
router.get('/source/:sourceId', authenticate, c.getSourceFeed);

// ---- Infinite scroll helper ----
router.get('/next', authenticate, c.getNextPage);

module.exports = router;
