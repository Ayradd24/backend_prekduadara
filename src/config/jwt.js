const jwt = require('jsonwebtoken');

const JWT_CONFIG = {
  accessSecret: process.env.JWT_SECRET || 'supersecretkey_prekduadara_jwt_2026',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'supersecretrefreshkey_prekduadara_2026',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

/**
 * Generate Access Token (digunakan untuk autentikasi request)
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_CONFIG.accessSecret, {
    expiresIn: JWT_CONFIG.accessExpiresIn,
  });
}

/**
 * Generate Refresh Token (digunakan untuk memperbarui access token tanpa login ulang)
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_CONFIG.refreshSecret, {
    expiresIn: JWT_CONFIG.refreshExpiresIn,
  });
}

/**
 * Verifikasi Access Token
 */
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_CONFIG.accessSecret);
}

/**
 * Verifikasi Refresh Token
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_CONFIG.refreshSecret);
}

module.exports = {
  JWT_CONFIG,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
