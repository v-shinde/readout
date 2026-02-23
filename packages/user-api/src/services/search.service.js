const { Article, Topic } = require('@readout/shared').models;
const activityService = require('./activity.service');
const logger = require('@readout/shared').utils.logger;

const TRENDING_QUERIES_KEY = 'search:trending';
const TRENDING_QUERIES_TTL = 86400;   // 24 hours
const SUGGESTIONS_CACHE_TTL = 600;    // 10 min

// ============================================
// SEARCH EXECUTION
// ============================================

/**
 * Execute full-text search with tracking and trending aggregation
 */
exports.searchArticles = async (query, options, trackingId, redis) => {
  const { language = 'en', category, page = 1, limit = 20 } = options;

  const filter = {
    $text: { $search: query },
    status: 'published',
    language,
  };
  if (category) filter.category = category;

  const [articles, total] = await Promise.all([
    Article.find(filter)
      .select({ score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .skip((page - 1) * limit).limit(limit)
      .select('-fullContent -aiMetadata.contentVector -moderation')
      .lean(),
    Article.countDocuments(filter),
  ]);

  // Track search activity
  activityService.logActivity({
    userId: trackingId,
    action: 'search',
    metadata: { searchQuery: query, searchResultCount: total },
  });

  // Store in trending queries (sorted set)
  await redis.zincrby(TRENDING_QUERIES_KEY, 1, query.toLowerCase());
  await redis.expire(TRENDING_QUERIES_KEY, TRENDING_QUERIES_TTL);

  return { articles, total };
};

// ============================================
// SEARCH SUGGESTIONS (autocomplete)
// ============================================

/**
 * Get search suggestions based on partial query
 */
exports.getSuggestions = async (query, redis) => {
  if (!query || query.length < 1) return [];

  const cacheKey = `search:suggest:${query.toLowerCase().slice(0, 6)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Parallel: search tags + topics + entities
  const [tagResults, topicResults, personResults] = await Promise.all([
    Article.distinct('tags', {
      tags: { $regex: `^${_escapeRegex(query)}`, $options: 'i' },
      status: 'published',
    }),
    Topic.find({
      name: { $regex: _escapeRegex(query), $options: 'i' },
      isActive: true,
    }).select('name slug image followerCount').limit(5).lean(),
    Article.distinct('entities.people', {
      'entities.people': { $regex: _escapeRegex(query), $options: 'i' },
      status: 'published',
    }),
  ]);

  const suggestions = [
    ...topicResults.map(t => ({ type: 'topic', text: t.name, slug: t.slug, image: t.image?.url, followers: t.followerCount })),
    ...personResults.slice(0, 3).map(p => ({ type: 'person', text: p })),
    ...tagResults.slice(0, 5).map(t => ({ type: 'tag', text: t })),
  ];

  const deduped = _deduplicate(suggestions, 'text').slice(0, 10);

  await redis.setex(cacheKey, SUGGESTIONS_CACHE_TTL, JSON.stringify(deduped));

  return deduped;
};

// ============================================
// TRENDING QUERIES
// ============================================

/**
 * Get trending search queries (last 24h)
 */
exports.getTrendingQueries = async (redis, limit = 10) => {
  const results = await redis.zrevrange(TRENDING_QUERIES_KEY, 0, limit - 1, 'WITHSCORES');

  const trending = [];
  for (let i = 0; i < results.length; i += 2) {
    trending.push({ query: results[i], score: +results[i + 1] });
  }

  return trending;
};

/**
 * Clear expired trending queries (keep only top N)
 */
exports.cleanupTrendingQueries = async (redis, keepTop = 100) => {
  const total = await redis.zcard(TRENDING_QUERIES_KEY);
  if (total > keepTop) {
    await redis.zremrangebyrank(TRENDING_QUERIES_KEY, 0, total - keepTop - 1);
  }
};

// ============================================
// SEARCH TOPICS
// ============================================

exports.searchTopics = async (query, limit = 10) => {
  if (!query) return [];

  return Topic.find({
    $or: [
      { name: { $regex: _escapeRegex(query), $options: 'i' } },
      { keywords: { $regex: _escapeRegex(query), $options: 'i' } },
    ],
    isActive: true,
  })
    .sort({ followerCount: -1 })
    .limit(limit)
    .lean();
};

// ============================================
// HELPERS
// ============================================

function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _deduplicate(arr, key) {
  const seen = new Set();
  return arr.filter(item => {
    const val = item[key]?.toLowerCase();
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}