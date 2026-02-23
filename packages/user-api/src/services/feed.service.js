const { Article, FeedCache, User, AnonymousUser } = require('@readout/shared').models;
const { CATEGORIES, DEFAULT_CATEGORIES } = require('@readout/shared').constants;
const logger = require('@readout/shared').utils.logger;
const axios = require('axios');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:5002';
const TRENDING_CACHE_TTL = 300;     // 5 min
const BREAKING_CACHE_TTL = 120;     // 2 min
const EXPLORE_CACHE_TTL = 600;      // 10 min

// ============================================
// PERSONALIZED FEED
// ============================================

/**
 * Get personalized feed for a user (anonymous or registered).
 * Flow: check FeedCache → call AI engine → fallback to trending
 */
exports.getPersonalizedFeed = async (trackingId, isAnonymous, options, redis) => {
  const { page = 1, limit = 20, language = 'en' } = options;

  // 1. Check MongoDB feed cache (cursor-based)
  const cached = await FeedCache.getOrNull(trackingId, 'personalized');
  if (cached && cached.cursor < cached.totalArticles) {
    const start = cached.cursor;
    const ids = cached.articleIds.slice(start, start + limit);

    await FeedCache.advanceCursor(trackingId, 'personalized', null, limit);

    return _hydrateArticleIds(ids);
  }

  // 2. Call AI engine for a fresh ranking
  try {
    const response = await axios.post(
      `${AI_ENGINE_URL}/ai/v1/personalize/rank`,
      { trackingId, isAnonymous, language, limit: Math.min(limit * 5, 100) },
      { timeout: 5000 }
    );

    const ranked = response.data?.data?.articles || [];

    // 3. Cache the ranked feed for subsequent pages
    if (ranked.length > 0) {
      const startTime = Date.now();
      await FeedCache.setCache(trackingId, 'personalized', {
        articleIds: ranked.map(a => a._id),
        language,
        isAnonymous,
        coldStartPhase: response.data?.data?.coldStartPhase,
        computeTimeMs: Date.now() - startTime,
      });
    }

    return ranked.slice(0, limit);
  } catch (err) {
    logger.error(`[feed.service] AI engine failed: ${err.message}, falling back to trending`);
    return exports.getTrending(language, limit, 24, redis);
  }
};

/**
 * Get next page for infinite scroll (cursor-based)
 */
exports.getNextPersonalized = async (trackingId, isAnonymous, options, redis) => {
  const { limit = 20, language = 'en', cursor } = options;

  // Try to serve from cache
  const cached = await FeedCache.getOrNull(trackingId, 'personalized');
  if (cached && cached.cursor < cached.totalArticles) {
    const start = cached.cursor;
    const ids = cached.articleIds.slice(start, start + limit);
    await FeedCache.advanceCursor(trackingId, 'personalized', null, limit);
    return _hydrateArticleIds(ids);
  }

  // Cache exhausted — invalidate and get fresh
  await FeedCache.invalidate(trackingId, 'personalized');
  return exports.getPersonalizedFeed(trackingId, isAnonymous, { limit, language }, redis);
};

// ============================================
// TRENDING FEED
// ============================================

exports.getTrending = async (language, limit = 20, hours = 24, redis) => {
  const cacheKey = `feed:trending:${language}:${hours}`;

  // Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const articles = await Article.getTrending({ limit, language, hours });

  await redis.setex(cacheKey, TRENDING_CACHE_TTL, JSON.stringify(articles));
  return articles;
};

// ============================================
// BREAKING NEWS
// ============================================

exports.getBreaking = async (language, redis) => {
  const cacheKey = `feed:breaking:${language}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const articles = await Article.getBreaking(language, 10);

  await redis.setex(cacheKey, BREAKING_CACHE_TTL, JSON.stringify(articles));
  return articles;
};

// ============================================
// EXPLORE FEED (high-diversity)
// ============================================

exports.getExploreFeed = async (language, limit = 20, redis) => {
  const cacheKey = `feed:explore:${language}`;

  // Short cache for explore (we want freshness but not spamming DB)
  const cached = await redis.get(cacheKey);
  if (cached) {
    const articles = JSON.parse(cached);
    // Shuffle each time for variety even from cache
    return _shuffle(articles).slice(0, limit);
  }

  // Fetch 2-3 per category for max diversity
  const perCategory = Math.max(2, Math.ceil(limit / CATEGORIES.length));
  const since = new Date(Date.now() - 48 * 3600000); // last 48 hours

  const pipeline = CATEGORIES.map(cat =>
    Article.find({
      status: 'published', language, category: cat,
      publishedAt: { $gte: since },
    })
      .sort({ 'engagement.trendingScore': -1 })
      .limit(perCategory)
      .select('-fullContent -aiMetadata.contentVector -moderation')
      .lean()
  );

  const results = await Promise.all(pipeline);
  let articles = results.flat();

  // Shuffle
  articles = _shuffle(articles);

  // Cache the full pool (we'll shuffle again on read)
  await redis.setex(cacheKey, EXPLORE_CACHE_TTL, JSON.stringify(articles));

  return articles.slice(0, limit);
};

// ============================================
// CATEGORY FEED WITH SMART SORT
// ============================================

exports.getCategoryFeed = async (category, language, page, limit, redis) => {
  const cacheKey = `feed:category:${category}:${language}:${page}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const articles = await Article.getPublishedFeed({ language, category }, page, limit);

  // Short cache for category feeds
  await redis.setex(cacheKey, 180, JSON.stringify(articles)); // 3 min

  return articles;
};

// ============================================
// HELPERS
// ============================================

async function _hydrateArticleIds(ids) {
  if (!ids.length) return [];

  const articles = await Article.find({ _id: { $in: ids } })
    .select('-fullContent -aiMetadata.contentVector -moderation')
    .lean();

  // Maintain the ranked order from the cache
  const map = new Map(articles.map(a => [a._id.toString(), a]));
  return ids.map(id => map.get(id.toString())).filter(Boolean);
}

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}