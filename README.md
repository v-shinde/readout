# Readout - News Aggregation Platform

High-frequency news aggregation backend with AI-powered 60-word summaries and personalization.

## Architecture

```
readout/
├── packages/
│   ├── shared/                 ← Shared models, middleware, utils
│   ├── user-api/               ← User-facing REST API (port 5000)
│   ├── admin-api/              ← Admin dashboard API (port 5001)
│   ├── ai-engine/              ← AI summarization + personalization (port 5002)
│   ├── scraper/                ← News ingestion pipeline (port 5003)
│   └── notification-service/   ← Push notifications (port 5004)
├── infra/
│   ├── k8s/                    ← Kubernetes manifests
│   ├── terraform/              ← AWS infrastructure
│   └── docker/                 ← Docker Compose for local dev
└── .github/workflows/          ← Per-service CI/CD
```

## Naming Conventions

| Type        | Pattern              | Example                     |
|-------------|---------------------|-----------------------------|
| Models      | `*.model.js`        | `user.model.js`             |
| Routes      | `*.route.js`        | `feed.route.js`             |
| Controllers | `*.controller.js`   | `feed.controller.js`        |
| Services    | `*.service.js`      | `personalization-engine.service.js` |
| Middleware  | `*.middleware.js`    | `auth.middleware.js`        |
| Workers     | `*.worker.js`       | `summarize.worker.js`       |
| Jobs        | `*.job.js`          | `scrape-all.job.js`         |
| Validators  | `*.validator.js`    | `auth.validator.js`         |
| Config      | `*.config.js`       | `database.config.js`        |
| Utils       | `*.util.js`         | `logger.util.js`            |
| Constants   | `*.constant.js`     | `categories.constant.js`    |
| Tests       | `*.test.js`         | `auth.controller.test.js`   |
| Scrapers    | `*.scraper.js`      | `rss.scraper.js`            |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env   # Edit with your keys

# 3. Start with Docker (recommended)
npm run docker:dev

# OR start individually
npm run dev:user     # User API on :5000
npm run dev:admin    # Admin API on :5001
npm run dev:ai       # AI Engine on :5002
npm run dev:scraper  # Scraper on :5003
npm run dev:notif    # Notifications on :5004

# OR start all at once
npm run dev:all
```

## Anonymous User Support

Users can use the app without login. Device UUID → AnonymousUser → same personalization → merge on signup.

## Cold Start Strategy

BRAND_NEW → ONBOARDED → EARLY_EXPLORING → EXPLORING → WARMING → PERSONALIZED
# readout
