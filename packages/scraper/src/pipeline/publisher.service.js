const { Article, Source } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

const CHUNK_SIZE = 200; // MongoDB handles this reliably

/**
 * Publish articles to MongoDB.
 * Chunks large batches to avoid silent drops with insertMany.
 * Verifies actual insert count via DB after each chunk.
 *
 * @param {Array} articles - Processed article objects
 * @returns {Object} { inserted, failed, errors, dupes }
 */
exports.publishBatch = async (articles) => {
  if (!articles.length) return { inserted: 0, failed: 0, errors: [], dupes: 0 };

  // Pre-validate: filter out articles missing required fields
  const valid = [];
  const validationErrors = [];

  for (const article of articles) {
    if (!article.title || !article.sourceUrl || !article.sourceUrlHash) {
      validationErrors.push('Missing title/sourceUrl/sourceUrlHash');
      continue;
    }
    if (!article.source) {
      validationErrors.push('Missing source for: ' + (article.title || '').slice(0, 40));
      continue;
    }
    valid.push(article);
  }

  if (validationErrors.length && validationErrors.length <= 3) {
    validationErrors.forEach(function (e) { logger.warn('[publisher] Skipped: ' + e); });
  } else if (validationErrors.length) {
    logger.warn('[publisher] Skipped ' + validationErrors.length + ' invalid articles');
  }

  if (!valid.length) return { inserted: 0, failed: articles.length, errors: validationErrors, dupes: 0 };

  // Count before insert to verify actual inserts
  const countBefore = await Article.countDocuments();

  const allErrors = [];
  let totalDupes = 0;

  // Process in chunks to avoid MongoDB silent drops on large batches
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);

    try {
      await Article.insertMany(chunk, { ordered: false });
    } catch (err) {
      if (err.writeErrors) {
        err.writeErrors.forEach(function (we) {
          if (we.code === 11000) {
            totalDupes++;
          } else {
            allErrors.push({ index: we.index + i, message: we.errmsg });
          }
        });
      }
      if (!err.writeErrors) {
        logger.error('[publisher] Chunk error: ' + (err.message || '').slice(0, 200));
        allErrors.push({ message: (err.message || '').slice(0, 200) });
      }
    }
  }

  // Count after to get REAL inserted count
  const countAfter = await Article.countDocuments();
  const actualInserted = countAfter - countBefore;

  if (allErrors.length && allErrors.length <= 3) {
    allErrors.forEach(function (e) {
      logger.error('[publisher] Write error: ' + (e.message || '').slice(0, 200));
    });
  }

  const failed = valid.length - actualInserted - totalDupes;
  logger.info('[publisher] Inserted ' + actualInserted + ', dupes ' + totalDupes + ', errors ' + (failed > 0 ? failed : 0) + ', skipped ' + validationErrors.length);

  return { inserted: actualInserted, failed: failed, errors: allErrors, dupes: totalDupes };
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