const { Topic, Article, UserActivity } = require('@readout/shared').models;
const activityService = require('./activity.service');
const logger = require('@readout/shared').utils.logger;

const TRENDING_TOPICS_TTL = 600; // 10 min

// ============================================
// TRENDING TOPICS
// ============================================

exports.getTrendingTopics = async (limit = 10, redis) => {
  const cacheKey = 'topics:trending';
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const topics = await Topic.getTrending(limit);

  await redis.setex(cacheKey, TRENDING_TOPICS_TTL, JSON.stringify(topics));
  return topics;
};

// ============================================
// TOPIC FEED
// ============================================

/**
 * Get articles for a specific topic
 * Matches by: topic reference, keywords, entities
 */
exports.getTopicFeed = async (topicId, page = 1, limit = 20) => {
  const topic = await Topic.findById(topicId).lean();
  if (!topic) return { topic: null, articles: [] };

  const orConditions = [
    { topics: topic._id },
  ];

  if (topic.keywords?.length) {
    orConditions.push({ tags: { $in: topic.keywords } });
  }
  if (topic.entities?.people?.length) {
    orConditions.push({ 'entities.people': { $in: topic.entities.people } });
  }
  if (topic.entities?.organizations?.length) {
    orConditions.push({ 'entities.organizations': { $in: topic.entities.organizations } });
  }

  const articles = await Article.find({
    status: 'published',
    $or: orConditions,
  })
    .sort({ publishedAt: -1 })
    .skip((page - 1) * limit).limit(limit)
    .select('-fullContent -aiMetadata.contentVector -moderation')
    .lean();

  return {
    topic: {
      id: topic._id,
      name: topic.name,
      slug: topic.slug,
      description: topic.description,
      image: topic.image,
      followerCount: topic.followerCount,
      articleCount: topic.articleCount,
      isTrending: topic.isTrending,
    },
    articles,
  };
};

// ============================================
// FOLLOW / UNFOLLOW
// ============================================

/**
 * Follow a topic — increments follower count and logs activity
 */
exports.followTopic = async (trackingId, topicId) => {
  await Topic.updateOne({ _id: topicId }, { $inc: { followerCount: 1 } });

  activityService.logActivity({
    userId: trackingId,
    action: 'topic_follow',
    metadata: { topicId },
  });

  return true;
};

/**
 * Unfollow a topic
 */
exports.unfollowTopic = async (trackingId, topicId) => {
  await Topic.updateOne(
    { _id: topicId, followerCount: { $gt: 0 } },
    { $inc: { followerCount: -1 } }
  );

  activityService.logActivity({
    userId: trackingId,
    action: 'topic_unfollow',
    metadata: { topicId },
  });

  return true;
};

// ============================================
// TOPIC SUGGESTIONS
// ============================================

/**
 * Suggest topics based on user's reading history
 */
exports.getSuggestionsForUser = async (trackingId, limit = 5) => {
  // Get user's top categories
  const catEngagement = await UserActivity.getCategoryEngagement(trackingId, 30);
  const topCategories = catEngagement.slice(0, 3).map(c => c._id);

  if (!topCategories.length) {
    // Cold start: return globally trending topics
    return Topic.getTrending(limit);
  }

  // Find topics in user's top categories that they haven't followed
  return Topic.find({
    category: { $in: topCategories },
    isActive: true,
    isTrending: true,
  })
    .sort({ trendingScore: -1 })
    .limit(limit)
    .lean();
};

// ============================================
// RECOMPUTE TRENDING TOPICS
// ============================================

/**
 * Recompute which topics are trending (called by cron/worker)
 * Based on article count and engagement in last 24h
 */
exports.recomputeTrending = async () => {
  const since = new Date(Date.now() - 24 * 3600000);

  const topics = await Topic.find({ isActive: true }).lean();
  let updated = 0;

  for (const topic of topics) {
    // Count recent articles matching this topic
    const orConditions = [{ topics: topic._id }];
    if (topic.keywords?.length) orConditions.push({ tags: { $in: topic.keywords } });

    const recentCount = await Article.countDocuments({
      status: 'published',
      publishedAt: { $gte: since },
      $or: orConditions,
    });

    // Compute trending score: recent articles * follower boost
    const followerBoost = Math.log10(Math.max(1, topic.followerCount)) / 5;
    const trendingScore = recentCount * (1 + followerBoost);
    const isTrending = recentCount >= 3; // At least 3 articles in 24h

    await Topic.updateOne({ _id: topic._id }, {
      $set: {
        trendingScore: Math.round(trendingScore * 100) / 100,
        isTrending,
        articleCount: topic.articleCount + recentCount,
        lastArticleAt: recentCount > 0 ? new Date() : topic.lastArticleAt,
      },
    });
    updated++;
  }

  logger.info(`[topic.service] Recomputed trending for ${updated} topics`);
  return updated;
};

// ============================================
// SEARCH TOPICS
// ============================================

exports.searchTopics = async (query, limit = 10) => {
  if (!query) return [];

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return Topic.find({
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { keywords: { $regex: escaped, $options: 'i' } },
    ],
    isActive: true,
  })
    .sort({ followerCount: -1 })
    .limit(limit)
    .lean();
};