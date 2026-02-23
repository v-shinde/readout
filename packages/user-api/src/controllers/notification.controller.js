const { asyncHandler, NotFoundError } = require('@readout/shared').utils;
const notificationService = require('../services/notification.service');

// GET /notifications?page=1&limit=30&type=all
exports.getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, type } = req.query;
  const { Notification } = require('@readout/shared').models;

  const query = { userId: req.userId };
  if (type && type !== 'all') query.type = type;

  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
    Notification.countDocuments(query),
  ]);
  res.json({ success: true, data: { notifications, total, page: +page } });
});

// GET /notifications/unread-count
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.userId);
  res.json({ success: true, data: { count } });
});

// PUT /notifications/:id/read
exports.markRead = asyncHandler(async (req, res) => {
  const notif = await notificationService.markRead(req.userId, req.params.id);
  if (!notif) throw new NotFoundError('Notification');
  res.json({ success: true });
});

// PUT /notifications/read-all
exports.markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.userId);
  res.json({ success: true, data: { modifiedCount: result.modifiedCount } });
});

// DELETE /notifications/:id
exports.deleteNotification = asyncHandler(async (req, res) => {
  const { Notification } = require('@readout/shared').models;
  await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { status: 'cancelled' } }
  );
  res.json({ success: true });
});

// PUT /notifications/settings
exports.updateNotificationSettings = asyncHandler(async (req, res) => {
  await notificationService.updateSettings(req.userId, req.body);
  res.json({ success: true });
});