const OpenAI = require('openai');
const logger = require('@readout/shared').utils.logger;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

exports.generateSummary = async (title, content) => {
  const response = await openai.chat.completions.create({
    model: MODEL, temperature: 0.3, max_tokens: 200,
    messages: [
      {
        role: 'system',
        content: `You are a news summarizer. Write EXACTLY 60 words (±3). Rules:
- Facts only: WHO, WHAT, WHEN, WHERE
- Simple, clear language. Neutral tone.
- Present tense. No clickbait. No opinions.
- No phrases like "In a recent development" or "According to reports"
- Start directly with the key fact.`,
      },
      { role: 'user', content: `Title: ${title}\n\nContent: ${content?.slice(0, 3000)}` },
    ],
  });

  const summary = response.choices[0].message.content.trim();
  const wordCount = summary.split(/\s+/).filter(Boolean).length;

  return {
    summary, wordCount,
    model: MODEL,
    confidence: (wordCount >= 57 && wordCount <= 63) ? 0.9 : 0.7,
    tokensUsed: response.usage?.total_tokens || 0,
  };
};

exports.extractEntities = async (title, summary) => {
  const response = await openai.chat.completions.create({
    model: MODEL, temperature: 0.1, max_tokens: 300,
    messages: [
      { role: 'system', content: 'Extract named entities. Return ONLY JSON: { "people": [], "organizations": [], "locations": [], "events": [] }' },
      { role: 'user', content: `Title: ${title}\nSummary: ${summary}` },
    ],
  });
  try { return JSON.parse(response.choices[0].message.content); } catch { return { people: [], organizations: [], locations: [], events: [] }; }
};

exports.classifyCategory = async (title, content) => {
  const categories = 'india, world, politics, business, technology, startups, entertainment, sports, science, health, education, automobile, lifestyle, hatke, finance, crypto, ai_ml';
  const response = await openai.chat.completions.create({
    model: MODEL, temperature: 0.1, max_tokens: 200,
    messages: [
      { role: 'system', content: `Classify into ONE primary category from: ${categories}. Also suggest 5 tags. Return ONLY JSON: { "category": "", "subCategory": "", "tags": [], "topicDistribution": { "category1": 0.8, "category2": 0.2 } }` },
      { role: 'user', content: `Title: ${title}\n${content?.slice(0, 1000)}` },
    ],
  });
  try { return JSON.parse(response.choices[0].message.content); } catch { return { category: 'india', tags: [], topicDistribution: {} }; }
};

exports.analyzeSentiment = async (text) => {
  const response = await openai.chat.completions.create({
    model: MODEL, temperature: 0.1, max_tokens: 50,
    messages: [
      { role: 'system', content: 'Analyze sentiment. Return ONLY JSON: { "score": 0.0, "label": "neutral" }. Score: -1 (negative) to 1 (positive). Label: positive/neutral/negative/mixed.' },
      { role: 'user', content: text.slice(0, 500) },
    ],
  });
  try { return JSON.parse(response.choices[0].message.content); } catch { return { score: 0, label: 'neutral' }; }
};

exports.processArticle = async (articleData) => {
  const { title, content, sourceUrl, sourceName, category: hintCategory } = articleData;

  const [summaryResult, entities, classification, sentiment] = await Promise.allSettled([
    exports.generateSummary(title, content),
    exports.extractEntities(title, content?.slice(0, 500) || title),
    exports.classifyCategory(title, content),
    exports.analyzeSentiment(title + ' ' + (content?.slice(0, 300) || '')),
  ]);

  return {
    summary: summaryResult.status === 'fulfilled' ? summaryResult.value.summary : title.slice(0, 200),
    summaryWordCount: summaryResult.status === 'fulfilled' ? summaryResult.value.wordCount : 0,
    aiModel: {
      model: MODEL,
      confidence: summaryResult.status === 'fulfilled' ? summaryResult.value.confidence : 0,
      generatedAt: new Date(),
    },
    entities: entities.status === 'fulfilled' ? entities.value : {},
    category: classification.status === 'fulfilled' ? classification.value.category : (hintCategory || 'india'),
    subCategory: classification.status === 'fulfilled' ? classification.value.subCategory : null,
    tags: classification.status === 'fulfilled' ? classification.value.tags : [],
    aiMetadata: {
      sentiment: sentiment.status === 'fulfilled' ? sentiment.value : { score: 0, label: 'neutral' },
      topicDistribution: classification.status === 'fulfilled' ? classification.value.topicDistribution : {},
      qualityScore: summaryResult.status === 'fulfilled' ? summaryResult.value.confidence : 0.5,
    },
  };
};
