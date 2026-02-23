// ==================== ROUTE ====================
const router = require('express').Router();
const c = require('../controllers/sources.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin'));

router.get('/', c.listSources);
router.get('/:id', c.getSource);
router.post('/', c.createSource);
router.put('/:id', c.updateSource);
router.put('/:id/toggle', c.toggleActive);
router.post('/:id/test-feed', c.testFeed);
router.get('/:id/stats', c.getSourceStats);
router.delete('/:id', c.deleteSource);

module.exports = router;