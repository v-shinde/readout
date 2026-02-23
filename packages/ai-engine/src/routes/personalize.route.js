const router = require('express').Router();
const PersonalizationEngine = require('../services/personalization-engine.service');
const ColdStartEngine = require('../services/cold-start.service');
const { asyncHandler } = require('@readout/shared').utils;
const { createRedisClient } = require('@readout/shared').config;

let engine = null;
let coldStart = null;

const getEngines = () => {
  if (!engine) {
    const redis = createRedisClient();
    engine = new PersonalizationEngine(redis);
    coldStart = new ColdStartEngine(engine, redis);
  }
  return { engine, coldStart };
};

// POST /ai/v1/personalize/rank — called by user-api
router.post('/rank', asyncHandler(async (req, res) => {
  const { trackingId, isAnonymous, language = 'en', limit = 20 } = req.body;
  const { engine, coldStart } = getEngines();

  const articles = await coldStart.buildFeed(trackingId, isAnonymous, { language, limit });

  res.json({
    success: true,
    data: {
      articles,
      count: articles.length,
      coldStartPhase: coldStart.getUserPhaseById ? undefined : undefined,
    },
  });
}));

// POST /ai/v1/personalize/compute-profile — recompute user profile
router.post('/compute-profile', asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const { engine } = getEngines();
  const profile = await engine.computeUserProfile(userId);
  res.json({ success: true, data: profile });
}));

// POST /ai/v1/personalize/track — real-time tracking from user-api
router.post('/track', asyncHandler(async (req, res) => {
  const { userId, articleId, action, metadata } = req.body;
  const { engine } = getEngines();
  await engine.trackAction(userId, articleId, action, metadata);
  res.json({ success: true });
}));

module.exports = router;
