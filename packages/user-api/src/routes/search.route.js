const router = require('express').Router();
const c = require('../controllers/search.controller');
const { authenticate, searchLimiter } = require('@readout/shared').middleware;

router.use(authenticate);
router.use(searchLimiter);

router.get('/', c.searchArticles);
router.get('/suggestions', c.getSearchSuggestions);
router.get('/trending-queries', c.getTrendingQueries);
router.get('/topics', c.searchTopics);

module.exports = router;
