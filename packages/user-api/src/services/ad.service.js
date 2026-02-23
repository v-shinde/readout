const { AdCampaign } = require('@readout/shared').models;
const logger = require('@readout/shared').utils.logger;

const AD_FREQUENCY = 10;          // Show ad every N articles
const MAX_ADS_PER_FEED = 3;       // Max ads per feed page
const IMPRESSION_CAP_TTL = 86400; // Daily cap tracking

// ============================================
// INJECT NATIVE ADS INTO FEED
// ============================================

/**
 * Inject native ad cards into a feed array.
 * Places ads at positions: 4, 14, 24... (every AD_FREQUENCY after initial offset)
 *
 * @param {Array} articles - Article array from feed
 * @param {Object} opts - { language, category, userId, redis, deviceType }
 * @returns {Array} Articles with ad cards injected
 */
exports.injectNativeAds = async (articles, opts = {}) => {
  const { language = 'en', category, userId, redis, deviceType = 'android' } = opts;

  if (!articles.length) return articles;

  try {
    // 1. Get eligible campaigns
    const campaigns = await _getEligibleCampaigns(language, category, deviceType, redis);
    if (!campaigns.length) return articles;

    // 2. Filter by user frequency cap
    const eligible = await _filterByUserCap(campaigns, userId, redis);
    if (!eligible.length) return articles;

    // 3. Insert ad cards at strategic positions
    const result = [...articles];
    let adsInserted = 0;

    for (let pos = 4; pos < result.length + adsInserted && adsInserted < MAX_ADS_PER_FEED; pos += AD_FREQUENCY + 1) {
      const campaign = eligible[adsInserted % eligible.length];
      const adCard = _buildAdCard(campaign);

      result.splice(pos, 0, adCard);
      adsInserted++;

      // Record impression (fire-and-forget)
      _recordImpression(campaign._id, userId, redis).catch(() => {});
    }

    return result;
  } catch (err) {
    logger.error(`[ad.service] Failed to inject ads: ${err.message}`);
    return articles; // Graceful fallback — return feed without ads
  }
};

// ============================================
// GET ACTIVE AD FOR A SPECIFIC SLOT
// ============================================

/**
 * Get a single ad for a specific slot (used by client-side ad views)
 */
exports.getAdForSlot = async (opts = {}) => {
  const { language = 'en', category, deviceType = 'android', userId, redis } = opts;

  const campaigns = await _getEligibleCampaigns(language, category, deviceType, redis);
  if (!campaigns.length) return null;

  const eligible = await _filterByUserCap(campaigns, userId, redis);
  if (!eligible.length) return null;

  // Pick highest priority
  const campaign = eligible[0];
  _recordImpression(campaign._id, userId, redis).catch(() => {});

  return _buildAdCard(campaign);
};

// ============================================
// RECORD AD CLICK
// ============================================

exports.recordClick = async (campaignId, userId, redis) => {
  try {
    await AdCampaign.recordClick(campaignId);

    // Track in Redis for real-time analytics
    await redis.hincrby(`ad:clicks:${campaignId}`, 'total', 1);
    await redis.hincrby(`ad:clicks:${campaignId}`, `user:${userId}`, 1);
    await redis.expire(`ad:clicks:${campaignId}`, 86400);

    return true;
  } catch (err) {
    logger.error(`[ad.service] Click tracking failed: ${err.message}`);
    return false;
  }
};

// ============================================
// INTERNAL HELPERS
// ============================================

async function _getEligibleCampaigns(language, category, deviceType, redis) {
  const cacheKey = `ads:active:${language}:${category || 'all'}:${deviceType}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const now = new Date();
  const query = {
    status: 'active',
    'schedule.startDate': { $lte: now },
    'schedule.endDate': { $gte: now },
  };

  // Category targeting: campaigns with no category restriction OR matching category
  const campaigns = await AdCampaign.find(query)
    .sort({ 'placement.priority': 1 })
    .limit(20)
    .lean();

  // Filter by targeting
  const filtered = campaigns.filter(c => {
    const t = c.targeting || {};
    // Language filter
    if (t.languages?.length && !t.languages.includes(language)) return false;
    // Category filter
    if (t.categories?.length && category && !t.categories.includes(category)) return false;
    // Device filter
    if (t.deviceTypes?.length && !t.deviceTypes.includes(deviceType)) return false;
    // Budget check
    if (c.metrics?.spend >= c.schedule?.totalBudget) return false;
    return true;
  });

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(filtered));

  return filtered;
}

async function _filterByUserCap(campaigns, userId, redis) {
  if (!userId) return campaigns.slice(0, MAX_ADS_PER_FEED);

  const eligible = [];
  for (const campaign of campaigns) {
    const maxPerDay = campaign.targeting?.maxImpressionsPerUserPerDay || 1;
    const todayKey = `ad:imp:${campaign._id}:${userId}:${_todayDateStr()}`;

    const count = await redis.get(todayKey);
    if (!count || +count < maxPerDay) {
      eligible.push(campaign);
    }

    if (eligible.length >= MAX_ADS_PER_FEED) break;
  }

  return eligible;
}

function _buildAdCard(campaign) {
  // Pick a random variant if A/B testing, otherwise use main creative
  let creative = campaign.creative || {};
  if (creative.variants?.length) {
    const active = creative.variants.filter(v => v.isActive);
    if (active.length) {
      const variant = active[Math.floor(Math.random() * active.length)];
      creative = { ...creative, ...variant };
    }
  }

  return {
    _feedType: 'native_ad',
    _isAd: true,
    _campaignId: campaign._id,
    _adType: campaign.type,
    ad: {
      title: creative.title,
      body: creative.body,
      image: creative.image?.url,
      video: creative.video?.url,
      ctaText: creative.ctaText || 'Learn More',
      ctaUrl: creative.ctaUrl,
      brandName: creative.brandName || campaign.advertiser?.name,
      brandLogo: creative.brandLogo?.url,
    },
  };
}

async function _recordImpression(campaignId, userId, redis) {
  // Increment global counter
  await AdCampaign.recordImpression(campaignId);

  // Track per-user daily impression
  if (userId) {
    const todayKey = `ad:imp:${campaignId}:${userId}:${_todayDateStr()}`;
    await redis.incr(todayKey);
    await redis.expire(todayKey, IMPRESSION_CAP_TTL);
  }

  // Real-time analytics in Redis
  await redis.hincrby(`ad:stats:${campaignId}`, 'impressions', 1);
  await redis.expire(`ad:stats:${campaignId}`, 86400);
}

function _todayDateStr() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}