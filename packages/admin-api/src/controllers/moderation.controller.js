const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const { Article, Comment } = require('@readout/shared').models;

exports.getFlaggedArticles = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const [articles, total] = await Promise.all([
    Article.find({ 'moderation.status': { $in: ['flagged', 'under_review'] } })
      .sort({ 'moderation.reports.length': -1, updatedAt: -1 })
      .skip((+page - 1) * +limit).limit(+limit)
      .select('title summary category sourceInfo moderation status publishedAt').lean(),
    Article.countDocuments({ 'moderation.status': { $in: ['flagged', 'under_review'] } }),
  ]);
  res.json({ success: true, data: { articles, total, page: +page } });
});

exports.getFlaggedComments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const comments = await Comment.getReportedComments(+page, +limit);
  res.json({ success: true, data: comments });
});

exports.reviewArticle = asyncHandler(async (req, res) => {
  const { action, note } = req.body; // action: 'approve', 'block', 'dismiss'
  if (!['approve', 'block', 'dismiss'].includes(action)) throw new ValidationError('Invalid action');

  const updates = { 'moderation.reviewedBy': req.userId, 'moderation.reviewedAt': new Date() };
  if (action === 'approve') updates['moderation.status'] = 'clean';
  else if (action === 'block') { updates['moderation.status'] = 'blocked'; updates.status = 'archived'; }
  else updates['moderation.status'] = 'clean';

  const article = await Article.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
  if (!article) throw new NotFoundError('Article');
  res.json({ success: true, data: { id: article._id, moderationStatus: article.moderation.status } });
});

exports.reviewComment = asyncHandler(async (req, res) => {
  const { action, note } = req.body; // action: 'approve', 'hide', 'delete'
  if (!['approve', 'hide', 'delete'].includes(action)) throw new ValidationError('Invalid action');

  const statusMap = { approve: 'active', hide: 'hidden', delete: 'deleted' };
  const comment = await Comment.findByIdAndUpdate(req.params.id, {
    $set: { status: statusMap[action], moderatedBy: req.userId, moderatedAt: new Date(), moderationNote: note },
  }, { new: true });
  if (!comment) throw new NotFoundError('Comment');
  res.json({ success: true, data: { id: comment._id, status: comment.status } });
});

exports.getModerationStats = asyncHandler(async (req, res) => {
  const [flaggedArticles, flaggedComments, blockedToday] = await Promise.all([
    Article.countDocuments({ 'moderation.status': { $in: ['flagged', 'under_review'] } }),
    Comment.countDocuments({ status: 'flagged' }),
    Article.countDocuments({ 'moderation.status': 'blocked', 'moderation.reviewedAt': { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
  ]);
  res.json({ success: true, data: { flaggedArticles, flaggedComments, blockedToday } });
});
