const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
  {
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Denormalized user info (avoid populate on listing)
    userInfo: {
      name: String,
      avatar: String,
      isVerified: { type: Boolean, default: false },
    },

    content: { type: String, required: true, maxlength: 1000, trim: true },

    // ---- THREADING ----
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
    depth: { type: Number, default: 0, max: 3 },
    replyCount: { type: Number, default: 0 },
    rootCommentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },

    // ---- ENGAGEMENT ----
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dislikedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // ---- MODERATION ----
    status: {
      type: String,
      enum: ['active', 'hidden', 'flagged', 'deleted', 'spam'],
      default: 'active',
    },
    reports: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: { type: String, enum: ['spam', 'abuse', 'hate_speech', 'misinformation', 'irrelevant', 'other'] },
      description: String,
      date: { type: Date, default: Date.now },
    }],
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
    moderationNote: String,

    // ---- METADATA ----
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    editHistory: [{ content: String, editedAt: Date }],
    isPinned: { type: Boolean, default: false },
    isAuthorReply: { type: Boolean, default: false },

    // Sentiment (AI-detected)
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
  },
  { timestamps: true }
);

CommentSchema.index({ articleId: 1, status: 1, createdAt: -1 });
CommentSchema.index({ articleId: 1, parentId: 1, createdAt: 1 });
CommentSchema.index({ userId: 1, createdAt: -1 });
CommentSchema.index({ articleId: 1, isPinned: -1, likes: -1 });
CommentSchema.index({ status: 1, 'reports.0': 1 });

// ============ STATICS ============
CommentSchema.statics.getArticleComments = function (articleId, page = 1, limit = 20, sort = 'newest') {
  const sortOpt = sort === 'top' ? { likes: -1, createdAt: -1 } : { createdAt: -1 };
  return this.find({ articleId, parentId: null, status: 'active' })
    .sort(sortOpt)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
};

CommentSchema.statics.getReplies = function (parentId, page = 1, limit = 10) {
  return this.find({ parentId, status: 'active' })
    .sort({ createdAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
};

CommentSchema.statics.toggleLike = async function (commentId, userId) {
  const comment = await this.findById(commentId);
  if (!comment) return null;
  const idx = comment.likedBy.indexOf(userId);
  if (idx > -1) {
    comment.likedBy.splice(idx, 1);
    comment.likes = Math.max(0, comment.likes - 1);
  } else {
    comment.likedBy.push(userId);
    comment.likes += 1;
    // Remove from dislikes if present
    const dIdx = comment.dislikedBy.indexOf(userId);
    if (dIdx > -1) { comment.dislikedBy.splice(dIdx, 1); comment.dislikes = Math.max(0, comment.dislikes - 1); }
  }
  await comment.save();
  return { likes: comment.likes, liked: idx === -1 };
};

CommentSchema.statics.getReportedComments = function (page = 1, limit = 50) {
  return this.find({ 'reports.0': { $exists: true }, status: { $ne: 'deleted' } })
    .sort({ 'reports.length': -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('userId', 'name email')
    .lean();
};

module.exports = mongoose.model('Comment', CommentSchema);