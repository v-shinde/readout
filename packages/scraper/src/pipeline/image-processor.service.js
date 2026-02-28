const axios = require('axios');
const logger = require('@readout/shared').utils.logger;

/**
 * Process thumbnail image: validate URL is reachable
 */
exports.processImage = async function processImage(article) {
  const url = article.media && article.media.thumbnail && article.media.thumbnail.url;
  if (!url) return article;

  try {
    const response = await axios.head(url, { timeout: 5000 });
    const contentType = response.headers['content-type'] || '';

    if (!contentType.startsWith('image/')) {
      article.media.thumbnail = null;
      article.media.primaryType = 'none';
    }
    return article;
  } catch (err) {
    article.media.thumbnail = null;
    article.media.primaryType = 'none';
    return article;
  }
};

/**
 * Batch process images for multiple articles.
 */
exports.processBatch = async function processBatch(articles, concurrency) {
  if (!concurrency) concurrency = 10;
  const results = [];

  for (let i = 0; i < articles.length; i += concurrency) {
    const chunk = articles.slice(i, i + concurrency);
    const processed = await Promise.allSettled(
      chunk.map(function (a) { return exports.processImage(a); })
    );
    processed.forEach(function (result, idx) {
      results.push(result.status === 'fulfilled' ? result.value : chunk[idx]);
    });
  }

  const withImages = results.filter(function (a) {
    return a.media && a.media.thumbnail && a.media.thumbnail.url;
  }).length;
  logger.info('[image-processor] ' + withImages + '/' + results.length + ' articles have valid images');

  return results;
};