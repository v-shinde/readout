const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const { Comment, Article, User } = require('@readout/shared').models;
const activityService = require('../services/activity.service');

// GET /comments/article/:articleId
exports.getArticleComments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, sort = 'newest' } = req.query;
  const { articleId } = req.params;
  const [comments, total] = await Promise.all([
    Comment.getArticleComments(articleId, +page, +limit, sort),
    Comment.countDocuments({ articleId, parentId: null, status: 'active' }),
  ]);
  res.json({ success: true, data: { comments, total, page: +page } });
});

// GET /comments/:id/replies
exports.getReplies = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const replies = await Comment.getReplies(req.params.id, +page, +limit);
  res.json({ success: true, data: replies });
});

// POST /comments
exports.createComment = asyncHandler(async (req, res) => {
  const { articleId, content, parentId } = req.body;
  if (!content?.trim()) throw new ValidationError('Comment content required');
  if (content.trim().length > 1000) throw new ValidationError('Comment too long (max 1000 chars)');

  const user = await User.findById(req.userId).select('name avatar isVerified').lean();
  if (!user) throw new NotFoundError('User');

  let depth = 0, rootCommentId = null;
  if (parentId) {
    const parent = await Comment.findById(parentId).lean();
    if (!parent) throw new NotFoundError('Parent comment');
    if (parent.depth >= 3) throw new ValidationError('Max reply depth reached');
    depth = parent.depth + 1;
    rootCommentId = parent.rootCommentId || parent._id;
  }

  const comment = await Comment.create({
    articleId, userId: req.userId, content: content.trim(),
    parentId: parentId || null, depth, rootCommentId,
    userInfo: { name: user.name, avatar: user.avatar?.url, isVerified: user.isVerified },
  });

  if (parentId) await Comment.updateOne({ _id: parentId }, { $inc: { replyCount: 1 } });
  await Article.updateOne({ _id: articleId }, { $inc: { 'engagement.comments': 1 } });

  activityService.logActivity({ userId: req.userId, articleId, action: 'comment' });

  res.status(201).json({ success: true, data: comment });
});

// PUT /comments/:id
exports.editComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findOne({ _id: req.params.id, userId: req.userId });
  if (!comment) throw new NotFoundError('Comment');
  const { content } = req.body;
  if (!content?.trim()) throw new ValidationError('Content required');

  comment.editHistory.push({ content: comment.content, editedAt: new Date() });
  comment.content = content.trim();
  comment.isEdited = true;
  comment.editedAt = new Date();
  await comment.save();

  res.json({ success: true, data: comment });
});

// DELETE /comments/:id
exports.deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findOne({ _id: req.params.id, userId: req.userId });
  if (!comment) throw new NotFoundError('Comment');
  comment.status = 'deleted';
  comment.content = '[deleted]';
  await comment.save();
  await Article.updateOne({ _id: comment.articleId }, { $inc: { 'engagement.comments': -1 } });
  res.json({ success: true });
});

// POST /comments/:id/like
exports.toggleLike = asyncHandler(async (req, res) => {
  const result = await Comment.toggleLike(req.params.id, req.userId);
  if (!result) throw new NotFoundError('Comment');
  res.json({ success: true, data: result });
});

// POST /comments/:id/report
exports.reportComment = asyncHandler(async (req, res) => {
  const { reason, description } = req.body;
  const validReasons = ['spam', 'abuse', 'hate_speech', 'misinformation', 'irrelevant', 'other'];
  if (!validReasons.includes(reason)) throw new ValidationError('Invalid report reason');

  const comment = await Comment.findById(req.params.id);
  if (!comment) throw new NotFoundError('Comment');
  comment.reports.push({ userId: req.userId, reason, description, date: new Date() });
  if (comment.reports.length >= 3) comment.status = 'flagged';
  await comment.save();

  res.json({ success: true, message: 'Comment reported' });
});