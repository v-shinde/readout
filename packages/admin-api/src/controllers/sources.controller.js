const { asyncHandler, NotFoundError } = require('@readout/shared').utils;
const { Source, Article } = require('@readout/shared').models;

exports.listSources = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, isActive, search } = req.query;
  const query = {};
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) query.name = { $regex: search, $options: 'i' };

  const [sources, total] = await Promise.all([
    Source.find(query).sort({ priority: 1, name: 1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
    Source.countDocuments(query),
  ]);
  res.json({ success: true, data: { sources, total, page: +page } });
});

exports.getSource = asyncHandler(async (req, res) => {
  const source = await Source.findById(req.params.id).lean();
  if (!source) throw new NotFoundError('Source');
  res.json({ success: true, data: source });
});

exports.createSource = asyncHandler(async (req, res) => {
  const source = await Source.create(req.body);
  res.status(201).json({ success: true, data: source });
});

exports.updateSource = asyncHandler(async (req, res) => {
  const source = await Source.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!source) throw new NotFoundError('Source');
  res.json({ success: true, data: source });
});

exports.toggleActive = asyncHandler(async (req, res) => {
  const source = await Source.findById(req.params.id);
  if (!source) throw new NotFoundError('Source');
  source.isActive = !source.isActive;
  await source.save();
  res.json({ success: true, data: { isActive: source.isActive } });
});

exports.testFeed = asyncHandler(async (req, res) => {
  const { feedIndex = 0 } = req.body;
  const source = await Source.findById(req.params.id).lean();
  if (!source) throw new NotFoundError('Source');
  const feed = source.feeds[feedIndex];
  if (!feed) throw new NotFoundError('Feed');
  // TODO: call scraper service to test-fetch this feed
  res.json({ success: true, data: { message: 'Feed test queued', feedUrl: feed.url } });
});

exports.getSourceStats = asyncHandler(async (req, res) => {
  const source = await Source.findById(req.params.id).select('stats name').lean();
  if (!source) throw new NotFoundError('Source');

  const recentArticleCount = await Article.countDocuments({
    source: req.params.id, status: 'published',
    publishedAt: { $gte: new Date(Date.now() - 7 * 86400000) },
  });

  res.json({ success: true, data: { ...source.stats, articlesLast7Days: recentArticleCount } });
});

exports.deleteSource = asyncHandler(async (req, res) => {
  await Source.findByIdAndUpdate(req.params.id, { $set: { isActive: false } });
  res.json({ success: true });
});
