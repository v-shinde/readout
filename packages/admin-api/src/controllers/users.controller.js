const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const { User, UserActivity } = require('@readout/shared').models;

exports.listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, role, search, sort = '-createdAt' } = req.query;
  const query = {};
  if (role) query.role = role;
  if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];

  const sortObj = {};
  const sf = sort.startsWith('-') ? sort.slice(1) : sort;
  sortObj[sf] = sort.startsWith('-') ? -1 : 1;

  const [users, total] = await Promise.all([
    User.find(query).sort(sortObj).skip((+page - 1) * +limit).limit(+limit)
      .select('name email role isActive isVerified createdAt lastActiveAt stats.totalArticlesRead subscription.plan').lean(),
    User.countDocuments(query),
  ]);
  res.json({ success: true, data: { users, total, page: +page } });
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password').lean();
  if (!user) throw new NotFoundError('User');
  res.json({ success: true, data: user });
});

exports.updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['user', 'editor', 'admin'].includes(role)) throw new ValidationError('Invalid role');
  const user = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true }).select('name role').lean();
  if (!user) throw new NotFoundError('User');
  res.json({ success: true, data: user });
});

exports.toggleBan = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');
  user.isActive = !user.isActive;
  await user.save();
  res.json({ success: true, data: { isActive: user.isActive } });
});

exports.getUserActivity = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const activities = await UserActivity.find({ userId: req.params.id })
    .sort({ timestamp: -1 }).skip((+page - 1) * +limit).limit(+limit).lean();
  res.json({ success: true, data: activities });
});

exports.getSegments = asyncHandler(async (req, res) => {
  const last30d = new Date(Date.now() - 30 * 86400000);
  const [total, active, premium, newUsers] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments({ lastActiveAt: { $gte: last30d }, isActive: true }),
    User.countDocuments({ 'subscription.plan': { $ne: 'free' }, isActive: true }),
    User.countDocuments({ createdAt: { $gte: last30d } }),
  ]);
  res.json({ success: true, data: { total, active, dormant: total - active, premium, newUsers } });
});
