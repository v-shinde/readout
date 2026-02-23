const { Article, AnonymousUser, User } = require('@readout/shared').models;
const { CATEGORIES, DEFAULT_CATEGORIES } = require('@readout/shared').constants;
const logger = require('@readout/shared').utils.logger;

class ColdStartEngine {
  constructor(personalizationEngine, redis) {
    this.personalizationEngine = personalizationEngine;
    this.redis = redis;
  }

  getUserPhase(userOrAnon) {
    const interactions = userOrAnon.stats?.totalArticlesRead || 0;
    const hasCategories = userOrAnon.preferences?.categories?.length > 0;
    if (interactions === 0 && !hasCategories) return 'BRAND_NEW';
    if (interactions === 0 && hasCategories) return 'ONBOARDED';
    if (interactions < 20) return 'EARLY_EXPLORING';
    if (interactions < 50) return 'EXPLORING';
    if (interactions < 100) return 'WARMING';
    return 'PERSONALIZED';
  }

  async buildFeed(trackingId, isAnonymous, options = {}) {
    const { page = 1, limit = 20, language = 'en', category = null } = options;
    const mongoose = require('mongoose');
    const Model = isAnonymous ? AnonymousUser : User;
    const user = await Model.findById(trackingId).lean();
    if (!user) return this._globalTrending(language, limit);
    if (category) return this._categoryFeed(category, language, page, limit);

    const phase = this.getUserPhase(user);
    logger.info(`[cold-start] phase=${phase} id=${trackingId} anon=${isAnonymous}`);

    switch (phase) {
      case 'BRAND_NEW': return this._brandNewFeed(user, language, limit);
      case 'ONBOARDED': return this._onboardedFeed(user, language, limit);
      case 'EARLY_EXPLORING': return this._earlyExploringFeed(user, trackingId, language, limit);
      case 'EXPLORING': return this._exploringFeed(user, trackingId, language, limit);
      case 'WARMING':
        const candidates = await this._getCandidates(language, 200);
        return this.personalizationEngine.rankArticlesForUser(trackingId, candidates, { diversityFactor: 0.15 });
      case 'PERSONALIZED':
        const pool = await this._getCandidates(language, 200);
        return this.personalizationEngine.rankArticlesForUser(trackingId, pool, { diversityFactor: 0.1 });
      default: return this._globalTrending(language, limit);
    }
  }

  async _brandNewFeed(user, language, limit) {
    const lang = user.fingerprint?.language?.startsWith('hi') ? 'hi' : language;
    const [trending, breaking] = await Promise.all([
      Article.getTrending({ language: lang, limit: Math.ceil(limit * 0.7) }),
      Article.getBreaking(lang, 3),
    ]);
    return [...breaking, ...trending].slice(0, limit);
  }

  async _onboardedFeed(user, language, limit) {
    const cats = user.preferences?.categories || DEFAULT_CATEGORIES;
    const [catArticles, trending] = await Promise.all([
      Article.find({ status: 'published', language, category: { $in: cats }, publishedAt: { $gte: new Date(Date.now() - 48 * 3600000) } })
        .sort({ publishedAt: -1 }).limit(Math.ceil(limit * 0.7)).select('-fullContent -aiMetadata.contentVector -moderation').lean(),
      Article.getTrending({ language, limit: Math.ceil(limit * 0.4) }),
    ]);
    return this._interleave(catArticles, trending, 0.6).slice(0, limit);
  }

  async _earlyExploringFeed(user, trackingId, language, limit) {
    const candidates = await this._getCandidates(language, 100);
    const viewed = await this._getViewed(trackingId);
    const catScores = user.personalization?.categoryScores || {};
    const selectedCats = user.preferences?.categories || [];

    const scored = candidates.filter(a => !viewed.has(a._id.toString())).map(a => {
      let s = (catScores[a.category] || 0) * 0.3 + (selectedCats.includes(a.category) ? 0.2 : 0);
      s += Math.max(0, 1 - (Date.now() - new Date(a.publishedAt)) / 86400000) * 0.3;
      s += Math.log10(1 + (a.engagement?.views || 0)) / 25;
      return { article: a, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    const diversified = this._applyDiversity(scored, 0.4);
    const main = diversified.slice(0, limit - 2).map(s => s.article);
    const explore = this._randomSample(diversified.slice(limit - 2), 2).map(s => s.article);
    return [...main, ...explore];
  }

  async _exploringFeed(user, trackingId, language, limit) {
    const candidates = await this._getCandidates(language, 150);
    const viewed = await this._getViewed(trackingId);
    const catScores = user.personalization?.categoryScores || {};
    const srcScores = user.personalization?.sourceScores || {};

    const scored = candidates.filter(a => !viewed.has(a._id.toString())).map(a => {
      let s = (catScores[a.category] || 0.3) * 0.35;
      s += (srcScores[a.source?.toString()] || 0.3) * 0.15;
      s += Math.pow(0.5, (Date.now() - new Date(a.publishedAt)) / 3600000 / 8) * 0.25;
      s += Math.log10(1 + (a.engagement?.views || 0)) / 25;
      if (a.isBreaking) s += 0.1;
      return { article: a, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    return this._applyDiversity(scored, 0.25).slice(0, limit).map(s => s.article);
  }

  async _getCandidates(lang, limit) {
    const key = `candidates:${lang}:${limit}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
    const arts = await Article.find({ status: 'published', language: lang, publishedAt: { $gte: new Date(Date.now() - 72 * 3600000) } })
      .sort({ publishedAt: -1 }).limit(limit).select('-fullContent -aiMetadata.contentVector -moderation').lean();
    await this.redis.setex(key, 300, JSON.stringify(arts));
    return arts;
  }

  async _globalTrending(lang, limit) { return Article.getTrending({ language: lang, limit }); }
  async _categoryFeed(cat, lang, page, limit) {
    return Article.getPublishedFeed({ language: lang, category: cat }, page, limit);
  }
  async _getViewed(id) { return new Set(await this.redis.smembers(`user:viewed:${id}`)); }

  _interleave(a, b, ratio = 0.6) {
    const r = []; let ai = 0, bi = 0;
    const seen = new Set();
    for (let i = 0; i < a.length + b.length; i++) {
      const src = Math.random() < ratio ? a : b;
      const idx = src === a ? ai : bi;
      if (idx < src.length) {
        const id = src[idx]._id.toString();
        if (!seen.has(id)) { r.push(src[idx]); seen.add(id); }
        if (src === a) ai++; else bi++;
      }
    }
    return r;
  }
  _applyDiversity(scored, maxPct) {
    const r = []; const cc = {}; const max = Math.ceil(scored.length * maxPct);
    for (const i of scored) { const c = i.article.category; cc[c] = (cc[c] || 0) + 1; if (cc[c] > max) i.score *= 0.5; r.push(i); }
    r.sort((a, b) => b.score - a.score); return r;
  }
  _randomSample(arr, n) { return [...arr].sort(() => 0.5 - Math.random()).slice(0, n); }
}

module.exports = ColdStartEngine;