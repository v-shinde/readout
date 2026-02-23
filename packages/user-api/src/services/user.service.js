const { User, AnonymousUser, UserActivity, Bookmark, FeedCache } = require('@readout/shared').models;
const { CATEGORIES, LANGUAGES } = require('@readout/shared').constants;
const activityService = require('./activity.service');
const logger = require('@readout/shared').utils.logger;

// ============================================
// PROFILE OPERATIONS
// ============================================

/**
 * Get user profile (with Redis cache)
 */
exports.getProfile = async (userId, redis) => {
  const cacheKey = `user:profile:full:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const user = await User.findById(userId)
    .select('-password -passwordResetToken -verificationToken')
    .lean();

  if (user) {
    await redis.setex(cacheKey, 900, JSON.stringify(user)); // 15 min cache
  }

  return user;
};

/**
 * Update user profile fields
 */
exports.updateProfile = async (userId, updates, redis) => {
  const allowed = ['name', 'phone'];
  const safe = {};
  allowed.forEach(f => { if (updates[f] !== undefined) safe[f] = updates[f]; });

  const user = await User.findByIdAndUpdate(userId, { $set: safe }, { new: true, runValidators: true })
    .select('-password').lean();

  // Invalidate profile cache
  await redis.del(`user:profile:full:${userId}`);
  await redis.del(`user:profile:${userId}`);

  return user;
};

// ============================================
// PREFERENCES
// ============================================

/**
 * Update user preferences (works for both anonymous and registered)
 */
exports.updatePreferences = async (trackingId, isAnonymous, prefs, redis) => {
  const updates = {};

  if (prefs.language && LANGUAGES.includes(prefs.language)) {
    updates['preferences.language'] = prefs.language;
  }
  if (prefs.categories?.length) {
    const valid = prefs.categories.filter(c => CATEGORIES.includes(c));
    if (valid.length) updates['preferences.categories'] = valid;
  }
  if (prefs.theme && ['light', 'dark', 'auto'].includes(prefs.theme)) {
    updates['preferences.theme'] = prefs.theme;
  }
  if (prefs.fontSize && ['small', 'medium', 'large'].includes(prefs.fontSize)) {
    updates['preferences.fontSize'] = prefs.fontSize;
  }
  if (prefs.feedType) updates['preferences.feedType'] = prefs.feedType;

  // Notification preferences
  if (prefs.notifications) {
    Object.keys(prefs.notifications).forEach(k => {
      updates[`preferences.notifications.${k}`] = prefs.notifications[k];
    });
  }

  if (prefs.autoplayVideos !== undefined) updates['preferences.autoplayVideos'] = prefs.autoplayVideos;
  if (prefs.dataSaverMode !== undefined) updates['preferences.dataSaverMode'] = prefs.dataSaverMode;

  const Model = isAnonymous ? AnonymousUser : User;
  const doc = await Model.findByIdAndUpdate(trackingId, { $set: updates }, { new: true }).lean();

  // Invalidate caches
  await activityService.invalidateUserCaches(trackingId, redis);

  return doc?.preferences;
};

// ============================================
// ONBOARDING
// ============================================

/**
 * Complete onboarding: set initial categories, seed personalization scores
 */
exports.completeOnboarding = async (trackingId, isAnonymous, categories, language, redis) => {
  const valid = categories.filter(c => CATEGORIES.includes(c));
  if (!valid.length) throw new Error('Select at least one category');

  const updates = {
    'preferences.categories': valid,
    'personalization.coldStartPhase': 'ONBOARDED',
  };
  if (language) updates['preferences.language'] = language;

  const Model = isAnonymous ? AnonymousUser : User;
  const doc = await Model.findByIdAndUpdate(trackingId, { $set: updates }, { new: true }).lean();

  // Mark onboarding complete for registered users
  if (!isAnonymous) {
    await User.updateOne({ _id: trackingId }, { $set: { onboardingCompleted: true } });
  }

  // Seed initial category scores (equal weight for selected categories)
  const catScores = {};
  valid.forEach(cat => { catScores[`personalization.categoryScores.${cat}`] = 0.5; });
  await Model.updateOne({ _id: trackingId }, { $set: catScores });

  // Invalidate caches
  await activityService.invalidateUserCaches(trackingId, redis);

  return { preferences: doc.preferences, coldStartPhase: 'ONBOARDED' };
};

// ============================================
// DEVICE MANAGEMENT
// ============================================

/**
 * Register or update a device (for push notifications)
 */
exports.registerDevice = async (userId, device) => {
  const { deviceId, deviceType, fcmToken, appVersion, osVersion } = device;

  // Try adding new device
  const addResult = await User.updateOne(
    { _id: userId, 'devices.deviceId': { $ne: deviceId } },
    {
      $push: {
        devices: {
          deviceId, deviceType, fcmToken, appVersion, osVersion,
          lastActiveAt: new Date(), isActive: true,
        },
      },
    }
  );

  // If device already exists, update the token
  if (addResult.modifiedCount === 0) {
    await User.updateOne(
      { _id: userId, 'devices.deviceId': deviceId },
      {
        $set: {
          'devices.$.fcmToken': fcmToken,
          'devices.$.lastActiveAt': new Date(),
          'devices.$.appVersion': appVersion,
          'devices.$.osVersion': osVersion,
          'devices.$.isActive': true,
        },
      }
    );
  }
};

/**
 * Remove a device
 */
exports.removeDevice = async (userId, deviceId) => {
  await User.updateOne({ _id: userId }, { $pull: { devices: { deviceId } } });
};

// ============================================
// READING HISTORY
// ============================================

exports.getReadingHistory = async (userId, page = 1, limit = 30) => {
  return UserActivity.find({
    userId,
    action: { $in: ['read_summary', 'read_full'] },
  })
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit).limit(limit)
    .populate('articleId', 'title summary media.thumbnail category sourceInfo publishedAt')
    .lean();
};

// ============================================
// USER STATS
// ============================================

exports.getUserStats = async (userId) => {
  const [user, sessionStats] = await Promise.all([
    User.findById(userId).select('stats personalization.engagementProfile personalization.coldStartPhase').lean(),
    UserActivity.getSessionStats(userId, 30),
  ]);

  if (!user) return null;

  return {
    ...user.stats,
    engagementProfile: user.personalization?.engagementProfile,
    coldStartPhase: user.personalization?.coldStartPhase,
    sessionStats: sessionStats[0] || null,
  };
};

// ============================================
// ACCOUNT DELETION (GDPR)
// ============================================

/**
 * Soft-delete a user account.
 * Anonymizes PII and queues a background cleanup job.
 */
exports.deleteAccount = async (userId, redis) => {
  // Soft delete user
  await User.findByIdAndUpdate(userId, {
    $set: {
      isActive: false,
      email: `deleted_${userId}@readout.app`,
      name: 'Deleted User',
      avatar: null,
    },
    $unset: {
      password: 1,
      googleId: 1,
      appleId: 1,
      phone: 1,
      devices: 1,
    },
  });

  // Invalidate all caches
  await activityService.invalidateUserCaches(userId, redis);

  // TODO: Queue background job to:
  // 1. Delete all UserActivity records for this user (after 90 days)
  // 2. Remove bookmarks
  // 3. Anonymize comments (keep content, remove user info)
  // 4. Remove from all notification targets
  // 5. Remove from search/recommendation models

  logger.info(`[user.service] Account deactivated: ${userId}`);

  return true;
};

// ============================================
// AVATAR
// ============================================

exports.updateAvatar = async (userId, url, key, redis) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { avatar: { url, key } } },
    { new: true }
  ).select('avatar').lean();

  await redis.del(`user:profile:full:${userId}`);

  return user?.avatar;
};