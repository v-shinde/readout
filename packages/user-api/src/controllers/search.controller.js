const { asyncHandler, ValidationError } = require('@readout/shared').utils;
const searchService = require('../services/search.service');

// GET /search?q=modi&page=1&limit=20&language=en&category=
exports.searchArticles = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20, language = 'en', category } = req.query;
  if (!q || q.trim().length < 2) throw new ValidationError('Query must be at least 2 characters');

  const { articles, total } = await searchService.searchArticles(
    q.trim(), { language, category, page: +page, limit: +limit },
    req.trackingId, req.app.locals.redis
  );

  res.json({ success: true, data: { articles, total, query: q.trim(), page: +page } });
});

// GET /search/suggestions?q=mo
exports.getSearchSuggestions = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json({ success: true, data: [] });

  const suggestions = await searchService.getSuggestions(q, req.app.locals.redis);
  res.json({ success: true, data: suggestions });
});

// GET /search/trending-queries
exports.getTrendingQueries = asyncHandler(async (req, res) => {
  const trending = await searchService.getTrendingQueries(req.app.locals.redis);
  res.json({ success: true, data: trending });
});

// GET /search/topics?q=election
exports.searchTopics = asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  if (!q) return res.json({ success: true, data: [] });

  const topics = await searchService.searchTopics(q, +limit);
  res.json({ success: true, data: topics });
});