const mongoose = require('mongoose');

const UserActivitySchema = new mongoose.Schema(
  {
    // Can be a User._id OR AnonymousUser._id
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', index: true },

    // ---- ACTION TYPE ----
    action: {
      type: String,
      required: true,
      enum: [
        // Reading
        'view', 'read_summary', 'read_full', 'scroll_past',
        // Engagement
        'share', 'bookmark', 'unbookmark', 'reaction', 'comment', 'poll_vote',
        // Navigation
        'category_switch', 'search', 'source_click', 'topic_follow', 'topic_unfollow',
        // Negative signals
        'not_interested', 'report', 'hide_source', 'mute_topic',
        // Session
        'session_start', 'session_end',
        // Notifications
        'notification_received', 'notification_opened', 'notification_dismissed',
      ],
      index: true,
    },

    // ---- METADATA ----
    metadata: {
      // Read actions
      readDurationSeconds: Number,
      scrollDepthPercent: Number,
      readSource: {
        type: String,
        enum: ['feed', 'category', 'trending', 'search', 'notification', 'share_link', 'widget', 'daily_digest'],
      },

      // Share
      shareTarget: {
        type: String,
        enum: ['whatsapp', 'facebook', 'twitter', 'instagram', 'telegram', 'copy_link', 'other'],
      },

      // Reaction
      reactionType: { type: String, enum: ['like', 'love', 'wow', 'sad', 'angry'] },

      // Search
      searchQuery: String,
      searchResultCount: Number,
      searchResultClicked: Boolean,

      // Category switch
      fromCategory: String,
      toCategory: String,

      // Notification
      notificationType: String,
      notificationId: String,

      // Article context (denormalized at log time)
      articleCategory: String,
      articleSource: String,
      articleSourceId: { type: mongoose.Schema.Types.ObjectId },
      articleTags: [String],
      articleAge: Number,

      // Device context
      deviceType: { type: String, enum: ['ios', 'android', 'web'] },
      connectionType: { type: String, enum: ['wifi', '4g', '5g', '3g', 'unknown'] },

      // Feed position
      feedPosition: Number,

      // Session context
      sessionId: String,
      sessionDurationMinutes: Number,
      articlesInSession: Number,
    },

    // ---- TIMESTAMP ----
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
    writeConcern: { w: 1, j: false },
  }
);

// ============ INDEXES ============
UserActivitySchema.index({ userId: 1, timestamp: -1 });
UserActivitySchema.index({ userId: 1, articleId: 1, action: 1 });
UserActivitySchema.index({ action: 1, timestamp: -1 });
UserActivitySchema.index({ userId: 1, action: 1, timestamp: -1 });
UserActivitySchema.index({ userId: 1, 'metadata.articleCategory': 1, action: 1 });
UserActivitySchema.index({ articleId: 1, action: 1, timestamp: -1 });

// TTL — auto-delete raw activity after 180 days
UserActivitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

// ============ STATICS ============

// Fire-and-forget activity logging
UserActivitySchema.statics.logActivity = async function (data) {
  try {
    const doc = {
      ...data,
      userId: new mongoose.Types.ObjectId(data.userId),
      articleId: data.articleId ? new mongoose.Types.ObjectId(data.articleId) : undefined,
      timestamp: new Date(),
    };
    return await this.collection.insertOne(doc);
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
};

// Batch insert
UserActivitySchema.statics.logBatch = async function (activities) {
  try {
    const docs = activities.map(a => ({
      ...a,
      userId: new mongoose.Types.ObjectId(a.userId),
      articleId: a.articleId ? new mongoose.Types.ObjectId(a.articleId) : undefined,
      timestamp: a.timestamp || new Date(),
    }));
    return await this.collection.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('Batch activity error:', err.message);
  }
};

// Category engagement distribution for a user (last N days)
UserActivitySchema.statics.getCategoryEngagement = async function (userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: since },
        action: { $in: ['read_summary', 'read_full', 'share', 'bookmark', 'reaction'] },
        'metadata.articleCategory': { $exists: true },
      },
    },
    {
      $group: {
        _id: '$metadata.articleCategory',
        totalActions: { $sum: 1 },
        reads: { $sum: { $cond: [{ $in: ['$action', ['read_summary', 'read_full']] }, 1, 0] } },
        shares: { $sum: { $cond: [{ $eq: ['$action', 'share'] }, 1, 0] } },
        bookmarks: { $sum: { $cond: [{ $eq: ['$action', 'bookmark'] }, 1, 0] } },
        reactions: { $sum: { $cond: [{ $eq: ['$action', 'reaction'] }, 1, 0] } },
        avgReadTime: { $avg: '$metadata.readDurationSeconds' },
      },
    },
    { $sort: { totalActions: -1 } },
  ]);
};

// Source engagement distribution for a user
UserActivitySchema.statics.getSourceEngagement = async function (userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: since },
        action: { $in: ['read_summary', 'read_full', 'share', 'bookmark'] },
        'metadata.articleSourceId': { $exists: true },
      },
    },
    {
      $group: {
        _id: '$metadata.articleSourceId',
        totalActions: { $sum: 1 },
        sourceName: { $first: '$metadata.articleSource' },
      },
    },
    { $sort: { totalActions: -1 } },
    { $limit: 50 },
  ]);
};

// Reading pattern by hour of day
UserActivitySchema.statics.getReadingPattern = async function (userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: since },
        action: { $in: ['read_summary', 'read_full'] },
      },
    },
    { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
};

// Negative signals for a user (blocked sources, muted topics)
UserActivitySchema.statics.getNegativeSignals = async function (userId) {
  return this.find({
    userId: new mongoose.Types.ObjectId(userId),
    action: { $in: ['not_interested', 'hide_source', 'mute_topic'] },
  })
    .sort({ timestamp: -1 })
    .limit(200)
    .lean();
};

// Article engagement stats (for trending computation)
UserActivitySchema.statics.getArticleEngagement = async function (articleId, hours = 24) {
  const since = new Date(Date.now() - hours * 3600000);
  return this.aggregate([
    {
      $match: {
        articleId: new mongoose.Types.ObjectId(articleId),
        timestamp: { $gte: since },
      },
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
      },
    },
  ]);
};

// Session stats for a user
UserActivitySchema.statics.getSessionStats = async function (userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        action: 'session_end',
        timestamp: { $gte: since },
      },
    },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        avgDuration: { $avg: '$metadata.sessionDurationMinutes' },
        avgArticles: { $avg: '$metadata.articlesInSession' },
      },
    },
  ]);
};

module.exports = mongoose.model('UserActivity', UserActivitySchema);