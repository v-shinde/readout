// ==================== ROUTE ====================
const router = require('express').Router();
const c = require('../controllers/digest.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin', 'editor'));

router.get('/', c.listDigests);
router.get('/today', c.getTodayDigest);
router.post('/generate', c.generateDigest);
router.put('/:id', c.updateDigest);
router.put('/:id/publish', c.publishDigest);

module.exports = router;