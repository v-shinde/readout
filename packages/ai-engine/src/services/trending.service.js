const { Article, UserActivity } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

class TrendingEngine {
  // Recompute trending scores for all recent articles
  async recompute(language = 'en', hours = 24) {
    const since = new Date(Date.now() - hours * 3600000);
    const articles = await Article.find({
      status: 'published', language, publishedAt: { $gte: since },
    }).select('_id engagement publishedAt source sourceInfo').lean();

    let updated = 0;
    for (const article of articles) {
      const score = this._computeScore(article);
      await Article.updateOne({ _id: article._id }, {
        $set: { 'engagement.trendingScore': score, 'engagement.viralityScore': this._computeVirality(article) },
      });
      updated++;
    }

    logger.info(`[trending] Recomputed ${updated} articles for ${language}`);
    return updated;
  }

  _computeScore(article) {
    const eng = article.engagement || {};
    const ageHours = (Date.now() - new Date(article.publishedAt)) / 3600000;
    const gravity = 1.5;

    // Hacker News-style with engagement weighting
    const points = (eng.views || 0) * 0.1 + (eng.fullReads || 0) * 1 +
      (eng.shares || 0) * 3 + (eng.bookmarks || 0) * 2 +
      (eng.comments || 0) * 2 + this._totalReactions(eng) * 1.5;

    // Time decay: score / (age + 2)^gravity
    const score = points / Math.pow(ageHours + 2, gravity);

    // Source trust bonus
    const trustBonus = ((article.sourceInfo?.trustScore || 50) / 100) * 0.1;

    return Math.round((score + trustBonus) * 1000) / 1000;
  }

  _computeVirality(article) {
    const eng = article.engagement || {};
    const shares = eng.shares || 0;
    const views = Math.max(1, eng.views || 1);
    return Math.round((shares / views) * 10000) / 10000;
  }

  _totalReactions(eng) {
    const r = eng.reactions || {};
    return (r.like || 0) + (r.love || 0) + (r.wow || 0) + (r.sad || 0) + (r.angry || 0);
  }

  async getArticleScore(articleId) {
    const article = await Article.findById(articleId).select('engagement.trendingScore engagement.viralityScore engagement.engagementScore').lean();
    return article?.engagement || null;
  }
}

module.exports = TrendingEngine;
