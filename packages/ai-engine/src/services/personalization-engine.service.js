const { User, AnonymousUser, UserActivity, Article, FeedCache } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

const ACTIVITY_WEIGHTS = {
  read_full: 5.0, share: 4.0, bookmark: 3.5, comment: 3.0, reaction: 2.5,
  read_summary: 2.0, poll_vote: 2.0, view: 0.5, scroll_past: -0.5, not_interested: -5.0, hide_source: -10.0,
};
const FEED_WEIGHTS = { relevance: 0.35, recency: 0.25, engagement: 0.15, diversity: 0.10, source_trust: 0.10, editorial: 0.05 };
const HALF_LIFE_HOURS = 6;

class PersonalizationEngine {
  constructor(redis) { this.redis = redis; }

  async computeUserProfile(userId) {
    const [catEngagement, readingPattern, srcEngagement] = await Promise.all([
      UserActivity.getCategoryEngagement(userId, 30),
      UserActivity.getReadingPattern(userId, 30),
      UserActivity.getSourceEngagement(userId, 30),
    ]);

    // Compute category scores (0-1 normalized)
    const catScores = {};
    const maxCatActions = Math.max(1, ...catEngagement.map(c => c.totalActions));
    catEngagement.forEach(cat => {
      const weighted = (cat.reads * ACTIVITY_WEIGHTS.read_summary + cat.shares * ACTIVITY_WEIGHTS.share +
        cat.bookmarks * ACTIVITY_WEIGHTS.bookmark + cat.reactions * ACTIVITY_WEIGHTS.reaction);
      catScores[cat._id] = Math.min(1, weighted / (maxCatActions * 5));
    });

    // Compute source scores
    const srcScores = {};
    const maxSrcActions = Math.max(1, ...srcEngagement.map(s => s.totalActions));
    srcEngagement.forEach(src => {
      srcScores[src._id.toString()] = Math.min(1, src.totalActions / maxSrcActions);
    });

    // Peak reading hours
    const peakHours = readingPattern.sort((a, b) => b.count - a.count).slice(0, 4).map(h => h._id);

    // Update user document
    const update = {
      'personalization.categoryScores': catScores,
      'personalization.sourceScores': srcScores,
      'personalization.readingPatterns.preferredReadingHours': peakHours,
      'personalization.lastComputedAt': new Date(),
    };

    await User.updateOne({ _id: userId }, { $set: update });

    // Cache in Redis
    const profile = { catScores, srcScores, peakHours, computedAt: Date.now() };
    await this.redis.setex(`user:profile:${userId}`, 1800, JSON.stringify(profile));

    return profile;
  }

  async rankArticlesForUser(trackingId, articles, options = {}) {
    const { diversityFactor = 0.1 } = options;
    const profile = await this._getUserProfile(trackingId);
    const viewedSet = await this._getRecentlyViewed(trackingId);

    const scored = articles
      .filter(a => !viewedSet.has(a._id.toString()))
      .map(article => {
        const catScore = profile.catScores?.[article.category] || 0.3;
        const srcScore = profile.srcScores?.[article.source?.toString()] || 0.3;
        const relevance = 0.3 + catScore * 0.5 + srcScore * 0.2;

        const ageHours = (Date.now() - new Date(article.publishedAt)) / 3600000;
        const recency = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);

        const eng = article.engagement || {};
        const popularity = Math.log10(1 + (eng.views || 0) * 0.1 + (eng.fullReads || 0) + (eng.shares || 0) * 3 + (eng.bookmarks || 0) * 2) / 5;

        const trust = (article.sourceInfo?.trustScore || 50) / 100;

        let editorial = 0;
        if (article.isFeatured) editorial += 0.3;
        if (article.isBreaking) editorial += 0.5;
        if (article.priority === 'high') editorial += 0.2;

        const finalScore =
          relevance * FEED_WEIGHTS.relevance +
          recency * FEED_WEIGHTS.recency +
          popularity * FEED_WEIGHTS.engagement +
          trust * FEED_WEIGHTS.source_trust +
          editorial * FEED_WEIGHTS.editorial;

        return { article, score: finalScore };
      });

    scored.sort((a, b) => b.score - a.score);

    // Apply diversity
    return this._applyDiversity(scored, diversityFactor).map(s => s.article);
  }

  async trackAction(userId, articleId, action, metadata) {
    UserActivity.logActivity({ userId, articleId, action, metadata });
    if (articleId) {
      await this.redis.hincrby(`article:engagement:${articleId}`, action, 1);
      await this.redis.expire(`article:engagement:${articleId}`, 3600);
      await this.redis.sadd(`user:viewed:${userId}`, articleId.toString());
      await this.redis.expire(`user:viewed:${userId}`, 86400);
    }
    if (['not_interested', 'hide_source', 'mute_topic'].includes(action)) {
      await this.redis.del(`user:feed:${userId}`);
      await this.redis.del(`user:profile:${userId}`);
      await FeedCache.invalidate(userId);
    }
  }

  async _getUserProfile(trackingId) {
    const cached = await this.redis.get(`user:profile:${trackingId}`);
    if (cached) return JSON.parse(cached);
    const user = await User.findById(trackingId).select('personalization').lean()
      || await AnonymousUser.findById(trackingId).select('personalization').lean();
    if (!user) return { catScores: {}, srcScores: {}, peakHours: [] };
    const profile = {
      catScores: Object.fromEntries(user.personalization?.categoryScores || new Map()),
      srcScores: Object.fromEntries(user.personalization?.sourceScores || new Map()),
      peakHours: user.personalization?.readingPatterns?.preferredReadingHours || [],
    };
    await this.redis.setex(`user:profile:${trackingId}`, 1800, JSON.stringify(profile));
    return profile;
  }

  async _getRecentlyViewed(trackingId) {
    const viewed = await this.redis.smembers(`user:viewed:${trackingId}`);
    return new Set(viewed);
  }

  _applyDiversity(scored, maxCategoryPct = 0.4) {
    const result = [];
    const catCounts = {};
    const maxPerCat = Math.ceil(scored.length * maxCategoryPct);
    for (const item of scored) {
      const cat = item.article.category;
      catCounts[cat] = (catCounts[cat] || 0) + 1;
      if (catCounts[cat] <= maxPerCat) result.push(item);
      else { item.score *= 0.5; result.push(item); }
    }
    result.sort((a, b) => b.score - a.score);
    return result;
  }
}

module.exports = PersonalizationEngine;
