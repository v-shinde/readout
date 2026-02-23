const mongoose = require('mongoose');
const slugify = require('slug');
const crypto = require('crypto');
const { CATEGORIES, LANGUAGES } = require('../constants/categories.constant');

const ArticleSchema = new mongoose.Schema(
  {
    // ---- CONTENT ----
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 300 },
    slug: { type: String, unique: true },
    summary: { type: String, required: [true, 'Summary is required'], maxlength: 500 },
    summaryWordCount: { type: Number, default: 60 },
    fullContent: { type: String, maxlength: 50000 },
    sourceUrl: { type: String, required: [true, 'Source URL is required'] },
    sourceUrlHash: { type: String, unique: true },

    // ---- MEDIA ----
    media: {
      thumbnail: {
        url: String, key: String, width: Number, height: Number,
        alt: String, blurhash: String,
      },
      images: [{ url: String, key: String, caption: String, width: Number, height: Number }],
      video: {
        url: String, thumbnailUrl: String, duration: Number,
        type: { type: String, enum: ['youtube', 'mp4', 'hls'] },
      },
      primaryType: { type: String, enum: ['image', 'video', 'gallery', 'none'], default: 'image' },
    },

    // ---- CATEGORIZATION ----
    category: { type: String, required: [true, 'Category is required'], enum: CATEGORIES, index: true },
    subCategory: { type: String, trim: true },
    tags: [{ type: String, lowercase: true, trim: true }],
    entities: {
      people: [String],
      organizations: [String],
      locations: [String],
      events: [String],
    },
    topics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],

    // ---- SOURCE ----
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', required: true, index: true },
    sourceInfo: { name: String, logo: String, domain: String, trustScore: Number },

    // ---- AUTHOR / EDITOR ----
    originalAuthor: { type: String, trim: true },
    editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    aiModel: {
      model: { type: String, default: 'gpt-4o-mini' },
      version: String,
      confidence: { type: Number, min: 0, max: 1 },
      generatedAt: Date,
    },

    // ---- PUBLISHING ----
    status: {
      type: String,
      enum: ['draft', 'ai_generated', 'in_review', 'published', 'archived', 'rejected'],
      default: 'ai_generated', index: true,
    },
    publishedAt: { type: Date, index: true },
    originalPublishedAt: Date,
    expiresAt: Date,
    priority: { type: String, enum: ['breaking', 'high', 'normal', 'low'], default: 'normal', index: true },
    isBreaking: { type: Boolean, default: false, index: true },
    isFeatured: { type: Boolean, default: false },

    // ---- LANGUAGE ----
    language: { type: String, enum: LANGUAGES, default: 'en', index: true },

    // ---- ENGAGEMENT METRICS ----
    engagement: {
      views: { type: Number, default: 0 },
      uniqueViews: { type: Number, default: 0 },
      fullReads: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      bookmarks: { type: Number, default: 0 },
      reactions: {
        like: { type: Number, default: 0 },
        love: { type: Number, default: 0 },
        wow: { type: Number, default: 0 },
        sad: { type: Number, default: 0 },
        angry: { type: Number, default: 0 },
      },
      comments: { type: Number, default: 0 },
      engagementScore: { type: Number, default: 0 },
      trendingScore: { type: Number, default: 0 },
      viralityScore: { type: Number, default: 0 },
    },

    // ---- POLL ----
    poll: {
      isActive: { type: Boolean, default: false },
      question: String,
      options: [{ text: String, votes: { type: Number, default: 0 } }],
      totalVotes: { type: Number, default: 0 },
      expiresAt: Date,
    },

    // ---- AI PERSONALIZATION METADATA ----
    aiMetadata: {
      contentVector: { type: [Number], default: [] },
      sentiment: {
        score: { type: Number, min: -1, max: 1 },
        label: { type: String, enum: ['positive', 'neutral', 'negative', 'mixed'] },
      },
      readability: { fleschScore: Number, gradeLevel: Number, avgSentenceLength: Number },
      complexity: { type: String, enum: ['simple', 'moderate', 'complex'], default: 'moderate' },
      topicDistribution: { type: Map, of: Number },
      freshnessScore: { type: Number, default: 1.0 },
      qualityScore: { type: Number, min: 0, max: 1, default: 0.5 },
    },

    // ---- TIMELINE ----
    timeline: {
      isPartOfTimeline: { type: Boolean, default: false },
      timelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Timeline' },
      sequenceNumber: Number,
    },

    // ---- SEO ----
    seo: { metaTitle: String, metaDescription: String, ogImage: String, canonicalUrl: String },

    // ---- FLAGS ----
    flags: {
      isSponsored: { type: Boolean, default: false },
      isAd: { type: Boolean, default: false },
      isEditorial: { type: Boolean, default: false },
      isExclusive: { type: Boolean, default: false },
      hasExplicitContent: { type: Boolean, default: false },
      isFactChecked: { type: Boolean, default: false },
      requiresSubscription: { type: Boolean, default: false },
    },

    // ---- MODERATION ----
    moderation: {
      status: { type: String, enum: ['clean', 'flagged', 'under_review', 'blocked'], default: 'clean' },
      reports: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: String,
        reportedAt: { type: Date, default: Date.now },
      }],
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: Date,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ============ INDEXES ============
ArticleSchema.index({ status: 1, publishedAt: -1 });
ArticleSchema.index({ status: 1, category: 1, publishedAt: -1 });
ArticleSchema.index({ status: 1, language: 1, publishedAt: -1 });
ArticleSchema.index({ status: 1, language: 1, category: 1, publishedAt: -1 });
ArticleSchema.index({ 'engagement.trendingScore': -1 });
ArticleSchema.index({ 'engagement.engagementScore': -1 });
ArticleSchema.index({ isBreaking: 1, publishedAt: -1 });
ArticleSchema.index({ tags: 1 });
ArticleSchema.index({ title: 'text', summary: 'text', tags: 'text' });
ArticleSchema.index({ 'entities.people': 1 });
ArticleSchema.index({ 'entities.organizations': 1 });
ArticleSchema.index({ sourceUrlHash: 1 }, { unique: true });
ArticleSchema.index({ 'timeline.timelineId': 1, 'timeline.sequenceNumber': 1 });
ArticleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ArticleSchema.index({ 'flags.isSponsored': 1, status: 1 });

// ============ PRE-SAVE ============
ArticleSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = slugify(this.title, { lower: true }) + '-' + Date.now().toString(36);
  }
  if (this.isModified('summary')) {
    this.summaryWordCount = this.summary.split(/\s+/).filter(Boolean).length;
  }
  if (this.isModified('sourceUrl')) {
    this.sourceUrlHash = crypto.createHash('sha256').update(this.sourceUrl).digest('hex');
  }
  next();
});

// ============ STATICS ============
ArticleSchema.statics.getPublishedFeed = function (filters = {}, page = 1, limit = 20) {
  const query = { status: 'published' };
  if (filters.language) query.language = filters.language;
  if (filters.category) query.category = filters.category;
  if (filters.excludeIds?.length) query._id = { $nin: filters.excludeIds };
  return this.find(query).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit)
    .select('-fullContent -aiMetadata.contentVector -moderation').lean();
};

ArticleSchema.statics.getTrending = function (opts = {}) {
  const { limit = 20, language = 'en', hours = 24 } = opts;
  return this.find({
    status: 'published', language,
    publishedAt: { $gte: new Date(Date.now() - hours * 3600000) },
  }).sort({ 'engagement.trendingScore': -1 }).limit(limit)
    .select('-fullContent -aiMetadata.contentVector -moderation').lean();
};

ArticleSchema.statics.getBreaking = function (language = 'en', limit = 5) {
  return this.find({
    status: 'published', language, isBreaking: true,
    publishedAt: { $gte: new Date(Date.now() - 6 * 3600000) },
  }).sort({ publishedAt: -1 }).limit(limit)
    .select('-fullContent -aiMetadata.contentVector -moderation').lean();
};

ArticleSchema.statics.search = function (q, language = 'en', page = 1, limit = 20) {
  return this.find({ $text: { $search: q }, status: 'published', language })
    .select({ score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } })
    .skip((page - 1) * limit).limit(limit)
    .select('-fullContent -aiMetadata.contentVector -moderation').lean();
};

// ============ VIRTUALS ============
ArticleSchema.virtual('isRecent').get(function () {
  return (Date.now() - this.publishedAt) / 3600000 < 6;
});
ArticleSchema.virtual('readTime').get(function () {
  if (!this.fullContent) return '< 1 min';
  return `${Math.ceil(this.fullContent.split(/\s+/).length / 200)} min read`;
});
ArticleSchema.virtual('totalReactions').get(function () {
  const r = this.engagement?.reactions || {};
  return (r.like || 0) + (r.love || 0) + (r.wow || 0) + (r.sad || 0) + (r.angry || 0);
});

module.exports = mongoose.model('Article', ArticleSchema);