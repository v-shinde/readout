const { asyncHandler, NotFoundError } = require('@readout/shared').utils;
const { Article } = require('@readout/shared').models;
const articleService = require('../services/article.service');
const activityService = require('../services/activity.service');

// GET /articles/:id
exports.getArticle = asyncHandler(async (req, res) => {
  const article = await Article.findOne({ _id: req.params.id, status: 'published' })
    .select('-aiMetadata.contentVector -moderation').lean();
  if (!article) throw new NotFoundError('Article');
  res.json({ success: true, data: article });
});

// GET /articles/:id/full
exports.getFullArticle = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id)
    .select('sourceUrl fullContent title sourceInfo category source').lean();
  if (!article) throw new NotFoundError('Article');

  if (req.trackingId) {
    await articleService.trackFullRead(req.trackingId, article, {
      source: req.query.source, deviceType: req.deviceInfo?.deviceType,
    }, req.app.locals.redis);
  }

  res.json({ success: true, data: { sourceUrl: article.sourceUrl, fullContent: article.fullContent || null, title: article.title } });
});

// GET /articles/:id/related
exports.getRelatedArticles = asyncHandler(async (req, res) => {
  const related = await articleService.getRelatedArticles(req.params.id, +(req.query.limit || 5));
  res.json({ success: true, data: related });
});

// POST /articles/:id/view
exports.trackView = asyncHandler(async (req, res) => {
  const { readDurationSeconds, scrollDepthPercent, feedPosition, source } = req.body;

  await articleService.trackView(req.trackingId, req.params.id, {
    readDurationSeconds, scrollDepthPercent, feedPosition, source,
    deviceType: req.deviceInfo?.deviceType,
    connectionType: req.deviceInfo?.connectionType,
  }, req.app.locals.redis);

  // Update user stats (async)
  const action = readDurationSeconds > 2 ? 'read_summary' : 'view';
  activityService.updateUserStats(req.trackingId, req.isAnonymous, action, { readDurationSeconds });

  res.json({ success: true });
});

// POST /articles/:id/share
exports.trackShare = asyncHandler(async (req, res) => {
  await articleService.trackShare(req.trackingId, req.params.id, req.body.target, req.app.locals.redis);
  activityService.updateUserStats(req.trackingId, req.isAnonymous, 'share');
  res.json({ success: true });
});

// POST /articles/:id/react
exports.addReaction = asyncHandler(async (req, res) => {
  await articleService.addReaction(req.trackingId, req.params.id, req.body.type);
  res.json({ success: true });
});

// DELETE /articles/:id/react
exports.removeReaction = asyncHandler(async (req, res) => {
  await articleService.removeReaction(req.params.id, req.body.type);
  res.json({ success: true });
});

// POST /articles/:id/report
exports.reportArticle = asyncHandler(async (req, res) => {
  await articleService.reportArticle(req.userId, req.params.id, req.body.reason);
  res.json({ success: true, message: 'Article reported' });
});

// POST /articles/:id/not-interested
exports.markNotInterested = asyncHandler(async (req, res) => {
  await articleService.markNotInterested(req.trackingId, req.params.id, {
    category: req.body.category, source: req.body.source,
  }, req.app.locals.redis);
  res.json({ success: true });
});