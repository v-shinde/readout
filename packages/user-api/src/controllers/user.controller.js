const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const userService = require('../services/user.service');
const activityService = require('../services/activity.service');

// GET /users/me
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await userService.getProfile(req.userId, req.app.locals.redis);
  if (!user) throw new NotFoundError('User');
  res.json({ success: true, data: user });
});

// PUT /users/me
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.userId, req.body, req.app.locals.redis);
  res.json({ success: true, data: user });
});

// PUT /users/me/preferences
exports.updatePreferences = asyncHandler(async (req, res) => {
  const preferences = await userService.updatePreferences(
    req.trackingId, req.isAnonymous, req.body, req.app.locals.redis
  );
  res.json({ success: true, data: { preferences } });
});

// PUT /users/me/onboarding
exports.completeOnboarding = asyncHandler(async (req, res) => {
  const { categories, language } = req.body;
  if (!categories?.length) throw new ValidationError('Select at least one category');

  const result = await userService.completeOnboarding(
    req.trackingId, req.isAnonymous, categories, language, req.app.locals.redis
  );
  res.json({ success: true, data: result });
});

// GET /users/me/stats
exports.getStats = asyncHandler(async (req, res) => {
  const stats = await userService.getUserStats(req.userId);
  if (!stats) throw new NotFoundError('User');
  res.json({ success: true, data: stats });
});

// GET /users/me/reading-history
exports.getReadingHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const history = await userService.getReadingHistory(req.userId, +page, +limit);
  res.json({ success: true, data: { history, page: +page } });
});

// PUT /users/me/avatar
exports.updateAvatar = asyncHandler(async (req, res) => {
  const { url, key } = req.body;
  const avatar = await userService.updateAvatar(req.userId, url, key, req.app.locals.redis);
  res.json({ success: true, data: avatar });
});

// DELETE /users/me
exports.deleteAccount = asyncHandler(async (req, res) => {
  await userService.deleteAccount(req.userId, req.app.locals.redis);
  res.json({ success: true, message: 'Account deactivated' });
});

// PUT /users/me/devices
exports.registerDevice = asyncHandler(async (req, res) => {
  await userService.registerDevice(req.userId, req.body);
  res.json({ success: true });
});

// DELETE /users/me/devices/:deviceId
exports.removeDevice = asyncHandler(async (req, res) => {
  await userService.removeDevice(req.userId, req.params.deviceId);
  res.json({ success: true });
});