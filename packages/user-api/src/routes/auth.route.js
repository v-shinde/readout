const router = require('express').Router();
const c = require('../controllers/auth.controller');
const { authenticate, requireAuth, authLimiter } = require('@readout/shared').middleware;
const { registerValidation, loginValidation, anonymousValidation } = require('@readout/shared').validators;

// Public
router.post('/register', authLimiter, registerValidation, c.register);
router.post('/login', authLimiter, loginValidation, c.login);
router.post('/anonymous', authLimiter, anonymousValidation, c.anonymousLogin);
router.post('/google', authLimiter, c.googleLogin);
router.post('/refresh', c.refreshToken);
router.post('/forgot-password', authLimiter, c.forgotPassword);
router.post('/reset-password', authLimiter, c.resetPassword);
router.post('/verify-email', c.verifyEmail);

// Authenticated
router.post('/merge', requireAuth, c.mergeAnonymous);
router.post('/logout', requireAuth, c.logout);
router.put('/change-password', requireAuth, c.changePassword);

module.exports = router;