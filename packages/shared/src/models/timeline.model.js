const mongoose = require('mongoose');
const { LANGUAGES } = require('../constants/categories.constant');

const TimelineSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: String,
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic' },

    coverImage: { url: String, key: String },
    coverColor: String,

    articles: [{
      articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
      addedAt: { type: Date, default: Date.now },
      // Timeline-specific short summary (different from article summary)
      timelineSummary: String,
      isKeyMoment: { type: Boolean, default: false },
      label: String, // e.g., "Day 1", "Week 3", "Breaking Update"
    }],

    totalArticles: { type: Number, default: 0 },
    category: String,
    language: { type: String, enum: LANGUAGES, default: 'en' },

    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isLive: { type: Boolean, default: true }, // Still ongoing

    followerCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },

    startDate: Date,
    endDate: Date,

    // Who manages this timeline
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['auto', 'curated'], default: 'curated' },

    // Auto-match keywords (for auto-type)
    autoMatchKeywords: [{ type: String, lowercase: true }],

    // Related timelines
    relatedTimelines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Timeline' }],
  },
  { timestamps: true }
);

TimelineSchema.index({ isActive: 1, isFeatured: -1, updatedAt: -1 });
TimelineSchema.index({ topic: 1 });
TimelineSchema.index({ slug: 1 }, { unique: true });
TimelineSchema.index({ isLive: 1, updatedAt: -1 });
TimelineSchema.index({ language: 1, isActive: 1 });

TimelineSchema.pre('save', function (next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
  }
  if (this.isModified('articles')) {
    this.totalArticles = this.articles.length;
  }
  next();
});

TimelineSchema.statics.getFeatured = function (language = 'en', limit = 5) {
  return this.find({ isActive: true, isFeatured: true, language })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .populate('topic', 'name slug image')
    .lean();
};

TimelineSchema.statics.getLive = function (language = 'en', limit = 10) {
  return this.find({ isActive: true, isLive: true, language })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('Timeline', TimelineSchema);