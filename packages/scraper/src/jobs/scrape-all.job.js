#!/usr/bin/env node
/**
 * SCRAPE ALL — Fetch all active RSS sources, parse, deduplicate, publish
 * Usage: node src/jobs/scrape-all.job.js
 */
require('dotenv').config({ path: '../../.env' });
const { connectDB } = require('@readout/shared').config;
const { Source } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;
const rssScraper = require('../scrapers/rss.scraper');
const deduplicator = require('../pipeline/deduplicator.service');
const imageProcessor = require('../pipeline/image-processor.service');
const publisher = require('../pipeline/publisher.service');

const CONCURRENCY = 5;  // Max parallel feed fetches
const SKIP_IMAGES = process.argv.includes('--skip-images');

async function scrapeAll() {
  await connectDB();
  logger.info('[scrape-all] Starting full scrape run...');

  const startTime = Date.now();

  // 1. Get all active sources with active feeds
  const sources = await Source.getActiveFeeds();
  logger.info(`[scrape-all] Found ${sources.length} active sources`);

  let totalFetched = 0;
  let totalNew = 0;
  let totalInserted = 0;
  let totalFeedErrors = 0;

  // 2. Process sources in parallel (limited concurrency)
  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(source => _processSource(source))
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        totalFetched += result.value.fetched;
        totalNew += result.value.newArticles;
        totalInserted += result.value.inserted;
        totalFeedErrors += result.value.errors;
      } else {
        logger.error(`[scrape-all] Source failed: ${batch[idx].name} — ${result.reason.message}`);
        totalFeedErrors++;
      }
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info('═══════════════════════════════════════════');
  logger.info(`[scrape-all] COMPLETE in ${elapsed}s`);
  logger.info(`  Sources:  ${sources.length}`);
  logger.info(`  Fetched:  ${totalFetched} articles from RSS`);
  logger.info(`  New:      ${totalNew} (after dedup)`);
  logger.info(`  Inserted: ${totalInserted} to MongoDB`);
  logger.info(`  Errors:   ${totalFeedErrors} feeds failed`);
  logger.info('═══════════════════════════════════════════');

  process.exit(0);
}

async function _processSource(source) {
  let fetched = 0, newArticles = 0, inserted = 0, errors = 0;

  const activeFeeds = source.feeds.filter(f => f.isActive);
  logger.info(`[scrape-all] ${source.name}: ${activeFeeds.length} feeds`);

  // Collect ALL articles from ALL feeds first
  const allRaw = [];

  for (const feed of activeFeeds) {
    try {
      const raw = await rssScraper.fetchFeed(feed.url, {
        category: feed.category,
        language: feed.language || 'en',
        sourceId: source._id,
        sourceInfo: {
          name: source.name,
          logo: source.logo?.url,
          domain: source.domain,
          trustScore: source.trustScore,
        },
      });
      fetched += raw.length;
      allRaw.push(...raw);

      if (!raw.length) {
        await publisher.recordSourceError(source._id, feed.url, 'Empty feed');
        errors++;
      }
    } catch (err) {
      logger.error(`[scrape-all] Feed failed: ${feed.url} — ${err.message}`);
      await publisher.recordSourceError(source._id, feed.url, err.message);
      errors++;
    }
  }

  if (!allRaw.length) return { fetched, newArticles, inserted, errors };

  try {
    // Deduplicate ALL articles from this source at once (within-batch + DB)
    const fresh = await deduplicator.filterDuplicates(allRaw);
    newArticles = fresh.length;

    if (!fresh.length) return { fetched, newArticles, inserted, errors };

    // Process images (optional skip for speed)
    let processed = fresh;
    if (!SKIP_IMAGES) {
      processed = await imageProcessor.processBatch(fresh, 5);
    }

    // Auto-publish as 'published' for dev + generate unique slugs
    processed = processed.map((a, idx) => {
      // Generate slug from title
      let slug = (a.title || 'article')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 60)
        .replace(/^-+|-+$/g, '');

      // Append full sourceUrlHash to guarantee uniqueness (sha256 = always unique per URL)
      slug = slug + '-' + a.sourceUrlHash;

      return {
        ...a,
        slug,
        // Fallback for empty summary (some feeds like Indian Express don't include it)
        summary: a.summary || a.title || 'No summary available',
        status: process.env.NODE_ENV === 'production' ? 'ai_generated' : 'published',
        publishedAt: a.originalPublishedAt || new Date(),
      };
    });

    // Insert ALL at once
    const result = await publisher.publishBatch(processed);
    inserted = result.inserted;

    // Update source stats for first feed (simplified)
    await publisher.updateSourceStats(source._id, activeFeeds[0].url, result.inserted);
  } catch (err) {
    logger.error(`[scrape-all] Source ${source.name} publish failed: ${err.message}`);
    errors++;
  }

  return { fetched, newArticles, inserted, errors };
}

scrapeAll().catch(err => { logger.error(err); process.exit(1); });