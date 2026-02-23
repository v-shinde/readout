// ==================== ROUTE ====================
const router = require('express').Router();
const c = require('../controllers/moderation.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin', 'editor'));

router.get('/articles', c.getFlaggedArticles);
router.get('/comments', c.getFlaggedComments);
router.put('/articles/:id/review', c.reviewArticle);
router.put('/comments/:id/review', c.reviewComment);
router.get('/stats', c.getModerationStats);

module.exports = router;