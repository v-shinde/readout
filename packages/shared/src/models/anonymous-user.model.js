const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const AnonymousUserSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    deviceType: { type: String, enum: ['ios', 'android', 'web'], required: true },
    fingerprint: {
      userAgent: String,
      screenResolution: String,
      timezone: String,
      language: String,
      platform: String,
    },
    appVersion: String,
    osVersion: String,

    preferences: {
      language: { type: String, enum: ['en', 'hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml'], default: 'en' },
      categories: [{ type: String }],
      theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
      fontSize: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
      feedType: { type: String, enum: ['personalized', 'trending', 'latest'], default: 'trending' },
    },

    personalization: {
      categoryScores: { type: Map, of: Number, default: new Map() },
      sourceScores: { type: Map, of: Number, default: new Map() },
      readingPatterns: {
        avgReadTimeSeconds: { type: Number, default: 0 },
        avgArticlesPerSession: { type: Number, default: 0 },
        preferredReadingHours: [{ type: Number }],
        swipePatterns: {
          skipRate: { type: Number, default: 0 },
          fullReadRate: { type: Number, default: 0 },
          shareRate: { type: Number, default: 0 },
        },
      },
      engagementProfile: {
        prefersShortContent: { type: Boolean, default: true },
        engagementLevel: { type: String, enum: ['low', 'medium', 'high', 'power_user'], default: 'low' },
      },
      coldStartPhase: { type: String, enum: ['BRAND_NEW', 'ONBOARDED', 'EARLY_EXPLORING', 'EXPLORING', 'WARMING', 'PERSONALIZED'], default: 'BRAND_NEW' },
      lastComputedAt: Date,
    },

    stats: {
      totalArticlesRead: { type: Number, default: 0 },
      totalReadTimeMinutes: { type: Number, default: 0 },
      totalShares: { type: Number, default: 0 },
      sessionsCount: { type: Number, default: 0 },
      firstSeenAt: { type: Date, default: Date.now },
      lastSeenAt: { type: Date, default: Date.now },
    },

    fcmToken: String,

    mergedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mergedAt: Date,
    isMerged: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AnonymousUserSchema.index({ deviceId: 1 }, { unique: true });
AnonymousUserSchema.index({ mergedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600, partialFilterExpression: { isMerged: true } });
AnonymousUserSchema.index({ 'stats.lastSeenAt': 1 }, { expireAfterSeconds: 90 * 24 * 3600, partialFilterExpression: { isMerged: false } });

AnonymousUserSchema.methods.generateAnonymousToken = function () {
  return jwt.sign({ id: this._id, type: 'anonymous', deviceId: this.deviceId }, process.env.JWT_SECRET, { expiresIn: '365d' });
};

AnonymousUserSchema.statics.findOrCreate = async function (deviceData) {
  let user = await this.findOne({ deviceId: deviceData.deviceId, isMerged: false });
  if (user) {
    user.stats.lastSeenAt = new Date();
    user.stats.sessionsCount += 1;
    await user.save();
    return { user, isNew: false };
  }
  user = await this.create({ ...deviceData, stats: { firstSeenAt: new Date(), lastSeenAt: new Date(), sessionsCount: 1 } });
  return { user, isNew: true };
};

AnonymousUserSchema.statics.mergeIntoUser = async function (anonymousId, userId) {
  const User = mongoose.model('User');
  const UserActivity = mongoose.model('UserActivity');
  const anonUser = await this.findById(anonymousId);
  if (!anonUser || anonUser.isMerged) throw new Error('Invalid anonymous user');
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Migrate preferences
  if (!user.preferences.categories?.length && anonUser.preferences.categories?.length) {
    user.preferences.categories = anonUser.preferences.categories;
  }
  // Migrate personalization scores
  for (const [cat, score] of (anonUser.personalization.categoryScores || new Map())) {
    const existing = user.personalization.categoryScores?.get(cat) || 0;
    user.personalization.categoryScores.set(cat, Math.max(existing, score));
  }
  // Migrate stats
  user.stats.totalArticlesRead += anonUser.stats.totalArticlesRead;
  user.stats.totalReadTimeMinutes += anonUser.stats.totalReadTimeMinutes;
  // Migrate FCM
  if (anonUser.fcmToken) {
    user.devices.push({ deviceId: anonUser.deviceId, deviceType: anonUser.deviceType, fcmToken: anonUser.fcmToken, isActive: true, lastActiveAt: new Date() });
  }
  await user.save();
  // Migrate activity records
  await UserActivity.updateMany({ userId: anonUser._id }, { $set: { userId: user._id } });
  // Mark merged
  anonUser.isMerged = true;
  anonUser.mergedToUserId = user._id;
  anonUser.mergedAt = new Date();
  await anonUser.save();
  return { user, migratedArticles: anonUser.stats.totalArticlesRead };
};

module.exports = mongoose.model('AnonymousUser', AnonymousUserSchema);
