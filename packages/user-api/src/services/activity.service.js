const { UserActivity, User, AnonymousUser, FeedCache, Article } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

// Redis key prefixes
const KEYS = {
  articleEngagement: (id) => `article:engagement:${id}`,
  userViewed: (id) => `user:viewed:${id}`,
  userFeed: (id) => `user:feed:${id}`,
  userProfile: (id) => `user:profile:${id}`,
  session: (id) => `session:${id}`,
  dailyActive: (date) => `dau:${date}`,
  realtimeReaders: 'realtime:readers',
};

// ============================================
// ACTIVITY LOGGING
// ============================================

/**
 * Log a single activity event (fire-and-forget to MongoDB)
 */
exports.logActivity = (data) => {
  UserActivity.logActivity(data).catch(err =>
    logger.error(`[activity.service] Log failed: ${err.message}`)
  );
};

/**
 * Log batch activities (from client-side buffer)
 */
exports.logBatch = async (trackingId, activities, deviceInfo) => {
  const docs = activities.map(a => ({
    userId: trackingId,
    articleId: a.articleId || undefined,
    action: a.action,
    metadata: {
      ...a.metadata,
      deviceType: deviceInfo?.deviceType,
      connectionType: deviceInfo?.connectionType,
    },
    timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
  }));
  await UserActivity.logBatch(docs);
  return docs.length;
};

// ============================================
// REDIS ENGAGEMENT COUNTERS
// ============================================

/**
 * Increment article engagement counter in Redis (real-time)
 */
exports.incrArticleEngagement = async (articleId, action, redis) => {
  await redis.hincrby(KEYS.articleEngagement(articleId), action, 1);
  await redis.expire(KEYS.articleEngagement(articleId), 3600);
};

/**
 * Track that a user viewed an article (for deduplication)
 */
exports.markViewed = async (trackingId, articleId, redis) => {
  await redis.sadd(KEYS.userViewed(trackingId), articleId.toString());
  await redis.expire(KEYS.userViewed(trackingId), 86400); // 24h
};

/**
 * Check if user has already viewed an article
 */
exports.hasViewed = async (trackingId, articleId, redis) => {
  return redis.sismember(KEYS.userViewed(trackingId), articleId.toString());
};

/**
 * Get all recently viewed article IDs for a user
 */
exports.getViewedSet = async (trackingId, redis) => {
  const ids = await redis.smembers(KEYS.userViewed(trackingId));
  return new Set(ids);
};

// ============================================
// USER STATS UPDATES
// ============================================

/**
 * Update user stats after a significant action
 */
exports.updateUserStats = async (trackingId, isAnonymous, action, metadata = {}) => {
  const Model = isAnonymous ? AnonymousUser : User;

  const updates = { $set: { lastActiveAt: new Date() } };

  switch (action) {
    case 'read_summary':
    case 'read_full':
      updates.$inc = { 'stats.totalArticlesRead': 1 };
      if (metadata.readDurationSeconds) {
        updates.$inc['stats.totalReadTimeMinutes'] = Math.round(metadata.readDurationSeconds / 60 * 100) / 100;
      }
      break;
    case 'share':
      updates.$inc = { 'stats.totalShares': 1 };
      break;
    case 'bookmark':
      if (!isAnonymous) updates.$inc = { 'stats.totalBookmarks': 1 };
      break;
    case 'poll_vote':
      if (!isAnonymous) updates.$inc = { 'stats.totalPolls': 1 };
      break;
  }

  await Model.updateOne({ _id: trackingId }, updates).catch(err =>
    logger.error(`[activity.service] Stats update failed: ${err.message}`)
  );
};

/**
 * Update reading streak (call at end of session or on each read)
 */
exports.updateStreak = async (userId) => {
  const user = await User.findById(userId).select('stats.streak').lean();
  if (!user) return;

  const streak = user.stats?.streak || { current: 0, longest: 0, lastActiveDate: null };
  const today = new Date().toISOString().split('T')[0];
  const lastDate = streak.lastActiveDate ? new Date(streak.lastActiveDate).toISOString().split('T')[0] : null;

  if (lastDate === today) return; // Already counted today

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  let newCurrent;

  if (lastDate === yesterday) {
    newCurrent = streak.current + 1; // Continue streak
  } else {
    newCurrent = 1; // Broken — restart
  }

  const newLongest = Math.max(streak.longest || 0, newCurrent);

  await User.updateOne({ _id: userId }, {
    $set: {
      'stats.streak.current': newCurrent,
      'stats.streak.longest': newLongest,
      'stats.streak.lastActiveDate': new Date(),
    },
  });

  return { current: newCurrent, longest: newLongest };
};

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Start a new session — creates Redis entry with TTL
 */
exports.startSession = async (trackingId, deviceType, redis) => {
  const { v4: uuidv4 } = require('uuid');
  const sessionId = uuidv4();

  await redis.hset(
    KEYS.session(sessionId),
    'userId', trackingId,
    'startedAt', Date.now().toString(),
    'deviceType', deviceType || 'unknown'
  );
  await redis.expire(KEYS.session(sessionId), 1800); // 30 min TTL

  exports.logActivity({
    userId: trackingId,
    action: 'session_start',
    metadata: { sessionId, deviceType },
  });

  // Track DAU
  const today = new Date().toISOString().split('T')[0];
  await redis.sadd(KEYS.dailyActive(today), trackingId);
  await redis.expire(KEYS.dailyActive(today), 86400 * 2);

  // Track realtime readers
  await redis.sadd(KEYS.realtimeReaders, trackingId);
  await redis.expire(KEYS.realtimeReaders, 300); // 5 min window

  return sessionId;
};

/**
 * End a session — log duration and cleanup
 */
exports.endSession = async (trackingId, sessionId, durationMinutes, articlesRead, redis) => {
  exports.logActivity({
    userId: trackingId,
    action: 'session_end',
    metadata: { sessionId, sessionDurationMinutes: durationMinutes, articlesInSession: articlesRead },
  });

  await redis.del(KEYS.session(sessionId));
  await redis.srem(KEYS.realtimeReaders, trackingId);
};

/**
 * Get active session count (realtime)
 */
exports.getActiveSessionCount = async (redis) => {
  return redis.scard(KEYS.realtimeReaders);
};

// ============================================
// FEED IMPRESSION TRACKING
// ============================================

/**
 * Track which articles were shown in a feed (for personalization feedback)
 */
exports.trackFeedImpression = (trackingId, articles, feedType, redis) => {
  if (!articles.length) return;

  // Record shown article IDs (fire-and-forget)
  const ids = articles.filter(a => a._id).map(a => a._id.toString());
  if (ids.length) {
    redis.sadd(`user:shown:${trackingId}`, ...ids).catch(() => {});
    redis.expire(`user:shown:${trackingId}`, 3600).catch(() => {}); // 1 hour
  }
};

/**
 * Track category switch for personalization signals
 */
exports.trackCategorySwitch = (trackingId, toCategory, redis) => {
  exports.logActivity({
    userId: trackingId,
    action: 'category_switch',
    metadata: { toCategory },
  });

  // Boost category score slightly in Redis for immediate effect
  redis.hincrbyfloat(`user:profile:${trackingId}:live`, toCategory, 0.05).catch(() => {});
  redis.expire(`user:profile:${trackingId}:live`, 1800).catch(() => {});
};

// ============================================
// CACHE INVALIDATION
// ============================================

/**
 * Invalidate all feed/profile caches for a user
 */
exports.invalidateUserCaches = async (trackingId, redis) => {
  await Promise.all([
    redis.del(KEYS.userFeed(trackingId)),
    redis.del(KEYS.userProfile(trackingId)),
    FeedCache.invalidate(trackingId),
  ]);
};

/**
 * Invalidate just the feed cache (e.g. after not_interested)
 */
exports.invalidateFeedCache = async (trackingId, redis) => {
  await redis.del(KEYS.userFeed(trackingId));
  await FeedCache.invalidate(trackingId);
};

// ============================================
// ENGAGEMENT SYNC (REDIS → MONGODB)
// ============================================

/**
 * Flush Redis engagement counters to MongoDB.
 * Should be called periodically (e.g. every 5 minutes via cron or worker)
 */
exports.syncEngagementToDb = async (redis) => {
  const keys = await redis.keys('article:engagement:*');
  let synced = 0;

  for (const key of keys) {
    const articleId = key.replace('article:engagement:', '');
    const counters = await redis.hgetall(key);

    if (!Object.keys(counters).length) continue;

    const inc = {};
    if (counters.views) inc['engagement.views'] = +counters.views;
    if (counters.read_summary) inc['engagement.views'] = (inc['engagement.views'] || 0) + +counters.read_summary;
    if (counters.read_full) inc['engagement.fullReads'] = +counters.read_full;
    if (counters.share) inc['engagement.shares'] = +counters.share;
    if (counters.bookmark) inc['engagement.bookmarks'] = +counters.bookmark;
    if (counters.comment) inc['engagement.comments'] = +counters.comment;
    if (counters.reaction) {
      // We don't know the type from Redis counter, but track total
      inc['engagement.reactions.like'] = +counters.reaction;
    }

    if (Object.keys(inc).length) {
      await Article.updateOne({ _id: articleId }, { $inc: inc }).catch(() => {});
      synced++;
    }

    // Reset counters
    await redis.del(key);
  }

  if (synced > 0) {
    logger.info(`[activity.service] Synced engagement for ${synced} articles`);
  }

  return synced;
};

/**
 * Get DAU count for a specific date
 */
exports.getDAU = async (redis, date) => {
  const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  return redis.scard(KEYS.dailyActive(dateStr));
};