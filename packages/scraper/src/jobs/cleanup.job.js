#!/usr/bin/env node
/**
 * CLEANUP — Reset database for fresh seeding or clean old data
 * Usage:
 *   node src/jobs/cleanup.job.js --reset     # Drop all collections (DESTRUCTIVE)
 *   node src/jobs/cleanup.job.js --articles   # Remove only articles
 *   node src/jobs/cleanup.job.js --activities # Remove only activities
 *   node src/jobs/cleanup.job.js --users      # Remove only test users
 *   node src/jobs/cleanup.job.js --all        # Remove articles + activities + users (keep sources)
 */
require('dotenv').config({ path: '../../.env' });
const { connectDB } = require('@readout/shared').config;
const { Article, Source, User, AnonymousUser, UserActivity, Bookmark, Comment, Notification, DailyDigest, FeedCache, Topic, Timeline } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;
const readline = require('readline');

const args = process.argv.slice(2);

async function confirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`⚠️  ${message} (y/N): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function cleanup() {
  await connectDB();

  if (args.includes('--reset')) {
    const ok = await confirm('This will DROP ALL COLLECTIONS. Are you sure?');
    if (!ok) { logger.info('Cancelled.'); process.exit(0); }

    const collections = [Article, Source, User, AnonymousUser, UserActivity, Bookmark, Comment, Notification, DailyDigest, FeedCache, Topic, Timeline];
    for (const Model of collections) {
      const count = await Model.countDocuments();
      await Model.deleteMany({});
      logger.info(`  Deleted ${count} from ${Model.modelName}`);
    }
    logger.info('[cleanup] Full reset complete.');
  }

  else if (args.includes('--articles')) {
    const count = await Article.countDocuments();
    await Article.deleteMany({});
    logger.info(`[cleanup] Deleted ${count} articles`);
  }

  else if (args.includes('--activities')) {
    const count = await UserActivity.countDocuments();
    await UserActivity.deleteMany({});
    logger.info(`[cleanup] Deleted ${count} activities`);
  }

  else if (args.includes('--users')) {
    const [uCount, aCount] = await Promise.all([
      User.countDocuments({ email: /@readout-test\.com$/ }),
      AnonymousUser.countDocuments(),
    ]);
    await User.deleteMany({ email: /@readout-test\.com$/ });
    await AnonymousUser.deleteMany({});
    logger.info(`[cleanup] Deleted ${uCount} test users + ${aCount} anonymous users`);
  }

  else if (args.includes('--all')) {
    const ok = await confirm('Delete articles, activities, users, bookmarks, comments? (Sources kept)');
    if (!ok) { logger.info('Cancelled.'); process.exit(0); }

    const results = await Promise.all([
      Article.deleteMany({}),
      UserActivity.deleteMany({}),
      User.deleteMany({ email: /@readout-test\.com$/ }),
      AnonymousUser.deleteMany({}),
      Bookmark.deleteMany({}),
      Comment.deleteMany({}),
      Notification.deleteMany({}),
      DailyDigest.deleteMany({}),
      FeedCache.deleteMany({}),
    ]);

    const names = ['Articles', 'Activities', 'Test Users', 'Anon Users', 'Bookmarks', 'Comments', 'Notifications', 'Digests', 'FeedCache'];
    results.forEach((r, i) => logger.info(`  ${names[i]}: ${r.deletedCount} deleted`));
    logger.info('[cleanup] All data cleaned (sources preserved).');
  }

  else {
    logger.info('Usage:');
    logger.info('  --reset      Drop everything');
    logger.info('  --articles   Remove articles only');
    logger.info('  --activities Remove activities only');
    logger.info('  --users      Remove test users only');
    logger.info('  --all        Remove all except sources');
  }

  process.exit(0);
}

cleanup().catch(err => { logger.error(err); process.exit(1); });