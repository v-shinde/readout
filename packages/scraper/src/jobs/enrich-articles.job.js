#!/usr/bin/env node
/**
 * ENRICH ARTICLES — Mock AI enrichment for dev (or real AI with --ai flag)
 * Usage: node src/jobs/enrich-articles.job.js [--ai]
 *
 * Mock mode: generates realistic summaries, categories, tags, entities, sentiment
 * AI mode: calls the AI engine (requires OPENAI_API_KEY)
 */
require('dotenv').config({ path: '../../.env' });
const { connectDB } = require('@readout/shared').config;
const { Article } = require('@readout/shared').models;
const { CATEGORIES } = require('@readout/shared').constants;
const logger = require('@readout/shared').utils.logger;
const axios = require('axios');

const USE_AI = process.argv.includes('--ai');
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:5002';
const BATCH_SIZE = 50;

// ============================================
// MOCK ENRICHMENT (no API key needed)
// ============================================

const ENTITY_POOLS = {
  india: { people: ['Narendra Modi', 'Rahul Gandhi', 'Amit Shah', 'Nirmala Sitharaman', 'Arvind Kejriwal'], organizations: ['BJP', 'Congress', 'Supreme Court', 'RBI', 'ISRO'], locations: ['New Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata'] },
  world: { people: ['Joe Biden', 'Vladimir Putin', 'Xi Jinping', 'Rishi Sunak', 'Volodymyr Zelenskyy'], organizations: ['United Nations', 'NATO', 'European Union', 'WHO', 'IMF'], locations: ['Washington DC', 'London', 'Beijing', 'Moscow', 'Geneva'] },
  technology: { people: ['Elon Musk', 'Sam Altman', 'Sundar Pichai', 'Tim Cook', 'Satya Nadella'], organizations: ['Google', 'Apple', 'Microsoft', 'OpenAI', 'Meta'], locations: ['Silicon Valley', 'San Francisco', 'Seattle', 'Bangalore'] },
  business: { people: ['Mukesh Ambani', 'Gautam Adani', 'Ratan Tata', 'Warren Buffett', 'Jeff Bezos'], organizations: ['Reliance', 'Tata Group', 'Infosys', 'SEBI', 'NSE'], locations: ['Mumbai', 'New Delhi', 'New York', 'London'] },
  sports: { people: ['Virat Kohli', 'Rohit Sharma', 'MS Dhoni', 'Neeraj Chopra', 'PV Sindhu'], organizations: ['BCCI', 'ICC', 'IPL', 'FIFA', 'IOC'], locations: ['Mumbai', 'Chennai', 'Kolkata', 'Melbourne', 'London'] },
  entertainment: { people: ['Shah Rukh Khan', 'Alia Bhatt', 'Rajkumar Hirani', 'AR Rahman', 'Deepika Padukone'], organizations: ['Bollywood', 'Netflix India', 'Disney+ Hotstar', 'T-Series', 'YRF'], locations: ['Mumbai', 'Hyderabad', 'Los Angeles'] },
  science: { people: ['K Sivan', 'S Somanath'], organizations: ['ISRO', 'NASA', 'CERN', 'WHO', 'DRDO'], locations: ['Sriharikota', 'Bangalore', 'Geneva'] },
  health: { people: [], organizations: ['WHO', 'AIIMS', 'ICMR', 'CDC', 'Pfizer'], locations: ['Geneva', 'New Delhi', 'New York'] },
  finance: { people: ['Shaktikanta Das', 'Nirmala Sitharaman'], organizations: ['RBI', 'SEBI', 'NSE', 'BSE', 'SBI'], locations: ['Mumbai', 'New Delhi'] },
  crypto: { people: ['Vitalik Buterin', 'CZ Binance', 'Brian Armstrong'], organizations: ['Binance', 'Coinbase', 'SEC', 'Ethereum Foundation'], locations: ['Singapore', 'San Francisco'] },
  startups: { people: ['Bhavish Aggarwal', 'Nithin Kamath', 'Falguni Nayar'], organizations: ['Ola', 'Zerodha', 'Nykaa', 'CRED', 'Razorpay'], locations: ['Bangalore', 'Mumbai', 'Gurgaon'] },
  ai_ml: { people: ['Sam Altman', 'Demis Hassabis', 'Yann LeCun', 'Andrew Ng'], organizations: ['OpenAI', 'DeepMind', 'Anthropic', 'Meta AI', 'Google AI'], locations: ['San Francisco', 'London', 'Montreal'] },
};

const SENTIMENTS = [
  { score: 0.6, label: 'positive' }, { score: 0.3, label: 'positive' },
  { score: 0.0, label: 'neutral' }, { score: 0.0, label: 'neutral' }, { score: 0.0, label: 'neutral' },
  { score: -0.3, label: 'negative' }, { score: -0.5, label: 'negative' },
  { score: 0.1, label: 'mixed' },
];

function pickRandom(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }
function pickN(arr, n) { return [...arr].sort(() => 0.5 - Math.random()).slice(0, Math.min(n, arr.length)); }

function mockEnrich(article) {
  const cat = article.category || 'india';
  const entityPool = ENTITY_POOLS[cat] || ENTITY_POOLS.india;

  // Generate a ~60 word summary from existing summary/title
  let summary = article.summary || article.title;
  const words = summary.split(/\s+/);
  if (words.length > 65) {
    summary = words.slice(0, 60).join(' ') + '.';
  } else if (words.length < 30 && article.fullContent) {
    // Pad from full content
    const contentWords = article.fullContent.split(/\s+/).slice(0, 60 - words.length);
    summary = [...words, ...contentWords].slice(0, 60).join(' ') + '.';
  }
  const summaryWordCount = summary.split(/\s+/).filter(Boolean).length;

  // Entities — pick 1-3 from pool, biased by article content
  const titleLower = (article.title || '').toLowerCase();
  const entities = {
    people: entityPool.people.filter(p => titleLower.includes(p.split(' ')[1]?.toLowerCase() || '___')).slice(0, 2),
    organizations: pickN(entityPool.organizations, 1 + Math.floor(Math.random() * 2)),
    locations: pickN(entityPool.locations, 1 + Math.floor(Math.random() * 2)),
    events: [],
  };
  // If no entity match from title, pick random
  if (!entities.people.length) entities.people = pickN(entityPool.people, Math.random() < 0.5 ? 1 : 0);

  // Tags — combine RSS tags + auto-generated
  const existingTags = article.tags || [];
  const autoTags = pickN([cat, ...Object.keys(ENTITY_POOLS)], 2).filter(t => !existingTags.includes(t));
  const tags = [...new Set([...existingTags, ...autoTags])].slice(0, 8);

  // Sentiment
  const sentiment = pickRandom(SENTIMENTS);

  // Topic distribution
  const topicDistribution = {};
  topicDistribution[cat] = 0.6 + Math.random() * 0.3;
  const secondaryCat = pickRandom(CATEGORIES.filter(c => c !== cat));
  if (secondaryCat) topicDistribution[secondaryCat] = 0.1 + Math.random() * 0.2;

  // Quality & readability scores
  const qualityScore = 0.5 + Math.random() * 0.4;
  const readability = {
    fleschScore: 40 + Math.floor(Math.random() * 40),
    gradeLevel: 6 + Math.floor(Math.random() * 6),
    avgSentenceLength: 12 + Math.floor(Math.random() * 10),
  };

  return {
    summary,
    summaryWordCount,
    entities,
    tags,
    aiModel: { model: 'mock-enricher-v1', version: '1.0', confidence: 0.75, generatedAt: new Date() },
    aiMetadata: {
      sentiment,
      readability,
      complexity: pickRandom(['simple', 'moderate', 'moderate', 'complex']),
      topicDistribution,
      qualityScore: Math.round(qualityScore * 100) / 100,
      freshnessScore: Math.round(Math.random() * 100) / 100,
    },
  };
}

// ============================================
// AI ENRICHMENT (requires running AI engine)
// ============================================

async function aiEnrich(article) {
  const response = await axios.post(`${AI_ENGINE_URL}/ai/v1/summarize/article`, {
    title: article.title,
    content: article.fullContent || article.summary,
    sourceUrl: article.sourceUrl,
    sourceName: article.sourceInfo?.name,
    category: article.category,
  }, { timeout: 30000 });

  return response.data?.data || {};
}

// ============================================
// MAIN
// ============================================

async function enrichArticles() {
  await connectDB();
  const mode = USE_AI ? 'AI' : 'MOCK';
  logger.info(`[enrich] Starting enrichment in ${mode} mode...`);

  // Find articles that need enrichment (no AI model set or low confidence)
  const query = {
    status: { $in: ['published', 'ai_generated'] },
    $or: [
      { 'aiModel.model': { $exists: false } },
      { 'aiModel.confidence': { $lt: 0.5 } },
      { summaryWordCount: { $exists: false } },
      { summaryWordCount: 0 },
    ],
  };

  const total = await Article.countDocuments(query);
  logger.info(`[enrich] Found ${total} articles to enrich`);

  let enriched = 0, failed = 0;

  // Process in batches
  const cursor = Article.find(query)
    .select('title summary fullContent category tags sourceInfo sourceUrl')
    .cursor({ batchSize: BATCH_SIZE });

  const bulkOps = [];

  for await (const article of cursor) {
    try {
      let data;
      if (USE_AI) {
        data = await aiEnrich(article);
      } else {
        data = mockEnrich(article);
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: article._id },
          update: {
            $set: {
              summary: data.summary || article.summary,
              summaryWordCount: data.summaryWordCount || 0,
              entities: data.entities || {},
              tags: data.tags || article.tags || [],
              aiModel: data.aiModel || {},
              'aiMetadata.sentiment': data.aiMetadata?.sentiment,
              'aiMetadata.readability': data.aiMetadata?.readability,
              'aiMetadata.complexity': data.aiMetadata?.complexity,
              'aiMetadata.topicDistribution': data.aiMetadata?.topicDistribution,
              'aiMetadata.qualityScore': data.aiMetadata?.qualityScore,
              'aiMetadata.freshnessScore': data.aiMetadata?.freshnessScore,
            },
          },
        },
      });
      enriched++;

      // Flush bulk ops every BATCH_SIZE
      if (bulkOps.length >= BATCH_SIZE) {
        await Article.bulkWrite(bulkOps);
        logger.info(`[enrich] Processed ${enriched}/${total}...`);
        bulkOps.length = 0;
      }
    } catch (err) {
      failed++;
      if (failed <= 5) logger.error(`[enrich] Failed: ${article.title?.slice(0, 50)} — ${err.message}`);
    }
  }

  // Flush remaining
  if (bulkOps.length) {
    await Article.bulkWrite(bulkOps);
  }

  logger.info(`[enrich] Done: ${enriched} enriched, ${failed} failed (${mode} mode)`);
  process.exit(0);
}

enrichArticles().catch(err => { logger.error(err); process.exit(1); });