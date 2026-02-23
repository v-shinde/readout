const { Article, UserActivity } = require('@readout/shared').models;
const activityService = require('./activity.service');
const logger = require('@readout/shared').utils.logger;

// ============================================
// VIEW TRACKING
// ============================================

/**
 * Track an article view with full metadata
 */
exports.trackView = async (trackingId, articleId, metadata, redis) => {
  const { readDurationSeconds, scrollDepthPercent, feedPosition, source, deviceType, connectionType } = metadata;

  // Determine action type based on read duration
  const action = readDurationSeconds && readDurationSeconds > 2 ? 'read_summary' : 'view';

  // Log activity (async, fire-and-forget)
  activityService.logActivity({
    userId: trackingId,
    articleId,
    action,
    metadata: {
      readDurationSeconds,
      scrollDepthPercent,
      feedPosition,
      readSource: source || 'feed',
      deviceType,
      connectionType,
    },
  });

  // Redis real-time counters
  await activityService.incrArticleEngagement(articleId, 'views', redis);
  await activityService.markViewed(trackingId, articleId, redis);

  return { action };
};

/**
 * Track a full article read (clicked through to source)
 */
exports.trackFullRead = async (trackingId, article, metadata, redis) => {
  activityService.logActivity({
    userId: trackingId,
    articleId: article._id,
    action: 'read_full',
    metadata: {
      readSource: metadata.source || 'feed',
      articleCategory: article.category,
      articleSource: article.sourceInfo?.name,
      articleSourceId: article.source,
      deviceType: metadata.deviceType,
    },
  });

  await activityService.incrArticleEngagement(article._id, 'read_full', redis);
};

// ============================================
// SHARE TRACKING
// ============================================

exports.trackShare = async (trackingId, articleId, shareTarget, redis) => {
  activityService.logActivity({
    userId: trackingId,
    articleId,
    action: 'share',
    metadata: { shareTarget },
  });

  // Increment in DB directly (shares are less frequent, OK to write)
  await Article.updateOne({ _id: articleId }, { $inc: { 'engagement.shares': 1 } });
  await activityService.incrArticleEngagement(articleId, 'share', redis);
};

// ============================================
// REACTION MANAGEMENT
// ============================================

exports.addReaction = async (trackingId, articleId, reactionType) => {
  const valid = ['like', 'love', 'wow', 'sad', 'angry'];
  if (!valid.includes(reactionType)) throw new Error('Invalid reaction type');

  activityService.logActivity({
    userId: trackingId,
    articleId,
    action: 'reaction',
    metadata: { reactionType },
  });

  await Article.updateOne(
    { _id: articleId },
    { $inc: { [`engagement.reactions.${reactionType}`]: 1 } }
  );

  return true;
};

exports.removeReaction = async (articleId, reactionType) => {
  if (!reactionType) return;
  await Article.updateOne(
    { _id: articleId, [`engagement.reactions.${reactionType}`]: { $gt: 0 } },
    { $inc: { [`engagement.reactions.${reactionType}`]: -1 } }
  );
};

// ============================================
// RELATED ARTICLES
// ============================================

/**
 * Find related articles based on category, tags, entities
 */
exports.getRelatedArticles = async (articleId, limit = 5) => {
  const article = await Article.findById(articleId)
    .select('category tags entities source')
    .lean();

  if (!article) return [];

  // Score-based related: same category + matching tags/entities
  const orConditions = [
    { category: article.category, tags: { $in: article.tags || [] } },
  ];

  if (article.entities?.people?.length) {
    orConditions.push({ 'entities.people': { $in: article.entities.people } });
  }
  if (article.entities?.organizations?.length) {
    orConditions.push({ 'entities.organizations': { $in: article.entities.organizations } });
  }

  const related = await Article.find({
    _id: { $ne: articleId },
    status: 'published',
    $or: orConditions,
  })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .select('-fullContent -aiMetadata.contentVector -moderation')
    .lean();

  return related;
};

// ============================================
// ENGAGEMENT SCORE COMPUTATION
// ============================================

/**
 * Compute engagement score for a single article.
 * Called periodically by the trending recompute job.
 *
 * Formula: weighted sum of interactions normalized by time decay
 */
exports.computeEngagementScore = (article) => {
  const eng = article.engagement || {};
  const r = eng.reactions || {};
  const totalReactions = (r.like || 0) + (r.love || 0) * 1.5 + (r.wow || 0) * 1.2 + (r.sad || 0) + (r.angry || 0) * 0.8;

  const score =
    (eng.views || 0) * 0.1 +
    (eng.uniqueViews || 0) * 0.2 +
    (eng.fullReads || 0) * 2.0 +
    (eng.shares || 0) * 4.0 +
    (eng.bookmarks || 0) * 3.0 +
    (eng.comments || 0) * 2.5 +
    totalReactions * 1.5;

  return Math.round(score * 100) / 100;
};

// ============================================
// REPORT ARTICLE
// ============================================

exports.reportArticle = async (userId, articleId, reason) => {
  await Article.updateOne(
    { _id: articleId },
    {
      $push: {
        'moderation.reports': { userId, reason, reportedAt: new Date() },
      },
      $set: { 'moderation.status': 'flagged' },
    }
  );

  activityService.logActivity({
    userId, articleId, action: 'report',
  });
};

// ============================================
// NOT INTERESTED
// ============================================

exports.markNotInterested = async (trackingId, articleId, articleMeta, redis) => {
  activityService.logActivity({
    userId: trackingId,
    articleId,
    action: 'not_interested',
    metadata: {
      articleCategory: articleMeta?.category,
      articleSource: articleMeta?.source,
    },
  });

  // Invalidate feed so re-ranking excludes similar content
  await activityService.invalidateFeedCache(trackingId, redis);
};