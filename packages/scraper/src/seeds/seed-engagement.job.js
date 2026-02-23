#!/usr/bin/env node
/**
 * SEED ENGAGEMENT — Generate realistic fake engagement metrics for all articles
 * Usage: node src/seeds/seed-engagement.job.js
 */
require('dotenv').config({ path: '../../.env' });
const { connectDB } = require('@readout/shared').config;
const { Article } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

// Power-law random: most articles get low engagement, few go viral
function powerLaw(min, max, exponent = 2.5) {
  const r = Math.random();
  return Math.floor(min + (max - min) * Math.pow(r, exponent));
}

// Normal-ish distribution around a mean
function gaussian(mean, stddev) {
  const u1 = Math.random(), u2 = Math.random();
  return Math.max(0, Math.round(mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)));
}

function randomReactions(total) {
  const weights = { like: 0.45, love: 0.2, wow: 0.15, sad: 0.1, angry: 0.1 };
  const reactions = {};
  let remaining = total;
  const types = Object.keys(weights);
  types.forEach((type, i) => {
    if (i === types.length - 1) { reactions[type] = remaining; }
    else {
      const count = Math.round(total * weights[type] * (0.5 + Math.random()));
      reactions[type] = Math.min(count, remaining);
      remaining -= reactions[type];
    }
  });
  return reactions;
}

async function seedEngagement() {
  await connectDB();

  const articles = await Article.find({ status: 'published' }).select('_id publishedAt category priority isBreaking').lean();
  logger.info(`[seed-engagement] Processing ${articles.length} articles...`);

  let updated = 0;
  const bulkOps = [];

  for (const article of articles) {
    // Age-based multiplier: newer articles get more engagement
    const ageHours = (Date.now() - new Date(article.publishedAt)) / 3600000;
    const ageFactor = Math.max(0.1, 1 - (ageHours / (7 * 24))); // 0.1-1.0 over 7 days
    const breakingBoost = article.isBreaking ? 5 : 1;
    const priorityBoost = article.priority === 'high' ? 2 : 1;

    const baseMultiplier = ageFactor * breakingBoost * priorityBoost;

    const views = Math.round(powerLaw(50, 50000) * baseMultiplier);
    const uniqueViews = Math.round(views * (0.6 + Math.random() * 0.3)); // 60-90% unique
    const fullReads = Math.round(views * (0.05 + Math.random() * 0.15)); // 5-20% read full
    const shares = Math.round(powerLaw(0, 500) * baseMultiplier * 0.3);
    const bookmarks = Math.round(powerLaw(0, 200) * baseMultiplier * 0.2);
    const totalReactions = Math.round(powerLaw(0, 1000) * baseMultiplier * 0.5);
    const reactions = randomReactions(totalReactions);
    const comments = Math.round(powerLaw(0, 100) * baseMultiplier * 0.3);

    // Compute engagement score (same formula as article.service.js)
    const engagementScore = Math.round(
      (views * 0.1 + uniqueViews * 0.2 + fullReads * 2 + shares * 4 + bookmarks * 3 + comments * 2.5 + totalReactions * 1.5) * 100
    ) / 100;

    // Trending score: HN-style with time decay
    const trendingScore = Math.round(
      (engagementScore / Math.pow(ageHours + 2, 1.5)) * 1000
    ) / 1000;

    // Virality: share ratio
    const viralityScore = views > 0 ? Math.round((shares / views) * 10000) / 10000 : 0;

    bulkOps.push({
      updateOne: {
        filter: { _id: article._id },
        update: {
          $set: {
            'engagement.views': views,
            'engagement.uniqueViews': uniqueViews,
            'engagement.fullReads': fullReads,
            'engagement.shares': shares,
            'engagement.bookmarks': bookmarks,
            'engagement.reactions': reactions,
            'engagement.comments': comments,
            'engagement.engagementScore': engagementScore,
            'engagement.trendingScore': trendingScore,
            'engagement.viralityScore': viralityScore,
          },
        },
      },
    });

    updated++;
  }

  // Bulk write for performance
  if (bulkOps.length) {
    await Article.bulkWrite(bulkOps);
  }

  logger.info(`[seed-engagement] Done: ${updated} articles updated with engagement data`);

  // Log distribution stats
  const topArticles = await Article.find({ status: 'published' })
    .sort({ 'engagement.trendingScore': -1 }).limit(5)
    .select('title engagement.trendingScore engagement.views engagement.shares').lean();

  logger.info('[seed-engagement] Top 5 trending:');
  topArticles.forEach((a, i) => {
    logger.info(`  ${i + 1}. [${a.engagement.trendingScore}] ${a.title.slice(0, 60)}... (${a.engagement.views} views, ${a.engagement.shares} shares)`);
  });

  process.exit(0);
}

seedEngagement().catch(err => { logger.error(err); process.exit(1); });