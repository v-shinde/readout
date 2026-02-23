const router = require('express').Router();
const { asyncHandler } = require('@readout/shared').utils;
const TrendingEngine = require('../services/trending.service');

const trending = new TrendingEngine();

// POST /ai/v1/trending/recompute — called by cron
router.post('/recompute', asyncHandler(async (req, res) => {
  const { language = 'en', hours = 24 } = req.body;
  const count = await trending.recompute(language, hours);
  res.json({ success: true, data: { articlesUpdated: count } });
}));

// GET /ai/v1/trending/scores?articleId=xxx
router.get('/scores', asyncHandler(async (req, res) => {
  const { articleId } = req.query;
  const score = await trending.getArticleScore(articleId);
  res.json({ success: true, data: score });
}));

module.exports = router;
