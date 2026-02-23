const { validationResult } = require('express-validator');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { asyncHandler, UnauthorizedError, ValidationError, ConflictError } = require('@readout/shared').utils;
const { User, AnonymousUser } = require('@readout/shared').models;
const userService = require('../services/user.service');
const activityService = require('../services/activity.service');

// POST /auth/register
exports.register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ValidationError(errors.array()[0].msg);

  const { name, email, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) throw new ConflictError('Email already registered');

  const user = await User.create({ name, email, password });
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  res.status(201).json({
    success: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    },
  });
});

// POST /auth/login
exports.login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ValidationError(errors.array()[0].msg);

  const { email, password } = req.body;
  const user = await User.findOne({ email, authProvider: 'local' }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    throw new UnauthorizedError('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  user.lastActiveAt = new Date();
  await user.save();

  res.json({
    success: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, role: user.role, preferences: user.preferences },
      accessToken: user.generateAccessToken(),
      refreshToken: user.generateRefreshToken(),
    },
  });
});

// POST /auth/anonymous
exports.anonymousLogin = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ValidationError(errors.array()[0].msg);

  const { deviceId, deviceType, fingerprint, appVersion, osVersion } = req.body;
  const { user, isNew } = await AnonymousUser.findOrCreate({ deviceId, deviceType, fingerprint, appVersion, osVersion });
  const token = user.generateAnonymousToken();

  res.status(isNew ? 201 : 200).json({
    success: true,
    data: {
      anonymousId: user._id,
      isNew,
      accessToken: token,
      preferences: user.preferences,
      coldStartPhase: user.personalization?.coldStartPhase || 'BRAND_NEW',
    },
  });
});

// POST /auth/google
exports.googleLogin = asyncHandler(async (req, res) => {
  const { name, email, googleId, avatar } = req.body;
  if (!email || !googleId) throw new ValidationError('Google credentials required');

  let user = await User.findOne({ $or: [{ googleId }, { email }] });
  if (!user) {
    user = await User.create({
      name, email, googleId, authProvider: 'google', isVerified: true,
      avatar: avatar ? { url: avatar } : undefined,
    });
  } else if (!user.googleId) {
    user.googleId = googleId;
    user.authProvider = 'google';
    user.isVerified = true;
    if (avatar && !user.avatar?.url) user.avatar = { url: avatar };
    await user.save();
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, role: user.role, preferences: user.preferences },
      accessToken: user.generateAccessToken(),
      refreshToken: user.generateRefreshToken(),
      isNewUser: user.createdAt.getTime() === user.updatedAt.getTime(),
    },
  });
});

// POST /auth/refresh
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ValidationError('Refresh token required');

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid refresh token');

  res.json({
    success: true,
    data: { accessToken: user.generateAccessToken(), refreshToken: user.generateRefreshToken() },
  });
});

// POST /auth/merge — merge anonymous into registered user
exports.mergeAnonymous = asyncHandler(async (req, res) => {
  const { anonymousId } = req.body;
  if (!anonymousId) throw new ValidationError('Anonymous ID required');

  const result = await AnonymousUser.mergeIntoUser(anonymousId, req.userId);

  // Invalidate all caches for both old anonymous and new user
  const redis = req.app.locals.redis;
  await activityService.invalidateUserCaches(anonymousId, redis);
  await activityService.invalidateUserCaches(req.userId, redis);

  res.json({
    success: true,
    data: { message: 'Anonymous account merged successfully', migratedArticles: result.migratedArticles },
  });
});

// POST /auth/forgot-password
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email, authProvider: 'local' });

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    // TODO: Send email via notification-service
  }

  res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
});

// POST /auth/reset-password
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw new ValidationError('Token and password required');

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+password');

  if (!user) throw new UnauthorizedError('Invalid or expired reset token');

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({ success: true, message: 'Password reset successful' });
});

// POST /auth/verify-email
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({ verificationToken: token, verificationExpires: { $gt: new Date() } });
  if (!user) throw new UnauthorizedError('Invalid or expired verification token');

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationExpires = undefined;
  await user.save();

  res.json({ success: true, message: 'Email verified' });
});

// POST /auth/logout
exports.logout = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  if (fcmToken) {
    await userService.removeDevice(req.userId, null); // removes by fcmToken handled at model level
    await User.updateOne({ _id: req.userId }, { $pull: { devices: { fcmToken } } });
  }
  res.json({ success: true, message: 'Logged out' });
});

// PUT /auth/change-password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.userId).select('+password');
  if (!user) throw new UnauthorizedError();

  if (!(await user.matchPassword(currentPassword))) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password changed', accessToken: user.generateAccessToken() });
});
