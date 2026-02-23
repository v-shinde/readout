const CATEGORIES = [
  'india', 'world', 'politics', 'business', 'technology',
  'startups', 'entertainment', 'sports', 'science',
  'health', 'education', 'automobile', 'lifestyle',
  'hatke', 'finance', 'crypto', 'ai_ml',
];

const LANGUAGES = ['en', 'hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml'];

const COLD_START_PHASES = ['BRAND_NEW', 'ONBOARDED', 'EARLY_EXPLORING', 'EXPLORING', 'WARMING', 'PERSONALIZED'];

const DEFAULT_CATEGORIES = ['india', 'technology', 'entertainment', 'sports', 'business'];

module.exports = { CATEGORIES, LANGUAGES, COLD_START_PHASES, DEFAULT_CATEGORIES };
