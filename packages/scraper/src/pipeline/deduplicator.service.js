const { Article } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

/**
 * Filter out articles that already exist in the database
 * AND remove within-batch duplicates.
 * Uses sourceUrlHash for O(1) deduplication.
 *
 * @param {Array} articles - Array of raw article objects
 * @returns {Array} Only new (non-duplicate) articles
 */
exports.filterDuplicates = async (articles) => {
  if (!articles.length) return [];

  // Step 1: Remove within-batch duplicates (keep first occurrence)
  const seenInBatch = new Set();
  const uniqueArticles = [];
  for (const a of articles) {
    if (!seenInBatch.has(a.sourceUrlHash)) {
      seenInBatch.add(a.sourceUrlHash);
      uniqueArticles.push(a);
    }
  }
  const batchDupes = articles.length - uniqueArticles.length;

  // Step 2: Check against database
  const hashes = uniqueArticles.map(a => a.sourceUrlHash);

  const existing = await Article.find(
    { sourceUrlHash: { $in: hashes } },
    { sourceUrlHash: 1 }
  ).lean();

  const existingSet = new Set(existing.map(a => a.sourceUrlHash));

  const fresh = uniqueArticles.filter(a => !existingSet.has(a.sourceUrlHash));

  const dbDupes = uniqueArticles.length - fresh.length;
  if (batchDupes > 0 || dbDupes > 0) {
    logger.info(`[deduplicator] Filtered ${batchDupes} batch dupes + ${dbDupes} DB dupes, ${fresh.length} new`);
  }

  return fresh;
};

/**
 * Check if a single article URL already exists
 */
exports.exists = async (sourceUrlHash) => {
  const doc = await Article.findOne({ sourceUrlHash }, { _id: 1 }).lean();
  return !!doc;
};