const crypto = require('crypto');

const hashUrl = (url) => crypto.createHash('sha256').update(url).digest('hex');

const paginate = (query, page = 1, limit = 20) => {
  const skip = (Math.max(1, page) - 1) * limit;
  return query.skip(skip).limit(Math.min(limit, 100));
};

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) otp += digits[Math.floor(Math.random() * 10)];
  return otp;
};

module.exports = { hashUrl, paginate, asyncHandler, generateOTP };
