// ==================== notifications.route.js ====================
const router = require('express').Router();
const c = require('../controllers/notifications.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin'));

router.post('/broadcast', c.sendBroadcast);
router.post('/schedule', c.scheduleNotification);
router.get('/history', c.getHistory);
router.get('/:id/analytics', c.getAnalytics);
router.delete('/:id', c.cancelNotification);

module.exports = router;
