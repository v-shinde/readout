const { asyncHandler, NotFoundError } = require('@readout/shared').utils;
const { Bookmark, Article } = require('@readout/shared').models;
const activityService = require('../services/activity.service');

// GET /bookmarks?page=1&limit=20&folder=default
exports.getBookmarks = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, folder } = req.query;
  const query = { userId: req.userId };
  if (folder) query.folder = folder;

  const [bookmarks, total] = await Promise.all([
    Bookmark.find(query).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
    Bookmark.countDocuments(query),
  ]);
  res.json({ success: true, data: { bookmarks, total, page: +page } });
});

// GET /bookmarks/folders
exports.getFolders = asyncHandler(async (req, res) => {
  const folders = await Bookmark.getUserFolders(req.userId);
  res.json({ success: true, data: folders });
});

// POST /bookmarks/toggle
exports.toggleBookmark = asyncHandler(async (req, res) => {
  const { articleId } = req.body;
  const article = await Article.findById(articleId)
    .select('title summary media category sourceInfo publishedAt language').lean();
  if (!article) throw new NotFoundError('Article');

  const result = await Bookmark.toggle(req.userId, articleId, article);

  activityService.logActivity({
    userId: req.userId, articleId,
    action: result.bookmarked ? 'bookmark' : 'unbookmark',
    metadata: { articleCategory: article.category, articleSource: article.sourceInfo?.name },
  });

  await Article.updateOne({ _id: articleId }, { $inc: { 'engagement.bookmarks': result.bookmarked ? 1 : -1 } });
  activityService.updateUserStats(req.userId, false, result.bookmarked ? 'bookmark' : 'unbookmark');

  res.json({ success: true, data: result });
});

// PUT /bookmarks/:id/folder
exports.moveToFolder = asyncHandler(async (req, res) => {
  const bookmark = await Bookmark.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { folder: req.body.folder || 'default' } },
    { new: true }
  );
  if (!bookmark) throw new NotFoundError('Bookmark');
  res.json({ success: true, data: bookmark });
});

// PUT /bookmarks/:id/notes
exports.updateNotes = asyncHandler(async (req, res) => {
  const bookmark = await Bookmark.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { notes: req.body.notes } },
    { new: true }
  );
  if (!bookmark) throw new NotFoundError('Bookmark');
  res.json({ success: true, data: bookmark });
});

// DELETE /bookmarks/:id
exports.deleteBookmark = asyncHandler(async (req, res) => {
  const bookmark = await Bookmark.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!bookmark) throw new NotFoundError('Bookmark');
  await Article.updateOne({ _id: bookmark.articleId }, { $inc: { 'engagement.bookmarks': -1 } });
  res.json({ success: true });
});

// POST /bookmarks/check
exports.checkBookmarked = asyncHandler(async (req, res) => {
  const { articleIds } = req.body;
  const bookmarks = await Bookmark.find({ userId: req.userId, articleId: { $in: articleIds } }).select('articleId').lean();
  res.json({ success: true, data: bookmarks.map(b => b.articleId.toString()) });
});