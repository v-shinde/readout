# Readout - Architecture Document

> AI-powered, personalized news aggregation platform with 60-word summaries.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Package Details](#package-details)
4. [Personalization Architecture](#personalization-architecture)
5. [Data Models](#data-models)
6. [Scraper Pipeline](#scraper-pipeline)
7. [Feed Composition & Ranking](#feed-composition--ranking)
8. [Caching Strategy](#caching-strategy)
9. [Authentication & User Lifecycle](#authentication--user-lifecycle)
10. [Notification System](#notification-system)
11. [Ad Injection](#ad-injection)
12. [Infrastructure & Deployment](#infrastructure--deployment)
13. [API Surface](#api-surface)
14. [Incomplete / TODO Components](#incomplete--todo-components)

---

## System Overview

```
                                 +------------------+
                                 |   Mobile Client  |
                                 +--------+---------+
                                          |
                                          v
                              +-----------+-----------+
                              |      user-api         |
                              |   (port 5000)         |
                              |  Feed, Auth, Search,  |
                              |  Activity, Bookmarks  |
                              +----+------+------+----+
                                   |      |      |
                       +-----------+      |      +-----------+
                       v                  v                  v
              +--------+------+  +--------+-------+  +------+----------+
              |   ai-engine   |  |   admin-api    |  | notification-   |
              |  (port 5002)  |  |  (port 5001)   |  | service (5004)  |
              |  Personalize, |  |  Dashboard,    |  |  FCM, Digest,   |
              |  Summarize,   |  |  Moderation,   |  |  Push Workers   |
              |  Trending     |  |  Ads, Sources  |  |                 |
              +-------+-------+  +-------+--------+  +------+----------+
                      |                  |                    |
                      +--------+---------+--------------------+
                               |
                       +-------v--------+
                       |    shared      |
                       |  Models, Auth, |
                       |  Config, Utils |
                       +---+--------+---+
                           |        |
                     +-----v--+  +--v-----+
                     |MongoDB |  | Redis  |
                     +--------+  +--------+
                                      ^
              +--------------+        |
              |   scraper    +--------+
              | (port 5003)  |
              | RSS, Dedup,  |
              | Enrich, Seed |
              +--------------+
```

**Tech Stack:** Node.js 18, Express, MongoDB 7, Redis 7, OpenAI (GPT-4o-mini), BullMQ, Turborepo, Docker, Kubernetes

---

## Monorepo Structure

```
readout/
├── .env / .env.example
├── .github/workflows/         # CI per service
│   ├── user-api.yaml
│   ├── admin-api.yaml
│   ├── ai-engine.yaml
│   ├── scraper.yaml
│   └── notification-service.yaml
├── infra/
│   ├── docker/
│   │   └── docker-compose.dev.yaml    # Full local stack
│   └── k8s/
│       ├── base/namespace.yaml
│       └── user-api/                  # Deployment, Service, HPA
├── packages/
│   ├── shared/                # Common models, middleware, config, utils
│   ├── user-api/              # User-facing REST API
│   ├── admin-api/             # Admin dashboard API
│   ├── ai-engine/             # AI personalization + summarization
│   ├── scraper/               # News ingestion pipeline + seeds
│   └── notification-service/  # Push notifications + digest workers
├── package.json               # Workspace root (npm workspaces)
├── turbo.json                 # Turborepo pipeline config
└── .nvmrc                     # Node 18
```

**Workspace wiring:** All packages import `@readout/shared` for models, middleware, constants, and utilities.

---

## Package Details

### `shared` - Foundation Layer

| Directory | Contents |
|-----------|----------|
| `models/` | 13 Mongoose models (User, AnonymousUser, Article, Source, UserActivity, Bookmark, Comment, Topic, Timeline, Notification, DailyDigest, FeedCache, AdCampaign) |
| `middleware/` | authenticate, requireAuth, optionalAuth, requireRole, errorHandler, rateLimiters (feed/auth/activity/search), deviceTracker |
| `config/` | MongoDB connection (pool 10-50, zstd compression), Redis client (ioredis, lazy connect) |
| `constants/` | 17 CATEGORIES, 9 LANGUAGES, 6 COLD_START_PHASES, DEFAULT_CATEGORIES |
| `events/` | EventBus (singleton EventEmitter), 16 event type constants |
| `validators/` | express-validator chains for register, login, anonymous auth |
| `utils/` | Winston logger, AppError hierarchy (404/401/403/400/409), hashUrl, paginate, asyncHandler, generateOTP |

### `user-api` - Consumer API (port 5000)

| Module | Responsibilities |
|--------|-----------------|
| **Auth** | Register, login, Google OAuth, anonymous onboarding, token refresh, password reset, anonymous-to-user merge, logout |
| **Feed** | Personalized, for-you, trending, latest, breaking, category, explore, daily-digest, topics, timelines, source, infinite-scroll (next) |
| **Article** | Get summary/full, related articles, view tracking, share tracking, reactions, report, not-interested |
| **Search** | Full-text search, autocomplete suggestions, trending queries, topic search |
| **User** | Profile CRUD, preferences, onboarding, stats, reading history, avatar, devices, account deletion |
| **Bookmark** | Toggle, folders, notes, bulk check |
| **Comment** | CRUD, threading (3 levels), likes, reporting, auto-flag at 3 reports |
| **Poll** | View, vote, results with percentages |
| **Notification** | List, unread count, mark read, settings |
| **Activity** | Track single/batch, session start/end, hide source, mute topic |
| **Ad Service** | Native ad injection into feeds, impression/click tracking, frequency capping |

### `admin-api` - Admin Dashboard (port 5001)

| Module | Responsibilities |
|--------|-----------------|
| **Dashboard** | Overview stats, engagement charts, user growth, content breakdown, realtime metrics |
| **Articles** | CRUD, status workflow (draft > in_review > published > archived), featured/breaking toggles, bulk ops, review queue |
| **Sources** | CRUD, toggle active, feed testing, per-source stats |
| **Users** | List, role management, ban/unban, activity history, segmentation |
| **Moderation** | Flagged article/comment queues, approve/block/dismiss, stats |
| **Notifications** | Broadcast, schedule, history, analytics, cancel |
| **Digest** | List, auto-generate from engagement, manual curation, publish |
| **Ads** | Campaign CRUD, approval workflow, analytics |

### `ai-engine` - Intelligence Layer (port 5002)

| Module | Responsibilities |
|--------|-----------------|
| **PersonalizationEngine** | User profile computation, article ranking (5-signal scoring), diversity enforcement, action tracking, cache invalidation |
| **ColdStartEngine** | 6-phase feed builder, progressive personalization, exploration injection |
| **TrendingEngine** | HN-style trending score, virality metric, batch recomputation |
| **AI Summarization** | OpenAI-powered: 60-word summaries, entity extraction (NER), category classification, sentiment analysis |
| **Workers (TODO)** | BullMQ workers for summarize, profile-compute, trending, vectorize |

### `scraper` - Ingestion Pipeline (port 5003)

| Module | Responsibilities |
|--------|-----------------|
| **RSS Scraper** | Feed fetching (rss-parser), media extraction, normalization |
| **Deduplicator** | Within-batch + DB dedup via sourceUrlHash (SHA256) |
| **Image Processor** | HEAD validation, content-type check, broken URL removal |
| **Publisher** | Chunked bulk insert (200/batch), duplicate key handling, source stat updates |
| **Enrich Job** | Mock or AI enrichment (summary, entities, tags, sentiment, quality) |
| **Seed Jobs** | 24+ sources, 50+ feeds, engagement distribution, 150 users, 10k+ activities |

### `notification-service` - Push & Digest (port 5004)

All services are TODO placeholders for: FCM integration, digest generation, scheduler, BullMQ push/digest workers.

---

## Personalization Architecture

This is the core differentiator. Personalization spans 3 services and uses a 6-phase cold-start strategy.

### Cold-Start Phases

```
Phase            Trigger                Feed Strategy
───────────────  ─────────────────────  ──────────────────────────────────
BRAND_NEW        0 reads, no prefs     70% trending + 30% breaking
ONBOARDED        0 reads, has prefs    70% category articles + 40% trending (interleaved at 60:40)
EARLY_EXPLORING  1-19 reads            Semi-personalized + 2 random exploration articles
EXPLORING        20-49 reads           Increased personalization, 25% diversity cap
WARMING          50-99 reads           Full PersonalizationEngine, 15% diversity
PERSONALIZED     100+ reads            Full PersonalizationEngine, 10% diversity
```

### User Profile Computation

`PersonalizationEngine.computeUserProfile(userId)` aggregates 30 days of activity:

```
Category Scoring:
  For each category user interacted with:
    score = (reads * 2.0 + shares * 4.0 + bookmarks * 3.5 + reactions * 2.5)
    normalized = score / max(allCategoryScores)    # 0.0 - 1.0

Source Scoring:
  For each source:
    score = totalActions / max(allSourceActions)    # 0.0 - 1.0

Peak Hours:
  Top 4 most active reading hours (0-23)
```

Profile is cached in Redis for 30 minutes (`user:profile:{userId}`).

### Article Ranking Algorithm (Mature Users)

`PersonalizationEngine.rankArticlesForUser()` scores each article with 5 weighted signals:

```
FINAL_SCORE =
    0.35 * relevance
  + 0.25 * recency
  + 0.15 * popularity
  + 0.10 * source_trust
  + 0.05 * editorial

Where:
  relevance   = 0.3 + (categoryScore * 0.5) + (sourceScore * 0.2)
  recency     = 0.5 ^ (ageHours / 6)          # 6-hour half-life
  popularity  = log10(1 + views*0.1 + reads*1 + shares*3 + bookmarks*2) / 5
  source_trust= trustScore / 100
  editorial   = (breaking? +0.5) + (featured? +0.3) + (highPriority? +0.2)
```

### Activity Signal Weights

| Action | Weight | Effect |
|--------|--------|--------|
| `read_full` | +5.0 | Strong positive |
| `share` | +4.0 | Strong positive |
| `bookmark` | +3.5 | Strong positive |
| `comment` | +3.0 | Positive |
| `reaction` | +2.5 | Positive |
| `read_summary` | +2.0 | Moderate positive |
| `poll_vote` | +2.0 | Moderate positive |
| `view` | +0.5 | Weak positive |
| `scroll_past` | -0.5 | Weak negative |
| `not_interested` | -5.0 | Strong negative (invalidates feed cache) |
| `hide_source` | -10.0 | Very strong negative (invalidates feed + profile cache) |

### Diversity Enforcement

After scoring, `_applyDiversity()` prevents category bubbles:

```
For each category:
  if count(category) > maxCategoryPct * totalArticles:
    excess articles get 0.5x score multiplier
    re-sort by adjusted score

Default maxCategoryPct per phase:
  EARLY_EXPLORING  = 0.40 (40%)
  EXPLORING        = 0.25 (25%)
  WARMING          = 0.15 (15%)
  PERSONALIZED     = 0.10 (10%)
```

### Cold-Start Scoring (EARLY_EXPLORING Phase)

Before the full engine kicks in, a simpler scoring formula is used:

```
score = categoryScore * 0.3
      + (inPreferredCategory? 0.2 : 0)
      + recency * 0.3
      + log10(1 + engagement) * 0.1

Plus: 2 random exploration articles injected from non-preferred categories
```

### Trending Score (Hacker News-style)

```
points = views*0.1 + fullReads*1 + shares*3 + bookmarks*2 + comments*2 + reactions*1.5
score  = points / (ageHours + 2)^1.5   +   (trustScore/100) * 0.1
```

### Virality Metric

```
virality = (shares / max(views, 1)) * 10000
```

### Personalization Data Flow

```
User opens app
    │
    ├──► user-api: GET /feed/personalized
    │       │
    │       ├──► Check FeedCache (MongoDB) ───► Cache HIT → return slice
    │       │
    │       └──► Cache MISS → POST ai-engine/personalize/rank
    │               │
    │               ├──► ColdStartEngine.getUserPhase()
    │               │       └──► Classify: BRAND_NEW...PERSONALIZED
    │               │
    │               ├──► Phase < WARMING?
    │               │       └──► Phase-specific handler (trending/category/semi-personalized)
    │               │
    │               └──► Phase >= WARMING?
    │                       ├──► PersonalizationEngine._getUserProfile() (Redis → DB)
    │                       ├──► Fetch 200 candidate articles (72h, language-filtered)
    │                       ├──► Filter out recently viewed (Redis Set)
    │                       ├──► Score each article (5-signal formula)
    │                       ├──► Apply diversity enforcement
    │                       └──► Return ranked articles
    │
    ├──► user-api: Inject native ads (every 10 articles, max 3)
    │
    └──► user-api: Cache result in FeedCache + return paginated slice

User interacts with article
    │
    ├──► user-api: POST /activity/track
    │       ├──► Log to UserActivity (MongoDB, fire-and-forget)
    │       ├──► Increment article engagement in Redis
    │       ├──► Add to user:viewed set (24h TTL)
    │       └──► Update user stats counters
    │
    └──► Negative action (not_interested, hide_source)?
            ├──► Invalidate feed cache (FeedCache + Redis)
            ├──► Invalidate user profile cache
            └──► Next feed request will re-rank from scratch
```

### For-You Feed Composition (Page 1)

```
┌─────────────────────────────────────────┐
│  [BREAKING] Top 3 breaking news         │  ← Article.getBreaking()
│  _feedType: 'breaking'                  │
├─────────────────────────────────────────┤
│  [TIMELINE] 1 live timeline card        │  ← Timeline.getLive()
│  _feedType: 'timeline_card'             │
├─────────────────────────────────────────┤
│  [PERSONALIZED] Ranked articles         │  ← AI engine ranked
│  _feedType: 'personalized'             │
│  With native_ad cards every 10 items    │
│  _feedType: 'native_ad'                │
└─────────────────────────────────────────┘

Pages 2+: Falls back to trending if personalized cache exhausted
```

---

## Data Models

### Core Entities

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Source     │────>│   Article    │<────│   Comment    │
│  name, feeds,│     │ title,       │     │ content,     │
│  trustScore, │     │ summary (60w)│     │ threading,   │
│  biasRating  │     │ fullContent, │     │ likes, flags │
│              │     │ engagement,  │     └──────────────┘
│              │     │ AI metadata  │
└──────────────┘     └──────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            v               v               v
   ┌────────────┐  ┌───────────────┐  ┌─────────────┐
   │  Bookmark  │  │ UserActivity  │  │   Topic     │
   │  folders,  │  │ 27 action     │  │  keywords,  │
   │  notes     │  │ types, 180d   │  │  trending   │
   │            │  │ TTL           │  │  score      │
   └────────────┘  └───────────────┘  └─────────────┘
```

### User Model Hierarchy

```
┌────────────────────────────────┐
│            User                │
│  auth: email/google/apple/fb   │
│  role: user/editor/admin       │
│  preferences:                  │
│    language, categories,       │
│    theme, fontSize, feedType   │
│  personalization:              │
│    categoryScores (Map)        │
│    sourceScores (Map)          │
│    topicVector                 │
│    readingPatterns             │
│    engagementProfile           │
│    coldStartPhase              │
│  stats:                        │
│    articlesRead, readTime,     │
│    shares, bookmarks, streak   │
│  devices: [{fcmToken, ...}]    │
│  subscription: free/premium    │
└────────────────────────────────┘

┌────────────────────────────────┐
│       AnonymousUser            │
│  deviceId (unique)             │
│  fingerprint                   │
│  preferences (subset)          │
│  personalization (subset)      │
│  stats (subset)                │
│  coldStartPhase                │
│  ──────────────────            │
│  TTL: 90 days inactive         │
│  Merge: mergeIntoUser()        │
│    - migrates preferences      │
│    - takes max(categoryScores) │
│    - sums stats                │
│    - transfers FCM token       │
│    - migrates activities       │
│    - auto-deletes after 7 days │
└────────────────────────────────┘
```

### Article AI Metadata

Each article stores AI-generated fields:

| Field | Source | Description |
|-------|--------|-------------|
| `summary` | OpenAI GPT-4o-mini | Exactly 60 words, facts-only |
| `summaryWordCount` | Computed | Word count verification |
| `entities.people` | OpenAI NER | Named people |
| `entities.organizations` | OpenAI NER | Named orgs |
| `entities.locations` | OpenAI NER | Named places |
| `entities.events` | OpenAI NER | Named events |
| `category` | OpenAI classification | Primary category (17 options) |
| `subCategory` | OpenAI classification | Optional sub-category |
| `tags` | OpenAI classification | Top 5 lowercase tags |
| `aiMetadata.sentiment` | OpenAI analysis | score (-1 to 1) + label |
| `aiMetadata.topicDistribution` | OpenAI classification | Category probability map |
| `aiMetadata.qualityScore` | Computed | 0-1 content quality |
| `aiMetadata.readability` | Computed | Flesch score, grade level |
| `contentVector` | TODO | Embedding vector for similarity |
| `aiModel` | Metadata | model name, version, confidence, timestamp |

---

## Scraper Pipeline

```
┌──────────────────────────────────────────────────────────┐
│                    scrape-all.job.js                       │
│                                                           │
│  1. Source.getActiveFeeds()                               │
│     └──► 24+ sources, 50+ RSS feeds                      │
│                                                           │
│  2. Per source (concurrency: 5):                          │
│     └──► rssScraper.fetchFeed(feedUrl, sourceDoc)        │
│         ├── rss-parser (15s timeout)                     │
│         ├── Extract: title, summary, content, image      │
│         ├── Generate sourceUrlHash (SHA256)              │
│         └── Normalize to Article schema                  │
│                                                           │
│  3. deduplicator.deduplicate(allArticles)                │
│     ├── Within-batch: Set<sourceUrlHash>                 │
│     └── DB lookup: Article.find({sourceUrlHash: $in})    │
│                                                           │
│  4. imageProcessor.processImages(newArticles)            │
│     └── HEAD request per thumbnail, validate image/*     │
│                                                           │
│  5. publisher.publish(validArticles)                     │
│     ├── Auto-generate slug (title + hash suffix)        │
│     ├── Set status: published (dev) / ai_generated (prod)│
│     ├── Chunk insert (200/batch)                        │
│     └── Update Source stats on success/error            │
│                                                           │
│  Cron: Every 15 minutes                                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                enrich-articles.job.js                      │
│                                                           │
│  Query: status in [published, ai_generated]              │
│         AND (no summary OR aiModel.confidence < 0.5)     │
│                                                           │
│  Mode --ai:                                              │
│    POST ai-engine/summarize/batch                        │
│    └──► processArticle() per article:                    │
│        ├── generateSummary (60 words)                    │
│        ├── extractEntities (NER)                         │
│        ├── classifyCategory (17 categories)              │
│        └── analyzeSentiment (score + label)              │
│        All 4 run in parallel (Promise.allSettled)        │
│                                                           │
│  Mode --mock (default):                                  │
│    Generate realistic data locally:                      │
│    ├── Summary from title + content truncation           │
│    ├── Entities from category-specific pools             │
│    ├── Tags from category + random keywords              │
│    ├── Sentiment: random distribution                    │
│    ├── Topic distribution across categories              │
│    └── Quality + readability metrics                     │
│                                                           │
│  Batch size: 50 articles, uses bulkWrite                 │
└──────────────────────────────────────────────────────────┘
```

### Seeded News Sources (24+)

| Category | Sources |
|----------|---------|
| India | NDTV, Times of India, The Hindu, Indian Express, Hindustan Times, India Today, Scroll.in, The Wire |
| Business/Finance | Mint, Economic Times, CoinDesk |
| Technology | TechCrunch, The Verge, Ars Technica, Wired, Gadgets360 |
| World | Reuters, BBC News, Al Jazeera, The Guardian |
| Science/Health | Science Daily |
| Lifestyle | Scoopwhoop |
| Auto | Autocar India |
| Education | NDTV Education |

---

## Feed Composition & Ranking

### Available Feed Types

| Endpoint | Source | Cache TTL | Sort |
|----------|--------|-----------|------|
| `/feed/personalized` | AI engine ranking | 15 min (FeedCache) | AI score |
| `/feed/for-you` | Breaking + Timeline + Personalized | Mixed | Composite |
| `/feed/trending` | trendingScore > 0, last 24h | 5 min (Redis) | trendingScore desc |
| `/feed/latest` | status=published | None | publishedAt desc |
| `/feed/breaking` | isBreaking=true, last 6h | 2 min (Redis) | publishedAt desc |
| `/feed/category/:cat` | By category + language | 3 min (Redis) | publishedAt desc |
| `/feed/explore` | 2-3 per category, shuffled | 10 min (Redis) | Random |
| `/feed/daily-digest` | DailyDigest model | None | Curated rank |
| `/feed/source/:id` | By sourceId | None | publishedAt desc |
| `/feed/next` | Cursor-based continuation | Varies | Depends on feedType |

### Engagement Score Formula

Used for article ranking and digest curation:

```
engagementScore = views * 0.1
               + uniqueViews * 0.2
               + fullReads * 2.0
               + shares * 4.0
               + bookmarks * 3.0
               + comments * 2.5
               + totalReactions * 1.5
```

---

## Caching Strategy

### Redis Cache Keys

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `user:profile:{id}` | 30 min | User personalization scores |
| `user:viewed:{id}` | 24 hr | Recently viewed article IDs (Set) |
| `user:feed:{id}` | Varies | Serialized feed cache |
| `user:shown:{id}` | 1 hr | Articles shown in feeds |
| `user:profile:{id}:live` | 30 min | Live category score updates |
| `article:engagement:{id}` | 1 hr | Real-time engagement counters (Hash) |
| `candidates:{lang}:{limit}` | 5 min | Recent articles pool for ranking |
| `session:{sessionId}` | 30 min | Active session metadata |
| `dau:{YYYY-MM-DD}` | 48 hr | Daily active users (Set) |
| `realtime:readers` | 5 min | Currently active readers (Set) |
| `trending:{lang}` | 5 min | Trending articles cache |
| `breaking:{lang}` | 2 min | Breaking news cache |
| `category:{cat}:{lang}:page:{n}` | 3 min | Category feed pages |
| `explore:{lang}` | 10 min | Explore feed (reshuffled on read) |
| `search:suggest:{prefix}` | 10 min | Search autocomplete |
| `search:trending` | 24 hr | Trending queries (Sorted Set) |
| `topics:trending` | 10 min | Trending topics |
| `ads:active:{lang}:{cat}:{device}` | 5 min | Eligible ad campaigns |
| `ad:imp:{campaignId}:{userId}:{date}` | 24 hr | Daily impression counter |

### MongoDB FeedCache

Pre-computed personalized feeds with detailed scoring breakdown:

```javascript
{
  userId, feedType, language,
  articleIds: [/* ordered */],
  scores: [{
    relevanceScore, recencyScore, engagementScore,
    diversityPenalty, sourceTrustScore, editorialBoost, finalScore
  }],
  cursor: 0,           // articles consumed via pagination
  computeTimeMs,       // performance tracking
  coldStartPhase,
  expiresAt            // TTL: 2min (breaking), 5min (trending), 15min (personalized)
}
```

---

## Authentication & User Lifecycle

### Auth Methods

| Method | Token | Lifetime |
|--------|-------|----------|
| Email/Password | JWT access + refresh | 7d / 30d |
| Google OAuth | JWT access + refresh | 7d / 30d |
| Anonymous | JWT anonymous | 365d |

### Anonymous-to-Registered Merge

```
AnonymousUser (device-based)
    │
    │  User registers or logs in
    │
    └──► AnonymousUser.mergeIntoUser(anonId, userId)
         ├── Migrate preferences (language, categories, theme)
         ├── Merge categoryScores (take max of each)
         ├── Sum stats (articlesRead, readTime, etc.)
         ├── Transfer FCM token
         ├── Re-assign UserActivity records
         ├── Mark anonymous as merged
         └── Auto-delete anonymous record after 7 days (TTL)
```

### User Lifecycle

```
Install App
    │
    ├──► POST /auth/anonymous  →  BRAND_NEW (no prefs)
    │
    ├──► Onboarding: select categories
    │    PUT /users/me/onboarding  →  ONBOARDED (seeds scores at 0.5)
    │
    ├──► Read 1-19 articles  →  EARLY_EXPLORING
    ├──► Read 20-49 articles →  EXPLORING
    ├──► Read 50-99 articles →  WARMING
    ├──► Read 100+ articles  →  PERSONALIZED
    │
    ├──► Register: POST /auth/register
    │    POST /auth/merge  →  Merges anonymous data
    │
    └──► Delete: DELETE /users/me
         ├── Soft-delete (isActive=false)
         ├── Anonymize PII (email, name, phone)
         └── Remove auth tokens and devices
```

---

## Notification System

### Architecture (Partially Implemented)

```
Admin creates notification
    │
    ├──► admin-api: POST /notifications/broadcast
    │       └──► Create Notification record in MongoDB
    │           └──► Queue to BullMQ (TODO)
    │
    └──► notification-service (background):
            ├── push.worker: Process push queue → FCM (TODO)
            └── digest.worker: Process digest queue → FCM (TODO)
```

### Notification Types

| Type | Trigger | Target |
|------|---------|--------|
| `breaking_news` | Admin marks article as breaking | Broadcast (breakingNews enabled) |
| `daily_digest` | Cron (morning) | Users with dailyDigest enabled |
| `weekly_roundup` | Cron (weekly) | All active users |
| `topic_update` | New articles in followed topic | Topic followers |
| `trending` | Article goes viral | Interested users |
| `personalized` | AI recommendation | Individual user |
| `system` | Platform updates | All users |
| `promotional` | Marketing campaign | Targeted segments |
| `milestone` | User achievement | Individual user |
| `welcome` | New registration | Individual user |

---

## Ad Injection

### Strategy

- **Position:** Every 10 articles (at indices 4, 14, 24...)
- **Max per page:** 3 ads
- **Frequency cap:** Configurable per campaign (default 1 impression/user/day)
- **Fallback:** Feed returned without ads if ad service fails

### Campaign Eligibility Filters

```
1. Status = 'active'
2. Schedule: startDate <= now <= endDate
3. Budget: spend < totalBudget
4. Targeting: matches user's language, categories, deviceType
5. Frequency: user impressions today < maxImpressionsPerUser
```

### Pricing Models

| Model | Description |
|-------|-------------|
| CPM | Cost per 1000 impressions |
| CPC | Cost per click |
| CPA | Cost per action/conversion |
| CPV | Cost per video view |
| Flat Rate | Fixed price for campaign duration |

---

## Infrastructure & Deployment

### Docker Compose (Local Development)

5 app services + MongoDB 7 + Redis 7-alpine, all sharing `.env`, health-checked dependencies.

### Kubernetes (Production)

```
Namespace: readout

user-api Deployment:
  Replicas: 3 (min) - 20 (max)
  Resources: 100-500m CPU, 256-512Mi memory
  HPA triggers: CPU 70%, Memory 80%
  Probes: /health (liveness: 20s, readiness: 10s)
  Service: ClusterIP port 80 → 5000
```

### CI/CD (GitHub Actions)

Each service has a dedicated workflow triggered on:
- Push to `main` (path-filtered to service + shared)
- Pull requests to `main`

Steps: checkout → Node 18 setup → npm ci → test → lint → (TODO: Docker build + K8s deploy)

---

## API Surface

### user-api (port 5000)

| Group | Prefix | Auth | Rate Limit |
|-------|--------|------|------------|
| Auth | `/api/v1/auth/*` | Public (mostly) | 10 req/15min |
| Feed | `/api/v1/feed/*` | authenticate | 30 req/min |
| Articles | `/api/v1/articles/*` | authenticate | 30 req/min |
| Search | `/api/v1/search/*` | authenticate | 20 req/min |
| Users | `/api/v1/users/*` | requireAuth | Default |
| Bookmarks | `/api/v1/bookmarks/*` | requireAuth | Default |
| Comments | `/api/v1/comments/*` | Mixed | Default |
| Polls | `/api/v1/polls/*` | authenticate | Default |
| Notifications | `/api/v1/notifications/*` | requireAuth | Default |
| Activity | `/api/v1/activity/*` | authenticate | 60 req/min |

### admin-api (port 5001)

| Group | Prefix | Auth |
|-------|--------|------|
| Dashboard | `/admin/v1/dashboard/*` | admin/superadmin |
| Articles | `/admin/v1/articles/*` | admin/editor |
| Sources | `/admin/v1/sources/*` | admin/superadmin |
| Users | `/admin/v1/users/*` | admin/superadmin |
| Moderation | `/admin/v1/moderation/*` | admin/editor |
| Notifications | `/admin/v1/notifications/*` | admin |
| Digest | `/admin/v1/digest/*` | admin/editor |
| Ads | `/admin/v1/ads/*` | admin |

### ai-engine (port 5002)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ai/v1/personalize/rank` | POST | Generate personalized feed |
| `/ai/v1/personalize/compute-profile` | POST | Recompute user profile |
| `/ai/v1/personalize/track` | POST | Track user action |
| `/ai/v1/summarize/article` | POST | Summarize single article |
| `/ai/v1/summarize/batch` | POST | Bulk summarize |
| `/ai/v1/trending/recompute` | POST | Batch recompute scores |
| `/ai/v1/trending/scores` | GET | Get article trending score |

---

## Incomplete / TODO Components

| Component | Location | Status |
|-----------|----------|--------|
| Content Vectorizer | `ai-engine/services/content-vectorizer.service.js` | Empty placeholder |
| Entity Extractor (advanced) | `ai-engine/services/entity-extractor.service.js` | Empty placeholder |
| BullMQ Workers (4) | `ai-engine/workers/*.worker.js` | Skeleton only |
| Web Scraper | `scraper/scrapers/web.scraper.js` | Not implemented |
| API Scraper | `scraper/scrapers/api.scraper.js` | Not implemented |
| FCM Service | `notification-service/services/fcm.service.js` | Not implemented |
| Digest Service | `notification-service/services/digest.service.js` | Not implemented |
| Scheduler Service | `notification-service/services/scheduler.service.js` | Not implemented |
| Push Worker | `notification-service/workers/push.worker.js` | Not implemented |
| Digest Worker | `notification-service/workers/digest.worker.js` | Not implemented |
| Analytics Service | `admin-api/services/analytics.service.js` | Not implemented |
| Moderation Service | `admin-api/services/moderation.service.js` | Not implemented |
| Article Routes | `user-api/routes/article.route.js` | Marked TODO |
| Email Service | Auth password reset / email verification | Not integrated |
| Docker Build + K8s Deploy | CI/CD workflows | TODO steps |
| Account Deletion Cleanup | Background job for activity/comment anonymization | Not implemented |

---

*Generated from full codebase review on 2026-03-01.*
