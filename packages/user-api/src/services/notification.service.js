const { Notification, User } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;
const axios = require('axios');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_URL || 'http://localhost:5004';

// ============================================
// SEND PUSH NOTIFICATION
// ============================================

/**
 * Send a push notification to a single user
 */
exports.sendToUser = async (userId, notification) => {
  const { type, title, body, imageUrl, actionUrl, actionType, actionId, priority } = notification;

  // 1. Create notification record in DB
  const notif = await Notification.create({
    userId, type, title, body, imageUrl, actionUrl, actionType, actionId,
    priority: priority || 'normal',
    status: 'queued',
    createdBy: { type: 'system' },
  });

  // 2. Push to notification-service (async)
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/internal/send`, {
      notificationId: notif._id,
      userId,
      title, body, imageUrl, actionUrl,
    }, { timeout: 3000 });

    await Notification.updateOne({ _id: notif._id }, { $set: { status: 'sent', sentAt: new Date() } });
  } catch (err) {
    logger.error(`[notification.service] Failed to send to ${userId}: ${err.message}`);
    await Notification.updateOne({ _id: notif._id }, {
      $set: { status: 'failed', failedAt: new Date(), failureReason: err.message },
    });
  }

  return notif;
};

/**
 * Send breaking news alert to all users with breaking news enabled
 */
exports.sendBreakingAlert = async (article) => {
  const notif = await Notification.create({
    isBroadcast: true,
    type: 'breaking_news',
    title: '🔴 BREAKING',
    body: article.title,
    imageUrl: article.media?.thumbnail?.url,
    actionUrl: `/article/${article._id}`,
    actionType: 'article',
    actionId: article._id.toString(),
    priority: 'critical',
    status: 'queued',
    targetAudience: { userSegments: ['all'] },
    createdBy: { type: 'system' },
  });

  // Push to notification-service for fan-out
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/internal/broadcast`, {
      notificationId: notif._id,
      title: '🔴 BREAKING',
      body: article.title,
      imageUrl: article.media?.thumbnail?.url,
      actionUrl: `/article/${article._id}`,
      filter: { 'preferences.notifications.breakingNews': true },
    }, { timeout: 5000 });
  } catch (err) {
    logger.error(`[notification.service] Breaking alert failed: ${err.message}`);
  }

  return notif;
};

/**
 * Send daily digest notification
 */
exports.sendDailyDigest = async (digestId, language = 'en') => {
  const notif = await Notification.create({
    isBroadcast: true,
    type: 'daily_digest',
    title: '📰 Your Daily Digest',
    body: 'Top stories curated for you today',
    actionUrl: '/feed/daily-digest',
    actionType: 'screen',
    priority: 'normal',
    status: 'queued',
    targetAudience: {
      languages: [language],
      userSegments: ['all'],
    },
    createdBy: { type: 'cron' },
  });

  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/internal/broadcast`, {
      notificationId: notif._id,
      title: notif.title,
      body: notif.body,
      actionUrl: notif.actionUrl,
      filter: {
        'preferences.notifications.dailyDigest': true,
        'preferences.language': language,
      },
    }, { timeout: 5000 });
  } catch (err) {
    logger.error(`[notification.service] Daily digest failed: ${err.message}`);
  }

  return notif;
};

/**
 * Schedule a notification for future delivery
 */
exports.schedule = async (notification) => {
  return Notification.create({
    ...notification,
    status: 'pending',
  });
  // The notification-service will pick it up via cron when scheduledAt arrives
};

// ============================================
// NOTIFICATION HISTORY
// ============================================

exports.getUnread = async (userId, limit = 50) => {
  return Notification.getUnread(userId, limit);
};

exports.getUnreadCount = async (userId) => {
  return Notification.countDocuments({
    userId,
    status: { $in: ['sent', 'delivered'] },
  });
};

exports.markRead = async (userId, notificationId) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { status: 'read', readAt: new Date() } },
    { new: true }
  );
};

exports.markAllRead = async (userId) => {
  return Notification.markAllRead(userId);
};

// ============================================
// NOTIFICATION SETTINGS
// ============================================

exports.updateSettings = async (userId, settings) => {
  const updates = {};
  const keys = ['pushEnabled', 'breakingNews', 'dailyDigest', 'dailyDigestTime', 'weeklyRoundup'];

  keys.forEach(k => {
    if (settings[k] !== undefined) updates[`preferences.notifications.${k}`] = settings[k];
  });

  await User.updateOne({ _id: userId }, { $set: updates });
  return true;
};