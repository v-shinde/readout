const mongoose = require('mongoose');
const { CATEGORIES, LANGUAGES } = require('../constants/categories.constant');

const AdCampaignSchema = new mongoose.Schema(
  {
    // ---- ADVERTISER ----
    advertiser: {
      name: { type: String, required: true },
      company: String,
      email: String,
      phone: String,
      contactPerson: String,
      advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // ---- CAMPAIGN INFO ----
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['native_card', 'banner_top', 'banner_bottom', 'interstitial', 'video_pre', 'sponsored_content'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'active', 'paused', 'completed', 'rejected', 'archived'],
      default: 'draft',
    },
    rejectionReason: String,

    // ---- CREATIVE ----
    creative: {
      title: { type: String, maxlength: 100 },
      body: { type: String, maxlength: 500 },
      image: { url: String, key: String, width: Number, height: Number },
      video: { url: String, thumbnailUrl: String, duration: Number },
      ctaText: { type: String, default: 'Learn More', maxlength: 30 },
      ctaUrl: { type: String, required: true },
      landingPageUrl: String,
      brandLogo: { url: String, key: String },
      brandName: String,
      // A/B test variants
      variants: [{
        variantId: String,
        title: String,
        body: String,
        image: { url: String, key: String },
        ctaText: String,
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
      }],
    },

    // ---- TARGETING ----
    targeting: {
      categories: [{ type: String, enum: CATEGORIES }],
      languages: [{ type: String, enum: LANGUAGES }],
      locations: [String],
      cities: [String],
      states: [String],
      ageRange: { min: Number, max: Number },
      gender: { type: String, enum: ['all', 'male', 'female'], default: 'all' },
      deviceTypes: [{ type: String, enum: ['ios', 'android', 'web'] }],
      userSegments: [{ type: String, enum: ['all', 'new_users', 'power_users', 'premium', 'dormant', 'returning'] }],
      interests: [String],
      excludeCategories: [String],

      // Frequency capping
      maxImpressionsPerUser: { type: Number, default: 3 },
      maxImpressionsPerUserPerDay: { type: Number, default: 1 },
      maxClicksPerUser: { type: Number, default: 2 },
    },

    // ---- SCHEDULING ----
    schedule: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      dailyBudget: Number,
      totalBudget: { type: Number, required: true },
      activeHours: { start: { type: Number, min: 0, max: 23 }, end: { type: Number, min: 0, max: 23 } },
      activeDays: [{ type: Number, min: 0, max: 6 }], // 0=Sun, 6=Sat
      timezone: { type: String, default: 'Asia/Kolkata' },
    },

    // ---- PRICING ----
    pricing: {
      model: { type: String, enum: ['cpm', 'cpc', 'cpa', 'cpv', 'flat_rate'], required: true },
      bidAmount: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
      minBid: Number,
      maxBid: Number,
    },

    // ---- PERFORMANCE METRICS ----
    metrics: {
      impressions: { type: Number, default: 0 },
      uniqueImpressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      uniqueClicks: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      spend: { type: Number, default: 0 },
      remainingBudget: Number,
      avgCpc: { type: Number, default: 0 },
      avgCpm: { type: Number, default: 0 },
      engagements: { type: Number, default: 0 },
      videoViews: { type: Number, default: 0 },
      videoCompletions: { type: Number, default: 0 },
      // Daily breakdown
      dailyMetrics: [{
        date: Date,
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        spend: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
      }],
    },

    // ---- PLACEMENT ----
    placement: {
      frequency: { type: Number, default: 10 },
      fixedPosition: Number,
      priority: { type: Number, default: 5, min: 1, max: 10 },
      // Which feed positions this ad can appear in
      allowedPositions: { min: Number, max: Number },
    },

    // ---- CONTRACT ----
    contract: {
      type: { type: String, enum: ['monthly', 'quarterly', 'annual', 'one_time', 'performance'], default: 'one_time' },
      signedDate: Date,
      contractValue: Number,
      invoiceNumber: String,
      paymentStatus: { type: String, enum: ['pending', 'partial', 'paid', 'overdue'], default: 'pending' },
    },

    // ---- ADMIN ----
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    notes: String,
  },
  { timestamps: true }
);

AdCampaignSchema.index({ status: 1, 'schedule.startDate': 1, 'schedule.endDate': 1 });
AdCampaignSchema.index({ 'targeting.categories': 1, status: 1 });
AdCampaignSchema.index({ type: 1, status: 1 });
AdCampaignSchema.index({ 'advertiser.advertiserId': 1 });
AdCampaignSchema.index({ 'placement.priority': 1, status: 1 });

// ============ STATICS ============
AdCampaignSchema.statics.getActiveAds = function (category, language = 'en', deviceType = 'android') {
  const now = new Date();
  return this.find({
    status: 'active',
    'schedule.startDate': { $lte: now },
    'schedule.endDate': { $gte: now },
    $or: [
      { 'targeting.categories': { $size: 0 } },
      { 'targeting.categories': category },
    ],
    $or: [
      { 'targeting.languages': { $size: 0 } },
      { 'targeting.languages': language },
    ],
    $or: [
      { 'targeting.deviceTypes': { $size: 0 } },
      { 'targeting.deviceTypes': deviceType },
    ],
  })
    .sort({ 'placement.priority': 1 })
    .lean();
};

AdCampaignSchema.statics.recordImpression = async function (campaignId) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return this.updateOne(
    { _id: campaignId },
    {
      $inc: { 'metrics.impressions': 1 },
      $push: {
        'metrics.dailyMetrics': {
          $each: [],
          $slice: -90,
        },
      },
    }
  );
};

AdCampaignSchema.statics.recordClick = async function (campaignId) {
  return this.updateOne(
    { _id: campaignId },
    { $inc: { 'metrics.clicks': 1 } }
  );
};

module.exports = mongoose.model('AdCampaign', AdCampaignSchema);