#!/usr/bin/env node
/**
 * SEED ACTIVITIES — Generate 10,000+ realistic user activity events
 * Usage: node src/seeds/seed-activities.job.js
 */
require('dotenv').config({ path: '../../.env' });
const { connectDB } = require('@readout/shared').config;
const { User, AnonymousUser, Article, UserActivity } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const ACTIONS_WEIGHTED = [
  // [action, weight] — higher weight = more frequent
  ['view', 30],
  ['read_summary', 25],
  ['read_full', 8],
  ['scroll_past', 15],
  ['share', 3],
  ['bookmark', 4],
  ['reaction', 5],
  ['comment', 2],
  ['not_interested', 3],
  ['search', 3],
  ['category_switch', 2],
];

function pickWeightedAction() {
  const totalWeight = ACTIONS_WEIGHTED.reduce((s, a) => s + a[1], 0);
  let r = Math.random() * totalWeight;
  for (const [action, weight] of ACTIONS_WEIGHTED) {
    r -= weight;
    if (r <= 0) return action;
  }
  return 'view';
}

async function seedActivities() {
  await connectDB();
  logger.info('[seed-activities] Starting activity seed...');

  // Get all users and articles
  const [users, anonUsers, articles] = await Promise.all([
    User.find({ isActive: true }).select('_id preferences.categories personalization.categoryScores').lean(),
    AnonymousUser.find({ isActive: true, isMerged: false }).select('_id preferences.categories personalization.categoryScores').lean(),
    Article.find({ status: 'published' }).select('_id category sourceInfo tags').lean(),
  ]);

  logger.info(`[seed-activities] Users: ${users.length} registered, ${anonUsers.length} anonymous`);
  logger.info(`[seed-activities] Articles: ${articles.length}`);

  if (!articles.length) {
    logger.error('[seed-activities] No articles found! Run scrape first.');
    process.exit(1);
  }

  const allUsers = [
    ...users.map(u => ({ id: u._id, cats: u.preferences?.categories || [], catScores: u.personalization?.categoryScores || {} })),
    ...anonUsers.map(u => ({ id: u._id, cats: u.preferences?.categories || [], catScores: u.personalization?.categoryScores || {} })),
  ];

  // Build category → articles index for realistic activity generation
  const articlesByCategory = {};
  articles.forEach(a => {
    if (!articlesByCategory[a.category]) articlesByCategory[a.category] = [];
    articlesByCategory[a.category].push(a);
  });

  const activities = [];
  const TARGET_ACTIVITIES = 10000;

  for (let i = 0; i < TARGET_ACTIVITIES; i++) {
    const user = pickRandom(allUsers);
    const action = pickWeightedAction();

    // Pick article biased toward user's preferred categories
    let article;
    if (user.cats.length && Math.random() < 0.7) {
      // 70% chance: pick from preferred category
      const cat = pickRandom(user.cats);
      const pool = articlesByCategory[cat] || articles;
      article = pickRandom(pool);
    } else {
      // 30% chance: random article (explore behavior)
      article = pickRandom(articles);
    }

    // Generate random timestamp within last 14 days
    const daysAgo = Math.random() * 14;
    const hoursOffset = Math.floor(Math.random() * 24);
    const timestamp = new Date(Date.now() - daysAgo * 86400000 - hoursOffset * 3600000);

    const metadata = {
      articleCategory: article.category,
      articleSource: article.sourceInfo?.name,
      articleSourceId: article.sourceInfo?.sourceId,
      deviceType: pickRandom(['android', 'android', 'ios', 'web']),
      feedPosition: Math.floor(Math.random() * 30),
    };

    // Action-specific metadata
    switch (action) {
      case 'view':
      case 'read_summary':
        metadata.readDurationSeconds = 1 + Math.floor(Math.random() * 30);
        metadata.scrollDepthPercent = Math.floor(Math.random() * 100);
        metadata.readSource = pickRandom(['feed', 'feed', 'feed', 'category', 'trending', 'search', 'notification']);
        break;
      case 'read_full':
        metadata.readDurationSeconds = 30 + Math.floor(Math.random() * 300);
        metadata.readSource = pickRandom(['feed', 'category', 'search']);
        break;
      case 'share':
        metadata.shareTarget = pickRandom(['whatsapp', 'whatsapp', 'twitter', 'facebook', 'telegram', 'copy_link']);
        break;
      case 'reaction':
        metadata.reactionType = pickRandom(['like', 'like', 'like', 'love', 'wow', 'sad', 'angry']);
        break;
      case 'search':
        metadata.searchQuery = pickRandom(['modi', 'ipl', 'ai', 'stock market', 'election', 'crypto', 'startup', 'bollywood', 'cricket', 'climate']);
        metadata.searchResultCount = Math.floor(Math.random() * 50);
        break;
      case 'category_switch':
        metadata.toCategory = pickRandom(['india', 'technology', 'sports', 'entertainment', 'business', 'world']);
        break;
    }

    activities.push({
      userId: user.id,
      articleId: ['search', 'category_switch'].includes(action) ? undefined : article._id,
      action,
      metadata,
      timestamp,
    });
  }

  // Batch insert for performance
  const BATCH_SIZE = 1000;
  let totalInserted = 0;

  for (let i = 0; i < activities.length; i += BATCH_SIZE) {
    const batch = activities.slice(i, i + BATCH_SIZE);
    try {
      await UserActivity.insertMany(batch, { ordered: false });
      totalInserted += batch.length;
      logger.info(`[seed-activities] Inserted ${totalInserted}/${activities.length}...`);
    } catch (err) {
      // Some may fail due to validation, continue
      totalInserted += err.insertedDocs?.length || 0;
    }
  }

  logger.info(`[seed-activities] Done: ${totalInserted} activity events created`);

  // Distribution stats
  const actionDist = {};
  activities.forEach(a => { actionDist[a.action] = (actionDist[a.action] || 0) + 1; });
  logger.info('[seed-activities] Distribution:');
  Object.entries(actionDist).sort((a, b) => b[1] - a[1]).forEach(([action, count]) => {
    logger.info(`  ${action}: ${count} (${((count / activities.length) * 100).toFixed(1)}%)`);
  });

  process.exit(0);
}

seedActivities().catch(err => { logger.error(err); process.exit(1); });