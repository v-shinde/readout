const { asyncHandler, NotFoundError } = require('@readout/shared').utils;
const { Article, DailyDigest, Timeline } = require('@readout/shared').models;
const { CATEGORIES } = require('@readout/shared').constants;
const feedService = require('../services/feed.service');
const adService = require('../services/ad.service');
const activityService = require('../services/activity.service');
const topicService = require('../services/topic.service');

// GET /feed/personalized
exports.getPersonalizedFeed = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const language = req.query.language || req.headers['x-language'] || 'en';
  const redis = req.app.locals.redis;

  const articles = await feedService.getPersonalizedFeed(
    req.trackingId, req.isAnonymous, { page: +page, limit: +limit, language }, redis
  );

  const withAds = await adService.injectNativeAds(articles, { language, userId: req.trackingId, redis });
  activityService.trackFeedImpression(req.trackingId, articles, 'personalized', redis);

  res.json({ success: true, data: { articles: withAds, page: +page, count: articles.length, hasMore: articles.length === +limit } });
});

// GET /feed/for-you
exports.getForYouFeed = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const language = req.query.language || 'en';
  const redis = req.app.locals.redis;

  if (+page === 1) {
    const [personalized, breaking, liveTimelines] = await Promise.all([
      feedService.getPersonalizedFeed(req.trackingId, req.isAnonymous, { limit: 15, language }, redis),
      feedService.getBreaking(language, redis),
      Timeline.getLive(language, 2),
    ]);

    const feed = [];
    breaking.slice(0, 3).forEach(a => feed.push({ ...a, _feedType: 'breaking' }));
    if (liveTimelines.length > 0) {
      feed.push({ _feedType: 'timeline_card', timeline: { id: liveTimelines[0]._id, title: liveTimelines[0].title, coverImage: liveTimelines[0].coverImage, totalArticles: liveTimelines[0].totalArticles, isLive: liveTimelines[0].isLive } });
    }
    const breakingIds = new Set(breaking.map(a => a._id?.toString()));
    personalized.filter(a => !breakingIds.has(a._id?.toString())).forEach(a => feed.push({ ...a, _feedType: 'personalized' }));

    const withAds = await adService.injectNativeAds(feed, { language, userId: req.trackingId, redis });
    activityService.trackFeedImpression(req.trackingId, feed, 'for_you', redis);

    return res.json({ success: true, data: { articles: withAds.slice(0, +limit), page: 1, hasMore: true } });
  }

  const articles = await feedService.getPersonalizedFeed(req.trackingId, req.isAnonymous, { page: +page, limit: +limit, language }, redis);
  const withAds = await adService.injectNativeAds(articles, { language, userId: req.trackingId, redis });

  res.json({ success: true, data: { articles: withAds, page: +page, hasMore: articles.length === +limit } });
});

// GET /feed/trending
exports.getTrendingFeed = asyncHandler(async (req, res) => {
  const { limit = 20, hours = 24 } = req.query;
  const language = req.query.language || 'en';
  const articles = await feedService.getTrending(language, +limit, +hours, req.app.locals.redis);
  res.json({ success: true, data: { articles, count: articles.length } });
});

// GET /feed/latest
exports.getLatestFeed = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const language = req.query.language || 'en';
  const articles = await Article.getPublishedFeed({ language }, +page, +limit);
  res.json({ success: true, data: { articles, page: +page, count: articles.length, hasMore: articles.length === +limit } });
});

// GET /feed/breaking
exports.getBreakingFeed = asyncHandler(async (req, res) => {
  const language = req.query.language || 'en';
  const articles = await feedService.getBreaking(language, req.app.locals.redis);
  res.json({ success: true, data: { articles, count: articles.length } });
});

// GET /feed/category/:category
exports.getCategoryFeed = asyncHandler(async (req, res) => {
  const { category } = req.params;
  if (!CATEGORIES.includes(category)) throw new NotFoundError('Category');
  const { page = 1, limit = 20 } = req.query;
  const language = req.query.language || 'en';

  const articles = await feedService.getCategoryFeed(category, language, +page, +limit, req.app.locals.redis);
  activityService.trackCategorySwitch(req.trackingId, category, req.app.locals.redis);

  res.json({ success: true, data: { articles, category, page: +page, count: articles.length, hasMore: articles.length === +limit } });
});

// GET /feed/explore
exports.getExploreFeed = asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;
  const language = req.query.language || 'en';
  const articles = await feedService.getExploreFeed(language, +limit, req.app.locals.redis);
  res.json({ success: true, data: { articles, count: articles.length } });
});

// GET /feed/daily-digest
exports.getDailyDigest = asyncHandler(async (req, res) => {
  const language = req.query.language || 'en';
  const digest = await DailyDigest.getToday(language);
  if (!digest) {
    const articles = await feedService.getTrending(language, 15, 24, req.app.locals.redis);
    return res.json({ success: true, data: { type: 'trending_fallback', stories: articles } });
  }
  res.json({ success: true, data: digest });
});

// GET /feed/topics/trending
exports.getTrendingTopics = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const topics = await topicService.getTrendingTopics(+limit, req.app.locals.redis);
  res.json({ success: true, data: topics });
});

// GET /feed/topics/:topicId
exports.getTopicFeed = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await topicService.getTopicFeed(req.params.topicId, +page, +limit);
  if (!result.topic) throw new NotFoundError('Topic');
  res.json({ success: true, data: { topic: result.topic, articles: result.articles, page: +page, hasMore: result.articles.length === +limit } });
});

// GET /feed/timelines
exports.getTimelines = asyncHandler(async (req, res) => {
  const { language = 'en', limit = 10 } = req.query;
  const [featured, live] = await Promise.all([Timeline.getFeatured(language, Math.ceil(+limit / 2)), Timeline.getLive(language, Math.ceil(+limit / 2))]);
  const seen = new Set(); const timelines = [];
  [...featured, ...live].forEach(t => { if (!seen.has(t._id.toString())) { timelines.push(t); seen.add(t._id.toString()); } });
  res.json({ success: true, data: timelines.slice(0, +limit) });
});

// GET /feed/timelines/:timelineId
exports.getTimelineDetail = asyncHandler(async (req, res) => {
  const timeline = await Timeline.findById(req.params.timelineId)
    .populate('articles.articleId', 'title summary media.thumbnail category sourceInfo publishedAt engagement.engagementScore').lean();
  if (!timeline) throw new NotFoundError('Timeline');
  await Timeline.updateOne({ _id: timeline._id }, { $inc: { viewCount: 1 } });
  res.json({ success: true, data: timeline });
});

// GET /feed/source/:sourceId
exports.getSourceFeed = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const language = req.query.language || 'en';
  const articles = await Article.find({ source: req.params.sourceId, status: 'published', language })
    .sort({ publishedAt: -1 }).skip((+page - 1) * +limit).limit(+limit)
    .select('-fullContent -aiMetadata.contentVector -moderation').lean();
  res.json({ success: true, data: { articles, page: +page, count: articles.length, hasMore: articles.length === +limit } });
});

// GET /feed/next — infinite scroll
exports.getNextPage = asyncHandler(async (req, res) => {
  const { feedType = 'personalized', cursor, limit = 20, category, language = 'en' } = req.query;
  const redis = req.app.locals.redis;
  let articles;

  switch (feedType) {
    case 'personalized':
    case 'for_you':
      articles = await feedService.getNextPersonalized(req.trackingId, req.isAnonymous, { limit: +limit, language, cursor }, redis);
      break;
    case 'trending':
      articles = await feedService.getTrending(language, +limit, 24, redis);
      break;
    case 'category':
      if (!category) throw new NotFoundError('Category param required');
      articles = await Article.find({ status: 'published', language, category, ...(cursor ? { _id: { $lt: cursor } } : {}) })
        .sort({ publishedAt: -1 }).limit(+limit).select('-fullContent -aiMetadata.contentVector -moderation').lean();
      break;
    default:
      articles = await feedService.getTrending(language, +limit, 24, redis);
  }

  const nextCursor = articles.length > 0 ? articles[articles.length - 1]._id : null;
  res.json({ success: true, data: { articles, cursor: nextCursor, hasMore: articles.length === +limit } });
});