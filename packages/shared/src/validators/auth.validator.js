const { body } = require('express-validator');

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be 6+ characters'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const anonymousValidation = [
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('deviceType').isIn(['ios', 'android', 'web']).withMessage('Invalid device type'),
];

module.exports = { registerValidation, loginValidation, anonymousValidation };
