const router = require('express').Router();
const c = require('../controllers/bookmark.controller');
const { requireAuth } = require('@readout/shared').middleware;

router.use(requireAuth); // All bookmark routes require login

router.get('/', c.getBookmarks);
router.get('/folders', c.getFolders);
router.post('/toggle', c.toggleBookmark);
router.put('/:id/folder', c.moveToFolder);
router.put('/:id/notes', c.updateNotes);
router.delete('/:id', c.deleteBookmark);
router.post('/check', c.checkBookmarked);

module.exports = router;
