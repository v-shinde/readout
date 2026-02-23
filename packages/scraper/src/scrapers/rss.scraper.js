const RSSParser = require('rss-parser');
const crypto = require('crypto');
const logger = require('@readout/shared').utils.logger;

const parser = new RSSParser({
  timeout: 15000,
  headers: { 'User-Agent': 'Readout-News-Bot/1.0' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
      ['dc:creator', 'creator'],
    ],
  },
});

/**
 * Fetch and parse an RSS feed URL
 * @param {string} feedUrl - RSS feed URL
 * @param {Object} feedMeta - { category, language, sourceId, sourceInfo }
 * @returns {Array} Normalized article objects ready for pipeline
 */
exports.fetchFeed = async (feedUrl, feedMeta = {}) => {
  const { category, language = 'en', sourceId, sourceInfo } = feedMeta;

  try {
    const feed = await parser.parseURL(feedUrl);
    const articles = [];

    for (const item of (feed.items || [])) {
      const sourceUrl = item.link || item.guid;
      if (!sourceUrl || !item.title) continue;

      // Extract best image
      const image = _extractImage(item);

      // Build normalized article
      articles.push({
        title: _cleanText(item.title, 300),
        summary: _cleanText(item.contentSnippet || item.content || item.description || '', 500),
        fullContent: _cleanText(item.content || item.contentSnippet || '', 50000),
        sourceUrl,
        sourceUrlHash: crypto.createHash('sha256').update(sourceUrl).digest('hex'),

        category: category || 'india',
        language: language || 'en',

        source: sourceId,
        sourceInfo: sourceInfo || {},

        originalAuthor: item.creator || item.author || null,
        originalPublishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),

        media: {
          thumbnail: image ? { url: image, alt: item.title } : null,
          primaryType: image ? 'image' : 'none',
        },

        status: 'ai_generated', // Will go through review
        priority: 'normal',

        // Tags from categories in RSS
        tags: _extractTags(item),
      });
    }

    logger.info(`[rss.scraper] ${feedUrl} → ${articles.length} articles`);
    return articles;
  } catch (err) {
    logger.error(`[rss.scraper] Failed ${feedUrl}: ${err.message}`);
    return [];
  }
};

/**
 * Extract best image from RSS item
 */
function _extractImage(item) {
  // media:content
  if (item.mediaContent?.length) {
    const img = item.mediaContent.find(m => m.$ && m.$.medium === 'image');
    if (img?.$?.url) return img.$.url;
    if (item.mediaContent[0]?.$?.url) return item.mediaContent[0].$.url;
  }
  // media:thumbnail
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  // enclosure
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image')) return item.enclosure.url;
  // og:image from content
  if (item.content) {
    const match = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Extract tags from RSS item categories
 */
function _extractTags(item) {
  const tags = [];
  if (item.categories?.length) {
    item.categories.forEach(cat => {
      const tag = (typeof cat === 'string' ? cat : cat._).toLowerCase().trim();
      if (tag && tag.length < 50) tags.push(tag);
    });
  }
  return tags.slice(0, 10);
}

/**
 * Clean text: strip HTML, normalize whitespace
 */
function _cleanText(text, maxLen = 500) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')          // Strip HTML
    .replace(/&[a-z]+;/gi, ' ')       // Strip HTML entities
    .replace(/\s+/g, ' ')             // Normalize whitespace
    .trim()
    .slice(0, maxLen);
}