const router = require('express').Router();
const c = require('../controllers/poll.controller');
const { authenticate, requireAuth } = require('@readout/shared').middleware;

router.get('/article/:articleId', authenticate, c.getArticlePoll);
router.post('/article/:articleId/vote', authenticate, c.votePoll);
router.get('/article/:articleId/results', authenticate, c.getPollResults);

module.exports = router;
