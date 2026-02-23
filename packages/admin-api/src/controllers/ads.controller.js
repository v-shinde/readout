const { asyncHandler, NotFoundError, ValidationError } = require('@readout/shared').utils;
const { AdCampaign } = require('@readout/shared').models;

exports.listCampaigns = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, type } = req.query;
  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;
  const [campaigns, total] = await Promise.all([
    AdCampaign.find(query).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).lean(),
    AdCampaign.countDocuments(query),
  ]);
  res.json({ success: true, data: { campaigns, total, page: +page } });
});

exports.getCampaign = asyncHandler(async (req, res) => {
  const campaign = await AdCampaign.findById(req.params.id).lean();
  if (!campaign) throw new NotFoundError('Campaign');
  res.json({ success: true, data: campaign });
});

exports.createCampaign = asyncHandler(async (req, res) => {
  const campaign = await AdCampaign.create(req.body);
  res.status(201).json({ success: true, data: campaign });
});

exports.updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await AdCampaign.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!campaign) throw new NotFoundError('Campaign');
  res.json({ success: true, data: campaign });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['active', 'paused', 'completed', 'rejected', 'approved'];
  if (!valid.includes(status)) throw new ValidationError('Invalid status');
  const updates = { status };
  if (status === 'approved' || status === 'rejected') {
    updates.reviewedBy = req.userId;
    updates.reviewedAt = new Date();
    if (status === 'rejected') updates.rejectionReason = req.body.reason;
  }
  const campaign = await AdCampaign.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
  if (!campaign) throw new NotFoundError('Campaign');
  res.json({ success: true, data: { id: campaign._id, status: campaign.status } });
});

exports.getCampaignAnalytics = asyncHandler(async (req, res) => {
  const campaign = await AdCampaign.findById(req.params.id).select('metrics name status schedule pricing').lean();
  if (!campaign) throw new NotFoundError('Campaign');
  res.json({ success: true, data: campaign });
});

exports.deleteCampaign = asyncHandler(async (req, res) => {
  await AdCampaign.findByIdAndUpdate(req.params.id, { $set: { status: 'archived' } });
  res.json({ success: true });
});
