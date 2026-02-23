const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, sparse: true, trim: true },
    password: { type: String, minlength: 6, select: false },
    avatar: { url: String, key: String },
    authProvider: { type: String, enum: ['local', 'google', 'apple', 'facebook'], default: 'local' },
    googleId: { type: String, sparse: true },
    appleId: { type: String, sparse: true },

    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    role: { type: String, enum: ['user', 'editor', 'admin', 'superadmin'], default: 'user' },

    preferences: {
      language: { type: String, enum: ['en', 'hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml'], default: 'en' },
      categories: [{ type: String }],
      preferredSources: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Source' }],
      blockedSources: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Source' }],
      blockedKeywords: [{ type: String, lowercase: true }],
      theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
      fontSize: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
      notifications: {
        pushEnabled: { type: Boolean, default: true },
        breakingNews: { type: Boolean, default: true },
        dailyDigest: { type: Boolean, default: true },
        dailyDigestTime: { type: String, default: '08:00' },
        weeklyRoundup: { type: Boolean, default: false },
      },
      feedType: { type: String, enum: ['personalized', 'trending', 'latest', 'editorial'], default: 'personalized' },
      autoplayVideos: { type: Boolean, default: true },
      dataSaverMode: { type: Boolean, default: false },
    },

    personalization: {
      categoryScores: { type: Map, of: Number, default: new Map() },
      sourceScores: { type: Map, of: Number, default: new Map() },
      topicVector: { type: [Number], default: [] },
      readingPatterns: {
        avgReadTimeSeconds: { type: Number, default: 0 },
        avgSessionDurationMinutes: { type: Number, default: 0 },
        avgArticlesPerSession: { type: Number, default: 0 },
        preferredReadingHours: [{ type: Number }],
        peakActivityDay: String,
        swipePatterns: {
          avgSwipesPerSession: { type: Number, default: 0 },
          skipRate: { type: Number, default: 0 },
          fullReadRate: { type: Number, default: 0 },
          shareRate: { type: Number, default: 0 },
          bookmarkRate: { type: Number, default: 0 },
        },
      },
      engagementProfile: {
        prefersShortContent: { type: Boolean, default: true },
        prefersVisualContent: { type: Boolean, default: false },
        engagementLevel: { type: String, enum: ['low', 'medium', 'high', 'power_user'], default: 'medium' },
      },
      coldStartPhase: { type: String, enum: ['ONBOARDING', 'EXPLORING', 'WARMING', 'PERSONALIZED'], default: 'ONBOARDING' },
      lastComputedAt: Date,
      modelVersion: { type: String, default: 'v1' },
    },

    stats: {
      totalArticlesRead: { type: Number, default: 0 },
      totalReadTimeMinutes: { type: Number, default: 0 },
      totalShares: { type: Number, default: 0 },
      totalBookmarks: { type: Number, default: 0 },
      totalPolls: { type: Number, default: 0 },
      streak: {
        current: { type: Number, default: 0 },
        longest: { type: Number, default: 0 },
        lastActiveDate: Date,
      },
    },

    devices: [{
      deviceId: String,
      deviceType: { type: String, enum: ['ios', 'android', 'web'] },
      fcmToken: String,
      appVersion: String,
      osVersion: String,
      lastActiveAt: Date,
      isActive: { type: Boolean, default: true },
    }],

    subscription: {
      plan: { type: String, enum: ['free', 'premium', 'premium_plus'], default: 'free' },
      startDate: Date,
      endDate: Date,
      autoRenew: { type: Boolean, default: false },
    },

    lastLoginAt: Date,
    lastActiveAt: Date,
    onboardingCompleted: { type: Boolean, default: false },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referralCount: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ lastActiveAt: -1 });
UserSchema.index({ 'devices.fcmToken': 1 });

UserSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  if (this.isNew && !this.referralCode) {
    this.referralCode = this.name.slice(0, 3).toUpperCase() + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

UserSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

UserSchema.methods.generateAccessToken = function () {
  return jwt.sign({ id: this._id, role: this.role, type: 'user' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
};

UserSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ id: this._id, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' });
};

module.exports = mongoose.model('User', UserSchema);
