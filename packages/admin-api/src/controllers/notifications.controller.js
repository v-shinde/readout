const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const { Notification } = require('@readout/shared').models;

exports.sendBroadcast = asyncHandler(async (req, res) => {
  const { title, body, type, imageUrl, actionUrl, actionType, actionId, targetAudience, priority } = req.body;
  if (!title || !body) throw new ValidationError('Title and body required');

  const notification = await Notification.create({
    isBroadcast: true, title, body, type: type || 'system', imageUrl, actionUrl, actionType, actionId,
    targetAudience: targetAudience || { userSegments: ['all'] },
    priority: priority || 'normal',
    status: 'queued',
    createdBy: { type: 'admin', userId: req.userId },
  });

  // TODO: Push to BullMQ notification queue for async processing
  res.status(201).json({ success: true, data: notification });
});

exports.scheduleNotification = asyncHandler(async (req, res) => {
  const { title, body, type, scheduledAt, targetAudience, imageUrl, actionUrl, actionType, actionId } = req.body;
  if (!scheduledAt) throw new ValidationError('Scheduled time required');

  const notification = await Notification.create({
    isBroadcast: true, title, body, type: type || 'system', imageUrl, actionUrl, actionType, actionId,
    targetAudience: targetAudience || { userSegments: ['all'] },
    scheduledAt: new Date(scheduledAt), status: 'pending',
    createdBy: { type: 'admin', userId: req.userId },
  });
  res.status(201).json({ success: true, data: notification });
});

exports.getHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const query = { isBroadcast: true };
  if (type) query.type = type;
  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
    Notification.countDocuments(query),
  ]);
  res.json({ success: true, data: { notifications, total, page: +page } });
});

exports.getAnalytics = asyncHandler(async (req, res) => {
  const notif = await Notification.findById(req.params.id).select('title type analytics status sentAt').lean();
  if (!notif) throw new NotFoundError('Notification');
  res.json({ success: true, data: notif });
});

exports.cancelNotification = asyncHandler(async (req, res) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['pending', 'queued'] } },
    { $set: { status: 'cancelled' } }, { new: true }
  );
  if (!notif) throw new NotFoundError('Notification or already sent');
  res.json({ success: true });
});