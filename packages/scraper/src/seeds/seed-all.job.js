#!/usr/bin/env node
/**
 * SEED ALL — Run the complete data pipeline for development
 * Usage: node src/seeds/seed-all.job.js [--skip-images] [--ai]
 *
 * Pipeline:
 *   1. seed:sources     → Insert 24 sources with 50+ RSS feeds
 *   2. scrape           → Fetch all RSS feeds → 1000-2500 articles
 *   3. enrich           → Mock AI enrichment (summaries, entities, tags)
 *   4. seed:engagement  → Fake engagement metrics (power-law distribution)
 *   5. seed:users       → 50 registered + 100 anonymous users
 *   6. seed:activities  → 10,000+ activity events for personalization
 */
require('dotenv').config({ path: '../../.env' });
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2).join(' ');

const steps = [
  { name: 'seed:sources', cmd: `node ${ROOT}/seeds/seed-sources.job.js` },
  { name: 'scrape', cmd: `node ${ROOT}/jobs/scrape-all.job.js ${args.includes('--skip-images') ? '--skip-images' : ''}` },
  { name: 'enrich', cmd: `node ${ROOT}/jobs/enrich-articles.job.js ${args.includes('--ai') ? '--ai' : ''}` },
  { name: 'seed:engagement', cmd: `node ${ROOT}/seeds/seed-engagement.job.js` },
  { name: 'seed:users', cmd: `node ${ROOT}/seeds/seed-users.job.js` },
  { name: 'seed:activities', cmd: `node ${ROOT}/seeds/seed-activities.job.js` },
];

console.log('═══════════════════════════════════════════════');
console.log('  READOUT — Full Development Seed Pipeline');
console.log('═══════════════════════════════════════════════');
console.log(`  Steps: ${steps.length}`);
console.log(`  Mode: ${args.includes('--ai') ? 'AI enrichment' : 'Mock enrichment'}`);
console.log(`  Images: ${args.includes('--skip-images') ? 'Skipped' : 'Validated'}`);
console.log('═══════════════════════════════════════════════\n');

const startTime = Date.now();

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  const stepStart = Date.now();
  console.log(`\n[${i + 1}/${steps.length}] ${step.name}...`);
  console.log('─'.repeat(50));

  try {
    execSync(step.cmd, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env },
    });
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`✅ ${step.name} completed in ${elapsed}s`);
  } catch (err) {
    console.error(`❌ ${step.name} FAILED`);
    console.error(err.message);
    console.log('\nContinuing with remaining steps...\n');
  }
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('\n═══════════════════════════════════════════════');
console.log(`  PIPELINE COMPLETE in ${totalElapsed}s`);
console.log('═══════════════════════════════════════════════');
console.log('\nYour Readout dev database is ready!');
console.log('Test login: aarav.sharma0@readout-test.com / TestPass123!');
console.log('\nNext: npm run dev --workspace=@readout/user-api');