// ==================== ROUTE ====================
const router = require('express').Router();
const c = require('../controllers/ads.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin'));

router.get('/', c.listCampaigns);
router.get('/:id', c.getCampaign);
router.post('/', c.createCampaign);
router.put('/:id', c.updateCampaign);
router.put('/:id/status', c.updateStatus);
router.get('/:id/analytics', c.getCampaignAnalytics);
router.delete('/:id', c.deleteCampaign);

module.exports = router;