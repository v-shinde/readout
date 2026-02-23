const router = require('express').Router();
const c = require('../controllers/dashboard.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin', 'editor'));

router.get('/overview', c.getOverview);
router.get('/engagement', c.getEngagementStats);
router.get('/growth', c.getUserGrowth);
router.get('/content', c.getContentStats);
router.get('/realtime', c.getRealtimeStats);

module.exports = router;