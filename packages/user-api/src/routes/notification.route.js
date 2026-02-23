const router = require('express').Router();
const c = require('../controllers/notification.controller');
const { requireAuth } = require('@readout/shared').middleware;

router.use(requireAuth);

router.get('/', c.getNotifications);
router.get('/unread-count', c.getUnreadCount);
router.put('/:id/read', c.markRead);
router.put('/read-all', c.markAllRead);
router.delete('/:id', c.deleteNotification);
router.put('/settings', c.updateNotificationSettings);

module.exports = router;
