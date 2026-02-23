// ==================== summarize.route.js ====================
const router = require('express').Router();
const c = require('../../services/ai-summarization.service');
const { asyncHandler } = require('@readout/shared').utils;

// POST /ai/v1/summarize/article — called by scraper
router.post('/article', asyncHandler(async (req, res) => {
  const { title, content, sourceUrl, sourceName, category } = req.body;
  const result = await c.processArticle({ title, content, sourceUrl, sourceName, category });
  res.json({ success: true, data: result });
}));

// POST /ai/v1/summarize/batch — bulk summarize
router.post('/batch', asyncHandler(async (req, res) => {
  const { articles } = req.body;
  const results = await Promise.allSettled(articles.map(a => c.processArticle(a)));
  const processed = results.map((r, i) => ({
    index: i,
    status: r.status,
    data: r.status === 'fulfilled' ? r.value : null,
    error: r.status === 'rejected' ? r.reason.message : null,
  }));
  res.json({ success: true, data: { processed, total: articles.length, success: processed.filter(p => p.status === 'fulfilled').length } });
}));

module.exports = router;
