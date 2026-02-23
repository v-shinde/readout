#!/usr/bin/env node
/**
 * SEED SOURCES — Insert 50+ real RSS news sources into MongoDB
 * Usage: node src/seeds/seed-sources.job.js
 */
require('dotenv').config({ path: '../../.env' });
const { connectDB } = require('@readout/shared').config;
const { Source } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

const SOURCES = [
  // ===================== INDIA =====================
  {
    name: 'NDTV',
    website: 'https://www.ndtv.com',
    domain: 'ndtv.com',
    country: 'IN',
    trustScore: 75,
    biasRating: 'center-left',
    categories: ['india', 'world', 'politics', 'business', 'technology', 'entertainment', 'sports', 'science', 'health'],
    languages: ['en'],
    priority: 1,
    feeds: [
      { url: 'https://feeds.feedburner.com/ndtvnews-india-news', category: 'india', language: 'en' },
      { url: 'https://feeds.feedburner.com/ndtvnews-world-news', category: 'world', language: 'en' },
      { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'india', language: 'en' },
      { url: 'https://feeds.feedburner.com/ndtvprofit-latest', category: 'business', language: 'en' },
      { url: 'https://feeds.feedburner.com/ndtvcooks-latest', category: 'lifestyle', language: 'en' },
    ],
  },
  {
    name: 'Times of India',
    website: 'https://timesofindia.indiatimes.com',
    domain: 'timesofindia.indiatimes.com',
    country: 'IN',
    trustScore: 70,
    biasRating: 'center',
    categories: ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'technology'],
    languages: ['en'],
    priority: 1,
    feeds: [
      { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'india', language: 'en' },
      { url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', category: 'business', language: 'en' },
      { url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms', category: 'technology', language: 'en' },
      { url: 'https://timesofindia.indiatimes.com/rssfeeds/4719161.cms', category: 'sports', language: 'en' },
      { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'world', language: 'en' },
    ],
  },
  {
    name: 'The Hindu',
    website: 'https://www.thehindu.com',
    domain: 'thehindu.com',
    country: 'IN',
    trustScore: 80,
    biasRating: 'center-left',
    categories: ['india', 'world', 'politics', 'business', 'science', 'technology', 'entertainment'],
    languages: ['en'],
    priority: 2,
    feeds: [
      { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'india', language: 'en' },
      { url: 'https://www.thehindu.com/news/international/feeder/default.rss', category: 'world', language: 'en' },
      { url: 'https://www.thehindu.com/business/feeder/default.rss', category: 'business', language: 'en' },
      { url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', category: 'science', language: 'en' },
      { url: 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss', category: 'technology', language: 'en' },
    ],
  },
  {
    name: 'Indian Express',
    website: 'https://indianexpress.com',
    domain: 'indianexpress.com',
    country: 'IN',
    trustScore: 78,
    biasRating: 'center',
    categories: ['india', 'world', 'politics', 'business', 'technology', 'entertainment', 'sports'],
    languages: ['en'],
    priority: 2,
    feeds: [
      { url: 'https://indianexpress.com/section/india/feed/', category: 'india', language: 'en' },
      { url: 'https://indianexpress.com/section/world/feed/', category: 'world', language: 'en' },
      { url: 'https://indianexpress.com/section/business/feed/', category: 'business', language: 'en' },
      { url: 'https://indianexpress.com/section/technology/feed/', category: 'technology', language: 'en' },
      { url: 'https://indianexpress.com/section/sports/feed/', category: 'sports', language: 'en' },
      { url: 'https://indianexpress.com/section/entertainment/feed/', category: 'entertainment', language: 'en' },
    ],
  },
  {
    name: 'Hindustan Times',
    website: 'https://www.hindustantimes.com',
    domain: 'hindustantimes.com',
    country: 'IN',
    trustScore: 72,
    biasRating: 'center-right',
    categories: ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'technology'],
    languages: ['en'],
    priority: 2,
    feeds: [
      { url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', category: 'india', language: 'en' },
      { url: 'https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml', category: 'world', language: 'en' },
      { url: 'https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml', category: 'business', language: 'en' },
      { url: 'https://www.hindustantimes.com/feeds/rss/cricket/rssfeed.xml', category: 'sports', language: 'en' },
      { url: 'https://www.hindustantimes.com/feeds/rss/technology/rssfeed.xml', category: 'technology', language: 'en' },
    ],
  },
  {
    name: 'Mint',
    website: 'https://www.livemint.com',
    domain: 'livemint.com',
    country: 'IN',
    trustScore: 77,
    biasRating: 'center',
    categories: ['business', 'finance', 'technology', 'startups', 'politics'],
    languages: ['en'],
    priority: 3,
    feeds: [
      { url: 'https://www.livemint.com/rss/news', category: 'business', language: 'en' },
      { url: 'https://www.livemint.com/rss/technology', category: 'technology', language: 'en' },
      { url: 'https://www.livemint.com/rss/markets', category: 'finance', language: 'en' },
    ],
  },
  {
    name: 'Economic Times',
    website: 'https://economictimes.indiatimes.com',
    domain: 'economictimes.indiatimes.com',
    country: 'IN',
    trustScore: 74,
    biasRating: 'center',
    categories: ['business', 'finance', 'technology', 'startups'],
    languages: ['en'],
    priority: 3,
    feeds: [
      { url: 'https://economictimes.indiatimes.com/rssfeedstopstories.cms', category: 'business', language: 'en' },
      { url: 'https://economictimes.indiatimes.com/rssfeedmostread.cms', category: 'business', language: 'en' },
    ],
  },
  {
    name: 'India Today',
    website: 'https://www.indiatoday.in',
    domain: 'indiatoday.in',
    country: 'IN',
    trustScore: 70,
    biasRating: 'center',
    categories: ['india', 'world', 'politics', 'business', 'technology', 'entertainment', 'sports'],
    languages: ['en'],
    priority: 2,
    feeds: [
      { url: 'https://www.indiatoday.in/rss/home', category: 'india', language: 'en' },
      { url: 'https://www.indiatoday.in/rss/1206614', category: 'technology', language: 'en' },
      { url: 'https://www.indiatoday.in/rss/1206577', category: 'sports', language: 'en' },
    ],
  },
  {
    name: 'Scroll.in',
    website: 'https://scroll.in',
    domain: 'scroll.in',
    country: 'IN',
    trustScore: 73,
    biasRating: 'center-left',
    categories: ['india', 'politics', 'science', 'entertainment'],
    languages: ['en'],
    priority: 4,
    feeds: [
      { url: 'https://scroll.in/rss/feed', category: 'india', language: 'en' },
    ],
  },
  {
    name: 'The Wire',
    website: 'https://thewire.in',
    domain: 'thewire.in',
    country: 'IN',
    trustScore: 72,
    biasRating: 'center-left',
    categories: ['india', 'politics', 'science', 'world'],
    languages: ['en'],
    priority: 4,
    feeds: [
      { url: 'https://thewire.in/feed', category: 'india', language: 'en' },
    ],
  },

  // ===================== TECHNOLOGY =====================
  {
    name: 'TechCrunch',
    website: 'https://techcrunch.com',
    domain: 'techcrunch.com',
    country: 'US',
    trustScore: 80,
    biasRating: 'center',
    categories: ['technology', 'startups', 'ai_ml'],
    languages: ['en'],
    priority: 2,
    feeds: [
      { url: 'https://techcrunch.com/feed/', category: 'technology', language: 'en' },
    ],
  },
  {
    name: 'The Verge',
    website: 'https://www.theverge.com',
    domain: 'theverge.com',
    country: 'US',
    trustScore: 78,
    biasRating: 'center',
    categories: ['technology', 'entertainment', 'science'],
    languages: ['en'],
    priority: 3,
    feeds: [
      { url: 'https://www.theverge.com/rss/index.xml', category: 'technology', language: 'en' },
    ],
  },
  {
    name: 'Ars Technica',
    website: 'https://arstechnica.com',
    domain: 'arstechnica.com',
    country: 'US',
    trustScore: 82,
    biasRating: 'center',
    categories: ['technology', 'science', 'ai_ml'],
    languages: ['en'],
    priority: 3,
    feeds: [
      { url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'technology', language: 'en' },
    ],
  },
  {
    name: 'Wired',
    website: 'https://www.wired.com',
    domain: 'wired.com',
    country: 'US',
    trustScore: 79,
    biasRating: 'center',
    categories: ['technology', 'science', 'ai_ml'],
    languages: ['en'],
    priority: 3,
    feeds: [
      { url: 'https://www.wired.com/feed/rss', category: 'technology', language: 'en' },
    ],
  },
  {
    name: 'Gadgets360',
    website: 'https://www.gadgets360.com',
    domain: 'gadgets360.com',
    country: 'IN',
    trustScore: 72,
    biasRating: 'center',
    categories: ['technology', 'entertainment'],
    languages: ['en'],
    priority: 3,
    feeds: [
      { url: 'https://feeds.feedburner.com/gadgets360-latest', category: 'technology', language: 'en' },
    ],
  },

  // ===================== WORLD =====================
  {
    name: 'Reuters',
    website: 'https://www.reuters.com',
    domain: 'reuters.com',
    country: 'US',
    trustScore: 90,
    biasRating: 'center',
    categories: ['world', 'business', 'politics', 'technology', 'science'],
    languages: ['en'],
    priority: 1,
    feeds: [
      { url: 'https://www.reutersagency.com/feed/', category: 'world', language: 'en' },
    ],
  },
  {
    name: 'BBC News',
    website: 'https://www.bbc.com',
    domain: 'bbc.com',
    country: 'GB',
    trustScore: 88,
    biasRating: 'center',
    categories: ['world', 'india', 'technology', 'science', 'health', 'entertainment', 'sports'],
    languages: ['en'],
    priority: 1,
    feeds: [
      { url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'world', language: 'en' },
      { url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml', category: 'india', language: 'en' },
      { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'technology', language: 'en' },
      { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', category: 'science', language: 'en' },
      { url: 'https://feeds.bbci.co.uk/news/health/rss.xml', category: 'health', language: 'en' },
      { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'sports', language: 'en' },
    ],
  },
  {
    name: 'Al Jazeera',
    website: 'https://www.aljazeera.com',
    domain: 'aljazeera.com',
    country: 'QA',
    trustScore: 75,
    biasRating: 'center-left',
    categories: ['world', 'politics'],
    languages: ['en'],
    priority: 3,
    feeds: [
      { url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'world', language: 'en' },
    ],
  },
  {
    name: 'The Guardian',
    website: 'https://www.theguardian.com',
    domain: 'theguardian.com',
    country: 'GB',
    trustScore: 80,
    biasRating: 'center-left',
    categories: ['world', 'politics', 'technology', 'science', 'entertainment'],
    languages: ['en'],
    priority: 2,
    feeds: [
      { url: 'https://www.theguardian.com/world/rss', category: 'world', language: 'en' },
      { url: 'https://www.theguardian.com/technology/rss', category: 'technology', language: 'en' },
      { url: 'https://www.theguardian.com/science/rss', category: 'science', language: 'en' },
    ],
  },

  // ===================== SCIENCE & HEALTH =====================
  {
    name: 'Science Daily',
    website: 'https://www.sciencedaily.com',
    domain: 'sciencedaily.com',
    country: 'US',
    trustScore: 85,
    biasRating: 'center',
    categories: ['science', 'health', 'technology'],
    languages: ['en'],
    priority: 4,
    feeds: [
      { url: 'https://www.sciencedaily.com/rss/all.xml', category: 'science', language: 'en' },
    ],
  },

  // ===================== FINANCE / CRYPTO =====================
  {
    name: 'CoinDesk',
    website: 'https://www.coindesk.com',
    domain: 'coindesk.com',
    country: 'US',
    trustScore: 70,
    biasRating: 'center',
    categories: ['crypto', 'finance', 'technology'],
    languages: ['en'],
    priority: 5,
    feeds: [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto', language: 'en' },
    ],
  },

  // ===================== HATKE / LIFESTYLE =====================
  {
    name: 'Scoopwhoop',
    website: 'https://www.scoopwhoop.com',
    domain: 'scoopwhoop.com',
    country: 'IN',
    trustScore: 55,
    biasRating: 'center',
    categories: ['hatke', 'entertainment', 'lifestyle'],
    languages: ['en'],
    priority: 6,
    feeds: [
      { url: 'https://www.scoopwhoop.com/rss', category: 'hatke', language: 'en' },
    ],
  },

  // ===================== AUTO =====================
  {
    name: 'Autocar India',
    website: 'https://www.autocarindia.com',
    domain: 'autocarindia.com',
    country: 'IN',
    trustScore: 75,
    biasRating: 'center',
    categories: ['automobile'],
    languages: ['en'],
    priority: 5,
    feeds: [
      { url: 'https://www.autocarindia.com/RSS/rss.ashx', category: 'automobile', language: 'en' },
    ],
  },

  // ===================== EDUCATION =====================
  {
    name: 'NDTV Education',
    website: 'https://www.ndtv.com/education',
    domain: 'ndtv.com/education',
    country: 'IN',
    trustScore: 73,
    biasRating: 'center',
    categories: ['education'],
    languages: ['en'],
    priority: 5,
    feeds: [
      { url: 'https://feeds.feedburner.com/ndtv/education-feed', category: 'education', language: 'en' },
    ],
  },
];

async function seedSources() {
  await connectDB();
  logger.info(`[seed-sources] Starting with ${SOURCES.length} sources...`);

  let created = 0, updated = 0, skipped = 0;

  for (const src of SOURCES) {
    try {
      // Add default fields to feeds
      const feeds = src.feeds.map(f => ({
        ...f,
        type: 'rss',
        isActive: true,
        fetchIntervalMinutes: 15,
        errorCount: 0,
        consecutiveErrors: 0,
        articlesScraped: 0,
      }));

      const existing = await Source.findOne({ domain: src.domain });
      if (existing) {
        await Source.updateOne({ domain: src.domain }, { $set: { ...src, feeds } });
        updated++;
      } else {
        await Source.create({ ...src, feeds, isActive: true });
        created++;
      }
    } catch (err) {
      if (err.code === 11000) { skipped++; }
      else { logger.error(`[seed-sources] Failed: ${src.name} — ${err.message}`); }
    }
  }

  logger.info(`[seed-sources] Done: ${created} created, ${updated} updated, ${skipped} skipped`);
  const totalFeeds = SOURCES.reduce((sum, s) => sum + s.feeds.length, 0);
  logger.info(`[seed-sources] Total feeds: ${totalFeeds}`);
  process.exit(0);
}

seedSources().catch(err => { logger.error(err); process.exit(1); });