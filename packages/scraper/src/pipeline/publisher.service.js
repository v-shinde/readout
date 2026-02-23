const { Article, Source } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

/**
 * Publish articles to MongoDB.
 * Uses insertMany with ordered:false to continue on individual failures.
 *
 * @param {Array} articles - Processed article objects
 * @returns {Object} { inserted, failed, errors }
 */
exports.publishBatch = async (articles) => {
  if (!articles.length) return { inserted: 0, failed: 0, errors: [] };

  const errors = [];
  let inserted = 0;

  try {
    const result = await Article.insertMany(articles, {
      ordered: false,        // Continue on individual errors
      rawResult: true,
    });
    inserted = result.insertedCount || articles.length;
  } catch (err) {
    // insertMany with ordered:false throws on partial failure
    if (err.insertedDocs) {
      inserted = err.insertedDocs.length;
    }
    if (err.writeErrors) {
      err.writeErrors.forEach(we => {
        // Skip duplicate key errors (already exists)
        if (we.code !== 11000) {
          errors.push({ index: we.index, message: we.errmsg });
        }
      });
    }
  }

  const failed = articles.length - inserted;
  logger.info(`[publisher] Inserted ${inserted}, failed ${failed}${errors.length ? `, errors: ${errors.length}` : ''}`);

  return { inserted, failed, errors };
};

/**
 * Publish a single article (for real-time scraping)
 */
exports.publishOne = async (article) => {
  try {
    const doc = await Article.create(article);
    return { success: true, id: doc._id };
  } catch (err) {
    if (err.code === 11000) return { success: false, reason: 'duplicate' };
    return { success: false, reason: err.message };
  }
};

/**
 * Update source stats after a scrape run
 */
exports.updateSourceStats = async (sourceId, feedUrl, articlesInserted) => {
  await Source.recordFetchSuccess(sourceId, feedUrl, articlesInserted);
};

/**
 * Update source error after a failed scrape
 */
exports.recordSourceError = async (sourceId, feedUrl, errorMsg) => {
  await Source.recordFetchError(sourceId, feedUrl, errorMsg);
};