// ==================== users.route.js ====================
const router = require('express').Router();
const c = require('../controllers/users.controller');
const { requireAuth, requireRole } = require('@readout/shared').middleware;
router.use(requireAuth, requireRole('admin', 'superadmin'));

router.get('/', c.listUsers);
router.get('/:id', c.getUser);
router.put('/:id/role', c.updateRole);
router.put('/:id/ban', c.toggleBan);
router.get('/:id/activity', c.getUserActivity);
router.get('/segments/overview', c.getSegments);

module.exports = router;
