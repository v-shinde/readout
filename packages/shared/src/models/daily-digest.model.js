const mongoose = require('mongoose');
const { LANGUAGES } = require('../constants/categories.constant');

const DailyDigestSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    language: { type: String, enum: LANGUAGES, default: 'en' },

    // Curated top stories
    stories: [{
      articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
      rank: Number,
      // Denormalized for fast read (no populate needed)
      title: String,
      summary: String,
      thumbnail: String,
      category: String,
      sourceName: String,
      publishedAt: Date,
      engagementScore: Number,
    }],

    totalStories: { type: Number, default: 0 },

    // Category breakdown
    categoryBreakdown: { type: Map, of: Number },

    // Stats
    stats: {
      sentTo: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      openRate: { type: Number, default: 0 },
    },

    // Publishing
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    isNotificationSent: { type: Boolean, default: false },
    notificationSentAt: Date,

    // Who curated (null = auto-generated)
    curatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    generationType: { type: String, enum: ['auto', 'curated', 'hybrid'], default: 'auto' },

    // Headline / theme for the digest
    headline: String,
    subHeadline: String,
  },
  { timestamps: true }
);

DailyDigestSchema.index({ date: -1, language: 1 }, { unique: true });
DailyDigestSchema.index({ isPublished: 1, date: -1 });

// ============ PRE-SAVE ============
DailyDigestSchema.pre('save', function (next) {
  this.totalStories = this.stories.length;
  // Compute category breakdown
  const breakdown = {};
  this.stories.forEach(s => {
    breakdown[s.category] = (breakdown[s.category] || 0) + 1;
  });
  this.categoryBreakdown = breakdown;
  next();
});

// ============ STATICS ============
DailyDigestSchema.statics.getToday = function (language = 'en') {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return this.findOne({ date: today, language, isPublished: true }).lean();
};

DailyDigestSchema.statics.getRecent = function (language = 'en', limit = 7) {
  return this.find({ language, isPublished: true })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
};

DailyDigestSchema.statics.createOrUpdate = async function (date, language, stories, options = {}) {
  const dateNorm = new Date(date); dateNorm.setHours(0, 0, 0, 0);
  return this.findOneAndUpdate(
    { date: dateNorm, language },
    {
      $set: {
        stories,
        headline: options.headline,
        subHeadline: options.subHeadline,
        curatedBy: options.curatedBy,
        generationType: options.generationType || 'auto',
      },
    },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('DailyDigest', DailyDigestSchema);