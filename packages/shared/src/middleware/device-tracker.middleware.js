// Extracts and normalizes device info from request headers
const deviceTracker = (req, _res, next) => {
  req.deviceInfo = {
    deviceId: req.headers['x-device-id'] || null,
    deviceType: req.headers['x-device-type'] || 'web',
    appVersion: req.headers['x-app-version'] || null,
    osVersion: req.headers['x-os-version'] || null,
    userAgent: req.headers['user-agent'] || null,
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    connectionType: req.headers['x-connection-type'] || 'unknown',
  };
  next();
};

module.exports = { deviceTracker };
