const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../utils/errors.util');

// Authenticate both logged-in and anonymous users
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedError('No token provided');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type === 'anonymous') {
      req.anonymousId = decoded.id;
      req.isAnonymous = true;
      req.userId = null;
    } else {
      req.userId = decoded.id;
      req.isAnonymous = false;
      req.anonymousId = null;
      req.userRole = decoded.role;
    }
    req.trackingId = req.userId || req.anonymousId;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

// Require logged-in user (no anonymous)
const requireAuth = async (req, res, next) => {
  await authenticate(req, res, (err) => {
    if (err) return next(err);
    if (req.isAnonymous) return next(new UnauthorizedError('Login required'));
    next();
  });
};

// Require specific roles
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.userRole)) {
    return next(new UnauthorizedError(`Requires role: ${roles.join(', ')}`));
  }
  next();
};

// Optional auth - sets user info if token present, continues if not
const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.type !== 'anonymous' ? decoded.id : null;
    req.anonymousId = decoded.type === 'anonymous' ? decoded.id : null;
    req.isAnonymous = decoded.type === 'anonymous';
    req.trackingId = req.userId || req.anonymousId;
  } catch (_) { /* continue without auth */ }
  next();
};

module.exports = { authenticate, requireAuth, requireRole, optionalAuth };
