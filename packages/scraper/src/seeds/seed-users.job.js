#!/usr/bin/env node
/**
 * SEED USERS — Create 50 registered users + 100 anonymous users with varied preferences
 * Usage: node src/seeds/seed-users.job.js
 */
require('dotenv').config({ path: '../../.env' });
const { connectDB } = require('@readout/shared').config;
const { User, AnonymousUser } = require('@readout/shared').models;
const { CATEGORIES, COLD_START_PHASES } = require('@readout/shared').constants;
const logger = require('@readout/shared').utils.logger;
const crypto = require('crypto');

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Priya', 'Ananya', 'Diya', 'Arjun', 'Riya', 'Ishaan', 'Kavya', 'Rohan', 'Sneha', 'Vikram', 'Neha', 'Siddharth', 'Pooja', 'Manish', 'Nisha', 'Rahul', 'Divya', 'Amit', 'Meera', 'Raj', 'Tanya', 'Kunal', 'Simran', 'Varun', 'Aarohi', 'Nikhil', 'Sanya', 'Karan', 'Jyoti', 'Deepak', 'Shruti', 'Gaurav', 'Anjali', 'Suresh', 'Lakshmi', 'Ajay', 'Kriti', 'Dev', 'Sakshi', 'Harsh', 'Aisha', 'Pranav', 'Ritika', 'Yash', 'Swati', 'Mohit', 'Nandini'];
const LAST_NAMES = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Reddy', 'Gupta', 'Joshi', 'Verma', 'Nair', 'Chopra', 'Malhotra', 'Iyer', 'Desai', 'Banerjee', 'Mishra', 'Chauhan', 'Pillai', 'Menon', 'Das', 'Rao'];

// User personas with realistic preference distributions
const PERSONAS = [
  { name: 'Tech Enthusiast', cats: ['technology', 'startups', 'ai_ml', 'science'], weight: 0.2 },
  { name: 'Business Pro', cats: ['business', 'finance', 'startups', 'politics'], weight: 0.15 },
  { name: 'News Junkie', cats: ['india', 'world', 'politics'], weight: 0.2 },
  { name: 'Sports Fan', cats: ['sports', 'entertainment'], weight: 0.15 },
  { name: 'Entertainment Buff', cats: ['entertainment', 'lifestyle', 'hatke'], weight: 0.1 },
  { name: 'Science Nerd', cats: ['science', 'health', 'technology', 'ai_ml'], weight: 0.1 },
  { name: 'Casual Reader', cats: ['india', 'entertainment', 'sports', 'technology'], weight: 0.1 },
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

function pickPersona() {
  const r = Math.random();
  let cumulative = 0;
  for (const p of PERSONAS) {
    cumulative += p.weight;
    if (r <= cumulative) return p;
  }
  return PERSONAS[0];
}

function generateCategoryScores(categories) {
  const scores = {};
  categories.forEach(cat => { scores[cat] = 0.3 + Math.random() * 0.7; }); // 0.3-1.0
  // Add some low scores for other categories (noise)
  CATEGORIES.filter(c => !categories.includes(c)).forEach(cat => {
    if (Math.random() < 0.3) scores[cat] = Math.random() * 0.3; // 0-0.3
  });
  return scores;
}

async function seedUsers() {
  await connectDB();
  logger.info('[seed-users] Starting user seed...');

  // ===================== REGISTERED USERS =====================
  let createdUsers = 0;
  const userIds = [];

  for (let i = 0; i < 50; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = pickRandom(LAST_NAMES);
    const persona = pickPersona();
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@readout-test.com`;

    try {
      const phase = pickRandom(['EXPLORING', 'WARMING', 'PERSONALIZED', 'PERSONALIZED', 'PERSONALIZED']);
      const daysAgo = Math.floor(Math.random() * 90);
      const joinDate = new Date(Date.now() - daysAgo * 86400000);

      const user = await User.create({
        name: `${firstName} ${lastName}`,
        email,
        password: 'TestPass123!',
        authProvider: 'local',
        isVerified: true,
        isActive: true,
        role: i === 0 ? 'admin' : (i < 3 ? 'editor' : 'user'),
        onboardingCompleted: true,
        preferences: {
          categories: persona.cats,
          language: Math.random() < 0.8 ? 'en' : 'hi',
          theme: pickRandom(['light', 'dark', 'auto']),
          fontSize: pickRandom(['small', 'medium', 'large']),
          notifications: {
            pushEnabled: Math.random() < 0.7,
            breakingNews: Math.random() < 0.6,
            dailyDigest: Math.random() < 0.5,
            weeklyRoundup: Math.random() < 0.3,
          },
        },
        personalization: {
          categoryScores: generateCategoryScores(persona.cats),
          coldStartPhase: phase,
          engagementProfile: {
            type: pickRandom(['power_reader', 'casual_scanner', 'headline_grazer', 'deep_diver']),
            avgSessionMinutes: 2 + Math.floor(Math.random() * 15),
            avgArticlesPerSession: 3 + Math.floor(Math.random() * 15),
          },
          readingPatterns: {
            preferredReadingHours: pickN([7, 8, 9, 12, 13, 18, 19, 20, 21, 22], 3).sort(),
            preferredDays: pickN([0, 1, 2, 3, 4, 5, 6], 5).sort(),
          },
        },
        stats: {
          totalArticlesRead: Math.floor(Math.random() * 500) + 10,
          totalShares: Math.floor(Math.random() * 50),
          totalBookmarks: Math.floor(Math.random() * 30),
          sessionsCount: Math.floor(Math.random() * 100) + 5,
          streak: { current: Math.floor(Math.random() * 14), longest: Math.floor(Math.random() * 30) },
          joinedAt: joinDate,
        },
        lastLoginAt: new Date(Date.now() - Math.floor(Math.random() * 3) * 86400000),
        lastActiveAt: new Date(Date.now() - Math.floor(Math.random() * 2) * 86400000),
        createdAt: joinDate,
      });

      userIds.push(user._id);
      createdUsers++;
    } catch (err) {
      if (err.code !== 11000) logger.error(`[seed-users] User ${email}: ${err.message}`);
    }
  }

  logger.info(`[seed-users] Created ${createdUsers} registered users`);
  if (createdUsers > 0) {
    logger.info(`[seed-users] Admin: ${FIRST_NAMES[0].toLowerCase()}.${LAST_NAMES[0].toLowerCase()}0@readout-test.com / TestPass123!`);
  }

  // ===================== ANONYMOUS USERS =====================
  let createdAnon = 0;

  for (let i = 0; i < 100; i++) {
    const persona = pickPersona();
    const deviceId = crypto.randomBytes(16).toString('hex');
    const daysAgo = Math.floor(Math.random() * 30);

    try {
      const phase = pickRandom(['BRAND_NEW', 'ONBOARDED', 'EARLY_EXPLORING', 'EXPLORING']);

      await AnonymousUser.create({
        deviceId,
        fingerprint: crypto.randomBytes(8).toString('hex'),
        deviceType: pickRandom(['android', 'android', 'android', 'ios', 'ios', 'web']),
        preferences: {
          categories: phase === 'BRAND_NEW' ? [] : persona.cats,
          language: Math.random() < 0.85 ? 'en' : 'hi',
          theme: 'auto',
        },
        personalization: {
          categoryScores: phase === 'BRAND_NEW' ? {} : generateCategoryScores(persona.cats),
          coldStartPhase: phase,
        },
        stats: {
          totalArticlesRead: phase === 'BRAND_NEW' ? 0 : Math.floor(Math.random() * 40),
          sessionsCount: phase === 'BRAND_NEW' ? 1 : Math.floor(Math.random() * 20) + 1,
        },
        isActive: true,
        isMerged: false,
        lastActiveAt: new Date(Date.now() - daysAgo * 86400000),
      });
      createdAnon++;
    } catch (err) {
      if (err.code !== 11000) logger.error(`[seed-users] Anon ${i}: ${err.message}`);
    }
  }

  logger.info(`[seed-users] Created ${createdAnon} anonymous users`);
  logger.info(`[seed-users] Done: ${createdUsers} registered + ${createdAnon} anonymous = ${createdUsers + createdAnon} total`);

  process.exit(0);
}

seedUsers().catch(err => { logger.error(err); process.exit(1); });