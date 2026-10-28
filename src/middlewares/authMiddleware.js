const { verifyAccessToken } = require('../config/jwt');

/**
 * Middleware untuk memverifikasi JWT Access Token pada rute yang dilindungi
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak! Token otentikasi tidak ditemukan.',
    });
  }

  // Format header: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Format token salah! Gunakan format: Bearer <token>',
    });
  }

  const token = parts[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // Menyimpan data user (id, email, role, nama) ke request
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token sudah kedaluwarsa (expired)! Silakan refresh token atau login ulang.',
        isExpired: true,
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Token tidak valid atau telah dimodifikasi!',
    });
  }
}

module.exports = authMiddleware;
