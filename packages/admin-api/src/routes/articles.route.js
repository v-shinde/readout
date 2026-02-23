// ==================== ROUTE ====================
const router = require('express').Router();
const c = require('../controllers/articles.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin', 'editor'));

router.get('/', c.listArticles);
router.get('/review-queue', c.getReviewQueue);
router.get('/:id', c.getArticle);
router.post('/', c.createArticle);
router.put('/:id', c.updateArticle);
router.put('/:id/status', c.updateStatus);
router.put('/:id/featured', c.toggleFeatured);
router.put('/:id/breaking', c.toggleBreaking);
router.delete('/:id', c.deleteArticle);
router.post('/bulk-status', c.bulkUpdateStatus);

module.exports = router;