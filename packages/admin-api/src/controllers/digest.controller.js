const { asyncHandler, NotFoundError } = require('@readout/shared').utils;
const { DailyDigest, Article } = require('@readout/shared').models;

exports.listDigests = asyncHandler(async (req, res) => {
  const { language = 'en', limit = 14 } = req.query;
  const digests = await DailyDigest.getRecent(language, +limit);
  res.json({ success: true, data: digests });
});

exports.getTodayDigest = asyncHandler(async (req, res) => {
  const { language = 'en' } = req.query;
  const digest = await DailyDigest.getToday(language);
  res.json({ success: true, data: digest || null });
});

exports.generateDigest = asyncHandler(async (req, res) => {
  const { language = 'en', date } = req.body;
  const targetDate = date ? new Date(date) : new Date();

  // Auto-generate: top 15 articles from last 24h by engagement
  const articles = await Article.find({
    status: 'published', language,
    publishedAt: { $gte: new Date(targetDate.getTime() - 24 * 3600000) },
  }).sort({ 'engagement.engagementScore': -1 }).limit(15)
    .select('title summary media.thumbnail category sourceInfo publishedAt engagement.engagementScore').lean();

  const stories = articles.map((a, i) => ({
    articleId: a._id, rank: i + 1, title: a.title, summary: a.summary,
    thumbnail: a.media?.thumbnail?.url, category: a.category,
    sourceName: a.sourceInfo?.name, publishedAt: a.publishedAt,
    engagementScore: a.engagement?.engagementScore,
  }));

  const digest = await DailyDigest.createOrUpdate(targetDate, language, stories, {
    curatedBy: req.userId, generationType: 'auto',
  });

  res.json({ success: true, data: digest });
});

exports.updateDigest = asyncHandler(async (req, res) => {
  const digest = await DailyDigest.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!digest) throw new NotFoundError('Digest');
  res.json({ success: true, data: digest });
});

exports.publishDigest = asyncHandler(async (req, res) => {
  const digest = await DailyDigest.findByIdAndUpdate(req.params.id, {
    $set: { isPublished: true, publishedAt: new Date() },
  }, { new: true });
  if (!digest) throw new NotFoundError('Digest');
  // TODO: Queue notification to send daily digest push to subscribed users
  res.json({ success: true, data: { published: true } });
});