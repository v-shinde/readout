const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const { Article } = require('@readout/shared').models;

// GET /admin/v1/articles?page=1&limit=30&status=all&category=&search=
exports.listArticles = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, status, category, search, language, sort = '-publishedAt' } = req.query;
  const query = {};
  if (status && status !== 'all') query.status = status;
  if (category) query.category = category;
  if (language) query.language = language;
  if (search) query.$text = { $search: search };

  const sortObj = {};
  const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
  sortObj[sortField] = sort.startsWith('-') ? -1 : 1;

  const [articles, total] = await Promise.all([
    Article.find(query).sort(sortObj).skip((+page - 1) * +limit).limit(+limit)
      .select('-fullContent -aiMetadata.contentVector').populate('editor', 'name').lean(),
    Article.countDocuments(query),
  ]);

  res.json({ success: true, data: { articles, total, page: +page, pages: Math.ceil(total / +limit) } });
});

// GET /admin/v1/articles/review-queue
exports.getReviewQueue = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const [articles, total] = await Promise.all([
    Article.find({ status: { $in: ['ai_generated', 'in_review'] } })
      .sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit)
      .select('-fullContent -aiMetadata.contentVector').lean(),
    Article.countDocuments({ status: { $in: ['ai_generated', 'in_review'] } }),
  ]);

  res.json({ success: true, data: { articles, total, page: +page } });
});

// GET /admin/v1/articles/:id
exports.getArticle = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id)
    .populate('source', 'name domain').populate('editor', 'name email').lean();
  if (!article) throw new NotFoundError('Article');
  res.json({ success: true, data: article });
});

// POST /admin/v1/articles
exports.createArticle = asyncHandler(async (req, res) => {
  const article = await Article.create({ ...req.body, editor: req.userId, status: 'draft' });
  res.status(201).json({ success: true, data: article });
});

// PUT /admin/v1/articles/:id
exports.updateArticle = asyncHandler(async (req, res) => {
  const forbidden = ['_id', 'createdAt', 'updatedAt', 'sourceUrlHash'];
  forbidden.forEach(f => delete req.body[f]);

  const article = await Article.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!article) throw new NotFoundError('Article');
  res.json({ success: true, data: article });
});

// PUT /admin/v1/articles/:id/status { status }
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['draft', 'in_review', 'published', 'archived', 'rejected'];
  if (!validStatuses.includes(status)) throw new ValidationError('Invalid status');

  const updates = { status };
  if (status === 'published') updates.publishedAt = new Date();

  const article = await Article.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
  if (!article) throw new NotFoundError('Article');
  res.json({ success: true, data: { id: article._id, status: article.status } });
});

// PUT /admin/v1/articles/:id/featured
exports.toggleFeatured = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw new NotFoundError('Article');
  article.isFeatured = !article.isFeatured;
  await article.save();
  res.json({ success: true, data: { isFeatured: article.isFeatured } });
});

// PUT /admin/v1/articles/:id/breaking
exports.toggleBreaking = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw new NotFoundError('Article');
  article.isBreaking = !article.isBreaking;
  if (article.isBreaking) article.priority = 'breaking';
  else if (article.priority === 'breaking') article.priority = 'normal';
  await article.save();
  res.json({ success: true, data: { isBreaking: article.isBreaking, priority: article.priority } });
});

// DELETE /admin/v1/articles/:id
exports.deleteArticle = asyncHandler(async (req, res) => {
  const article = await Article.findByIdAndUpdate(req.params.id, { $set: { status: 'archived' } });
  if (!article) throw new NotFoundError('Article');
  res.json({ success: true });
});

// POST /admin/v1/articles/bulk-status { ids: [], status }
exports.bulkUpdateStatus = asyncHandler(async (req, res) => {
  const { ids, status } = req.body;
  if (!ids?.length) throw new ValidationError('Article IDs required');

  const updates = { status };
  if (status === 'published') updates.publishedAt = new Date();

  const result = await Article.updateMany({ _id: { $in: ids } }, { $set: updates });
  res.json({ success: true, data: { modifiedCount: result.modifiedCount } });
});
