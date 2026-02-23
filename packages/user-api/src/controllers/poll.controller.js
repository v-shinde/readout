const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const { Article, UserActivity } = require('@readout/shared').models;
const activityService = require('../services/activity.service');

// GET /polls/article/:articleId
exports.getArticlePoll = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.articleId).select('poll').lean();
  if (!article?.poll?.isActive) throw new NotFoundError('Poll');

  const existingVote = await UserActivity.findOne({
    userId: req.trackingId, articleId: req.params.articleId, action: 'poll_vote',
  }).lean();

  res.json({
    success: true,
    data: { ...article.poll, hasVoted: !!existingVote, votedOption: existingVote?.metadata?.pollOptionIndex ?? null },
  });
});

// POST /polls/article/:articleId/vote
exports.votePoll = asyncHandler(async (req, res) => {
  const { optionIndex } = req.body;
  if (optionIndex === undefined || optionIndex === null) throw new ValidationError('Option index required');

  const existingVote = await UserActivity.findOne({
    userId: req.trackingId, articleId: req.params.articleId, action: 'poll_vote',
  });
  if (existingVote) throw new ValidationError('Already voted');

  const article = await Article.findById(req.params.articleId).select('poll');
  if (!article?.poll?.isActive) throw new NotFoundError('Poll');
  if (article.poll.expiresAt && article.poll.expiresAt < new Date()) throw new ValidationError('Poll expired');
  if (optionIndex < 0 || optionIndex >= article.poll.options.length) throw new ValidationError('Invalid option');

  await Article.updateOne(
    { _id: req.params.articleId },
    { $inc: { [`poll.options.${optionIndex}.votes`]: 1, 'poll.totalVotes': 1 } }
  );

  activityService.logActivity({
    userId: req.trackingId, articleId: req.params.articleId, action: 'poll_vote',
    metadata: { pollOptionIndex: optionIndex },
  });
  activityService.updateUserStats(req.trackingId, req.isAnonymous, 'poll_vote');

  const updated = await Article.findById(req.params.articleId).select('poll').lean();
  res.json({ success: true, data: updated.poll });
});

// GET /polls/article/:articleId/results
exports.getPollResults = asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.articleId).select('poll').lean();
  if (!article?.poll) throw new NotFoundError('Poll');

  const total = article.poll.totalVotes || 1;
  const results = article.poll.options.map(opt => ({
    text: opt.text, votes: opt.votes, percentage: Math.round((opt.votes / total) * 100),
  }));

  res.json({ success: true, data: { results, totalVotes: article.poll.totalVotes } });
});