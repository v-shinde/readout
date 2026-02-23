// ==================== ROUTE ====================
const router = require('express').Router();
const c = require('../controllers/comment.controller');
const { authenticate, requireAuth } = require('@readout/shared').middleware;

router.get('/article/:articleId', authenticate, c.getArticleComments);
router.get('/:id/replies', authenticate, c.getReplies);
router.post('/', requireAuth, c.createComment);
router.put('/:id', requireAuth, c.editComment);
router.delete('/:id', requireAuth, c.deleteComment);
router.post('/:id/like', requireAuth, c.toggleLike);
router.post('/:id/report', requireAuth, c.reportComment);

module.exports = router;
