const { Article } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

/**
 * Filter out articles that already exist in the database.
 * Uses sourceUrlHash for O(1) deduplication.
 *
 * @param {Array} articles - Array of raw article objects
 * @returns {Array} Only new (non-duplicate) articles
 */
exports.filterDuplicates = async (articles) => {
  if (!articles.length) return [];

  const hashes = articles.map(a => a.sourceUrlHash);

  // Batch check existing hashes
  const existing = await Article.find(
    { sourceUrlHash: { $in: hashes } },
    { sourceUrlHash: 1 }
  ).lean();

  const existingSet = new Set(existing.map(a => a.sourceUrlHash));

  const fresh = articles.filter(a => !existingSet.has(a.sourceUrlHash));

  const dupeCount = articles.length - fresh.length;
  if (dupeCount > 0) {
    logger.info(`[deduplicator] Filtered ${dupeCount} duplicates, ${fresh.length} new`);
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