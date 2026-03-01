const { asyncHandler } = require('@readout/shared').utils;
const activityService = require('../services/activity.service');

// POST /activity/track
exports.trackActivity = asyncHandler(async (req, res) => {
  const { articleId, action, metadata = {} } = req.body;

  activityService.logActivity({
    userId: req.trackingId,
    articleId: articleId || undefined,
    action,
    metadata: {
      ...metadata,
      deviceType: req.deviceInfo?.deviceType,
      connectionType: req.deviceInfo?.connectionType,
    },
  });

  // Redis real-time counters
  if (articleId) {
    await activityService.incrArticleEngagement(articleId, action, req.app.locals.redis);
  }

  // Update user stats for significant actions
  activityService.updateUserStats(req.trackingId, req.isAnonymous, action, metadata);

  res.json({ success: true });
});

// POST /activity/batch
exports.trackBatch = asyncHandler(async (req, res) => {
  const { activities } = req.body;
  if (!Array.isArray(activities)) return res.status(400).json({ success: false, error: 'Array required' });

  const tracked = await activityService.logBatch(req.trackingId, activities, req.deviceInfo);

  // Process each activity for stats, engagement counters, and deduplication
  const redis = req.app.locals.redis;
  const significantActions = new Set(['read_summary', 'read_full', 'share', 'bookmark', 'reaction']);
  let hasSignificant = false;

  for (const a of activities) {
    // Update user stats (totalArticlesRead, totalShares, etc.)
    activityService.updateUserStats(req.trackingId, req.isAnonymous, a.action, a.metadata);

    if (a.articleId) {
      // Increment Redis engagement counters
      activityService.incrArticleEngagement(a.articleId, a.action, redis);

      // Mark article as viewed for deduplication
      activityService.markViewed(req.trackingId, a.articleId, redis);
    }

    if (significantActions.has(a.action)) hasSignificant = true;
  }

  // Invalidate feed cache if batch had significant interactions
  if (hasSignificant) {
    activityService.invalidateFeedCache(req.trackingId, redis);
  }

  res.json({ success: true, data: { tracked } });
});

// POST /activity/session/start
exports.sessionStart = asyncHandler(async (req, res) => {
  const sessionId = await activityService.startSession(
    req.trackingId, req.deviceInfo?.deviceType, req.app.locals.redis
  );

  activityService.updateUserStats(req.trackingId, req.isAnonymous, 'session_start');

  // Update streak for logged-in users
  if (!req.isAnonymous) {
    activityService.updateStreak(req.userId);
  }

  res.json({ success: true, data: { sessionId } });
});

// POST /activity/session/end
exports.sessionEnd = asyncHandler(async (req, res) => {
  const { sessionId, durationMinutes, articlesRead } = req.body;

  await activityService.endSession(
    req.trackingId, sessionId, durationMinutes, articlesRead, req.app.locals.redis
  );

  res.json({ success: true });
});

// POST /activity/hide-source
exports.hideSource = asyncHandler(async (req, res) => {
  const { sourceId, sourceName } = req.body;

  activityService.logActivity({
    userId: req.trackingId, action: 'hide_source',
    metadata: { articleSourceId: sourceId, articleSource: sourceName },
  });

  // Add to blocked sources for logged-in users
  if (!req.isAnonymous) {
    const { User } = require('@readout/shared').models;
    await User.updateOne(
      { _id: req.userId },
      { $addToSet: { 'preferences.blockedSources': sourceId } }
    );
  }

  await activityService.invalidateUserCaches(req.trackingId, req.app.locals.redis);

  res.json({ success: true });
});

// POST /activity/mute-topic
exports.muteTopic = asyncHandler(async (req, res) => {
  const { topicId, topicName, keyword } = req.body;

  activityService.logActivity({
    userId: req.trackingId, action: 'mute_topic',
    metadata: { topicId, topicName },
  });

  if (!req.isAnonymous && keyword) {
    const { User } = require('@readout/shared').models;
    await User.updateOne(
      { _id: req.userId },
      { $addToSet: { 'preferences.blockedKeywords': keyword.toLowerCase() } }
    );
  }

  await activityService.invalidateFeedCache(req.trackingId, req.app.locals.redis);

  res.json({ success: true });
});