// ==================== ROUTE ====================
const router = require('express').Router();
const c = require('../controllers/activity.controller');
const { authenticate, activityLimiter } = require('@readout/shared').middleware;

router.use(authenticate);
router.use(activityLimiter);

router.post('/track', c.trackActivity);
router.post('/batch', c.trackBatch);
router.post('/session/start', c.sessionStart);
router.post('/session/end', c.sessionEnd);
router.post('/hide-source', c.hideSource);
router.post('/mute-topic', c.muteTopic);

module.exports = router;