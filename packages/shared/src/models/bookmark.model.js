const mongoose = require('mongoose');

const BookmarkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },

    // Denormalized snapshot for fast bookmark list (no populate needed)
    articleSnapshot: {
      title: String,
      summary: String,
      thumbnail: String,
      category: String,
      sourceName: String,
      sourceLogo: String,
      publishedAt: Date,
      language: String,
    },

    folder: { type: String, default: 'default', trim: true, maxlength: 50 },
    notes: { type: String, maxlength: 500 },
    tags: [{ type: String, lowercase: true, trim: true }],
  },
  { timestamps: true }
);

BookmarkSchema.index({ userId: 1, createdAt: -1 });
BookmarkSchema.index({ userId: 1, articleId: 1 }, { unique: true });
BookmarkSchema.index({ userId: 1, folder: 1, createdAt: -1 });

// ============ STATICS ============
BookmarkSchema.statics.toggle = async function (userId, articleId, articleData = {}) {
  const existing = await this.findOne({ userId, articleId });
  if (existing) {
    await existing.deleteOne();
    return { bookmarked: false };
  }
  const bookmark = await this.create({
    userId, articleId,
    articleSnapshot: {
      title: articleData.title,
      summary: articleData.summary,
      thumbnail: articleData.media?.thumbnail?.url,
      category: articleData.category,
      sourceName: articleData.sourceInfo?.name,
      sourceLogo: articleData.sourceInfo?.logo,
      publishedAt: articleData.publishedAt,
      language: articleData.language,
    },
  });
  return { bookmarked: true, bookmark };
};

BookmarkSchema.statics.getUserFolders = async function (userId) {
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: '$folder', count: { $sum: 1 }, lastAdded: { $max: '$createdAt' } } },
    { $sort: { lastAdded: -1 } },
  ]);
};

module.exports = mongoose.model('Bookmark', BookmarkSchema);