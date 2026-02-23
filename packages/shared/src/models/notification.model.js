const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    // Broadcast support
    isBroadcast: { type: Boolean, default: false },
    targetAudience: {
      categories: [String],
      languages: [String],
      userSegments: [{ type: String, enum: ['all', 'active', 'dormant', 'premium', 'new_users', 'power_users'] }],
      deviceTypes: [{ type: String, enum: ['ios', 'android', 'web'] }],
    },

    type: {
      type: String, required: true,
      enum: [
        'breaking_news', 'daily_digest', 'weekly_roundup', 'topic_update',
        'category_alert', 'trending', 'personalized', 'system', 'promotional',
        'milestone', 'welcome',
      ],
    },

    title: { type: String, required: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 300 },
    imageUrl: String,

    // Deep link
    actionUrl: String,
    actionType: { type: String, enum: ['article', 'category', 'topic', 'timeline', 'webview', 'screen'] },
    actionId: String,

    // Status tracking
    status: {
      type: String,
      enum: ['pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'cancelled'],
      default: 'pending',
    },
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    failedAt: Date,
    failureReason: String,

    // Analytics (for broadcast)
    analytics: {
      targeted: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },

    // Scheduling
    scheduledAt: Date,
    expiresAt: Date,

    priority: { type: String, enum: ['critical', 'high', 'normal', 'low'], default: 'normal' },

    // Who/what created this notification
    createdBy: {
      type: { type: String, enum: ['system', 'admin', 'cron', 'ai'], default: 'system' },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, status: 1 });
NotificationSchema.index({ isBroadcast: 1, scheduledAt: 1 });
NotificationSchema.index({ type: 1, createdAt: -1 });
NotificationSchema.index({ status: 1, scheduledAt: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============ STATICS ============
NotificationSchema.statics.getUnread = function (userId, limit = 50) {
  return this.find({ userId, status: { $nin: ['read', 'cancelled'] } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

NotificationSchema.statics.markAllRead = function (userId) {
  return this.updateMany(
    { userId, status: { $in: ['sent', 'delivered'] } },
    { $set: { status: 'read', readAt: new Date() } }
  );
};

NotificationSchema.statics.getScheduledPending = function () {
  return this.find({
    status: 'pending',
    scheduledAt: { $lte: new Date() },
  }).lean();
};

module.exports = mongoose.model('Notification', NotificationSchema);