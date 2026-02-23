const { asyncHandler } = require('@readout/shared').utils;
const { User, AnonymousUser, Article, UserActivity, Source } = require('@readout/shared').models;

// GET /admin/v1/dashboard/overview
exports.getOverview = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 86400000);
  const last7d = new Date(Date.now() - 7 * 86400000);
  const last30d = new Date(Date.now() - 30 * 86400000);

  const [totalUsers, totalAnonymous, newUsersToday, totalArticles, articlesToday, activeSourceCount] = await Promise.all([
    User.countDocuments({ isActive: true }),
    AnonymousUser.countDocuments({ isActive: true, isMerged: false }),
    User.countDocuments({ createdAt: { $gte: today } }),
    Article.countDocuments({ status: 'published' }),
    Article.countDocuments({ status: 'published', publishedAt: { $gte: today } }),
    Source.countDocuments({ isActive: true }),
  ]);

  const engagementToday = await UserActivity.countDocuments({ timestamp: { $gte: today } });

  res.json({
    success: true,
    data: {
      users: { total: totalUsers, anonymous: totalAnonymous, newToday: newUsersToday },
      articles: { total: totalArticles, publishedToday: articlesToday },
      sources: { active: activeSourceCount },
      engagement: { actionsToday: engagementToday },
    },
  });
});

// GET /admin/v1/dashboard/engagement?days=7
exports.getEngagementStats = asyncHandler(async (req, res) => {
  const days = +(req.query.days || 7);
  const since = new Date(Date.now() - days * 86400000);

  const stats = await UserActivity.aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, action: '$action' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);

  res.json({ success: true, data: stats });
});

// GET /admin/v1/dashboard/growth?days=30
exports.getUserGrowth = asyncHandler(async (req, res) => {
  const days = +(req.query.days || 30);
  const since = new Date(Date.now() - days * 86400000);

  const growth = await User.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        newUsers: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({ success: true, data: growth });
});

// GET /admin/v1/dashboard/content
exports.getContentStats = asyncHandler(async (req, res) => {
  const byCategory = await Article.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$category', count: { $sum: 1 }, avgEngagement: { $avg: '$engagement.engagementScore' } } },
    { $sort: { count: -1 } },
  ]);

  const byStatus = await Article.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  res.json({ success: true, data: { byCategory, byStatus } });
});

// GET /admin/v1/dashboard/realtime
exports.getRealtimeStats = asyncHandler(async (req, res) => {
  const redis = req.app.locals.redis;
  const fiveMin = new Date(Date.now() - 5 * 60000);

  const [activeActions, breakingCount] = await Promise.all([
    UserActivity.countDocuments({ timestamp: { $gte: fiveMin } }),
    Article.countDocuments({ isBreaking: true, status: 'published', publishedAt: { $gte: new Date(Date.now() - 6 * 3600000) } }),
  ]);

  res.json({ success: true, data: { activeActionsLast5Min: activeActions, activeBreakingNews: breakingCount } });
});