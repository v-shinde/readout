const router = require('express').Router();
const c = require('../controllers/user.controller');
const { authenticate, requireAuth } = require('@readout/shared').middleware;

router.get('/me', requireAuth, c.getProfile);
router.put('/me', requireAuth, c.updateProfile);
router.put('/me/preferences', authenticate, c.updatePreferences);    // anonymous can set preferences
router.put('/me/onboarding', authenticate, c.completeOnboarding);    // anonymous can onboard
router.get('/me/stats', requireAuth, c.getStats);
router.get('/me/reading-history', requireAuth, c.getReadingHistory);
router.put('/me/avatar', requireAuth, c.updateAvatar);
router.delete('/me', requireAuth, c.deleteAccount);
router.put('/me/devices', requireAuth, c.registerDevice);
router.delete('/me/devices/:deviceId', requireAuth, c.removeDevice);

module.exports = router;
