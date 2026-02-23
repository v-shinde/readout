const mongoose = require('mongoose');
const { CATEGORIES, LANGUAGES } = require('../constants/categories.constant');

const SourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, unique: true, lowercase: true },
    description: String,
    logo: { url: String, key: String },
    website: { type: String, required: true },
    domain: { type: String, required: true, unique: true },

    // ---- FEED CONFIGURATION ----
    feeds: [{
      url: { type: String, required: true },
      type: { type: String, enum: ['rss', 'atom', 'api', 'scraper'], default: 'rss' },
      category: String,
      language: { type: String, default: 'en' },
      isActive: { type: Boolean, default: true },
      lastFetchedAt: Date,
      lastSuccessAt: Date,
      fetchIntervalMinutes: { type: Number, default: 15 },
      errorCount: { type: Number, default: 0 },
      consecutiveErrors: { type: Number, default: 0 },
      lastError: String,
      lastErrorAt: Date,
      articlesScraped: { type: Number, default: 0 },
      // Scraper config (for non-RSS sources)
      scraperConfig: {
        titleSelector: String,
        contentSelector: String,
        imageSelector: String,
        dateSelector: String,
        authorSelector: String,
        paginationSelector: String,
        waitForSelector: String,
        userAgent: String,
      },
      // API config
      apiConfig: {
        headers: { type: Map, of: String },
        queryParams: { type: Map, of: String },
        responseMapping: {
          articles: String,        // JSON path to articles array
          title: String,           // path within each article
          content: String,
          url: String,
          image: String,
          date: String,
          author: String,
        },
      },
    }],

    // ---- TRUST & QUALITY ----
    trustScore: { type: Number, min: 0, max: 100, default: 50 },
    biasRating: {
      type: String,
      enum: ['left', 'center-left', 'center', 'center-right', 'right', 'unrated'],
      default: 'unrated',
    },
    factCheckRating: {
      type: String,
      enum: ['high', 'mostly_factual', 'mixed', 'low', 'unrated'],
      default: 'unrated',
    },
    isVerified: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },

    // ---- CATEGORIES & LANGUAGES ----
    categories: [{ type: String, enum: CATEGORIES }],
    languages: [{ type: String, enum: LANGUAGES }],
    country: { type: String, default: 'IN' },
    region: String,

    // ---- STATS ----
    stats: {
      totalArticlesScraped: { type: Number, default: 0 },
      totalArticlesPublished: { type: Number, default: 0 },
      totalArticlesRejected: { type: Number, default: 0 },
      avgEngagementScore: { type: Number, default: 0 },
      avgAiConfidence: { type: Number, default: 0 },
      followerCount: { type: Number, default: 0 },
      lastArticleAt: Date,
    },

    // ---- RATE LIMITING ----
    rateLimiting: {
      maxRequestsPerMinute: { type: Number, default: 10 },
      maxArticlesPerFetch: { type: Number, default: 50 },
      respectRobotsTxt: { type: Boolean, default: true },
      crawlDelay: { type: Number, default: 1 }, // seconds between requests
    },

    // ---- STATUS ----
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 5, min: 1, max: 10 },
    pausedUntil: Date,
    pauseReason: String,

    // ---- CONTACT ----
    contact: {
      email: String,
      partnershipType: { type: String, enum: ['rss_free', 'api_partner', 'content_license', 'scrape_only'] },
      agreementDate: Date,
      notes: String,
    },
  },
  { timestamps: true }
);

// ============ INDEXES ============
SourceSchema.index({ isActive: 1, priority: 1 });
SourceSchema.index({ domain: 1 }, { unique: true });
SourceSchema.index({ categories: 1 });
SourceSchema.index({ trustScore: -1 });
SourceSchema.index({ 'feeds.isActive': 1, 'feeds.lastFetchedAt': 1 });
SourceSchema.index({ slug: 1 }, { unique: true });

// ============ PRE-SAVE ============
SourceSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  next();
});

// ============ STATICS ============
SourceSchema.statics.getActiveFeeds = function () {
  return this.find({
    isActive: true,
    $or: [{ pausedUntil: null }, { pausedUntil: { $lt: new Date() } }],
  }).sort({ priority: 1 }).lean();
};

SourceSchema.statics.recordFetchSuccess = async function (sourceId, feedUrl, articlesCount) {
  return this.updateOne(
    { _id: sourceId, 'feeds.url': feedUrl },
    {
      $set: {
        'feeds.$.lastFetchedAt': new Date(),
        'feeds.$.lastSuccessAt': new Date(),
        'feeds.$.consecutiveErrors': 0,
      },
      $inc: {
        'feeds.$.articlesScraped': articlesCount,
        'stats.totalArticlesScraped': articlesCount,
      },
    }
  );
};

SourceSchema.statics.recordFetchError = async function (sourceId, feedUrl, errorMsg) {
  const result = await this.findOneAndUpdate(
    { _id: sourceId, 'feeds.url': feedUrl },
    {
      $set: {
        'feeds.$.lastFetchedAt': new Date(),
        'feeds.$.lastError': errorMsg,
        'feeds.$.lastErrorAt': new Date(),
      },
      $inc: {
        'feeds.$.errorCount': 1,
        'feeds.$.consecutiveErrors': 1,
      },
    },
    { new: true }
  );

  // Auto-disable feed after 10 consecutive errors
  if (result) {
    const feed = result.feeds.find(f => f.url === feedUrl);
    if (feed?.consecutiveErrors >= 10) {
      await this.updateOne(
        { _id: sourceId, 'feeds.url': feedUrl },
        { $set: { 'feeds.$.isActive': false } }
      );
    }
  }
};

module.exports = mongoose.model('Source', SourceSchema);
