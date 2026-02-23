const mongoose = require('mongoose');
const { LANGUAGES } = require('../constants/categories.constant');

const FeedCacheSchema = new mongoose.Schema(
  {
    // Can be userId or anonymousUserId
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    isAnonymous: { type: Boolean, default: false },

    feedType: {
      type: String,
      enum: ['personalized', 'trending', 'category', 'for_you', 'breaking', 'explore'],
      required: true,
    },
    category: String,
    language: { type: String, enum: LANGUAGES, default: 'en' },

    // Pre-computed ordered article IDs
    articleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],

    // Detailed scores for debugging/tuning
    scores: [{
      articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
      relevanceScore: Number,
      recencyScore: Number,
      engagementScore: Number,
      diversityPenalty: Number,
      sourceTrustScore: Number,
      editorialBoost: Number,
      finalScore: Number,
    }],

    // How many articles user has consumed from this cache
    cursor: { type: Number, default: 0 },

    // Cache metadata
    computedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    version: { type: Number, default: 1 },
    totalArticles: { type: Number, default: 0 },

    // Personalization model version used
    modelVersion: String,
    coldStartPhase: String,

    // Performance tracking
    computeTimeMs: Number,
  },
  { timestamps: true }
);

FeedCacheSchema.index({ userId: 1, feedType: 1, category: 1 }, { unique: true });
FeedCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============ PRE-SAVE ============
FeedCacheSchema.pre('save', function (next) {
  this.totalArticles = this.articleIds.length;
  next();
});

// ============ STATICS ============
FeedCacheSchema.statics.getOrNull = async function (userId, feedType, category = null) {
  const query = { userId, feedType };
  if (category) query.category = category;
  const cache = await this.findOne(query).lean();
  if (!cache) return null;
  // Check if expired (belt + suspenders with TTL index)
  if (cache.expiresAt < new Date()) return null;
  return cache;
};

FeedCacheSchema.statics.setCache = async function (userId, feedType, data) {
  const {
    articleIds, scores, language, category, modelVersion,
    coldStartPhase, computeTimeMs, isAnonymous,
  } = data;

  const ttlMinutes = feedType === 'breaking' ? 2 : feedType === 'trending' ? 5 : 15;

  return this.findOneAndUpdate(
    { userId, feedType, category: category || null },
    {
      $set: {
        articleIds,
        scores,
        language,
        isAnonymous: isAnonymous || false,
        modelVersion,
        coldStartPhase,
        computeTimeMs,
        computedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlMinutes * 60000),
        cursor: 0,
        version: 1,
      },
    },
    { upsert: true, new: true }
  );
};

FeedCacheSchema.statics.advanceCursor = async function (userId, feedType, category, count) {
  return this.updateOne(
    { userId, feedType, category: category || null },
    { $inc: { cursor: count } }
  );
};

FeedCacheSchema.statics.invalidate = async function (userId, feedType = null) {
  const query = { userId };
  if (feedType) query.feedType = feedType;
  return this.deleteMany(query);
};

module.exports = mongoose.model('FeedCache', FeedCacheSchema);