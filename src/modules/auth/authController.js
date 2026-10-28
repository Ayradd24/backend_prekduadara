const { pool } = require('../../config/db');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../../config/jwt');

/**
 * Controller: Login User & Generate JWT (Access + Refresh Token) dari MariaDB
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email dan password wajib diisi!',
      });
    }

    // Ambil user dari database MariaDB
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email atau password yang Anda masukkan salah!',
      });
    }

    const user = rows[0];

    // Cek kesesuaian password
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Email atau password yang Anda masukkan salah!',
      });
    }

    // Payload yang disimpan di dalam token JWT
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // Buat Access Token & Refresh Token
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: user.id });

    return res.status(200).json({
      success: true,
      message: 'Login berhasil!',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
      },
    });
  } catch (error) {
    console.error('Error saat login:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat login.',
    });
  }
}

/**
 * Controller: Refresh Access Token menggunakan Refresh Token
 */
async function refreshToken(req, res) {
  try {
    const { refreshToken: incomingRefreshToken } = req.body;

    if (!incomingRefreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token wajib disertakan!',
      });
    }

    // Verifikasi Refresh Token
    let decoded;
    try {
      decoded = verifyRefreshToken(incomingRefreshToken);
    } catch (err) {
      return res.status(403).json({
        success: false,
        message: 'Refresh token tidak valid atau telah kedaluwarsa! Silakan login ulang.',
      });
    }

    // Ambil data user dari database MariaDB berdasarkan ID token
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User pemilik token tidak ditemukan di database!',
      });
    }

    const user = rows[0];

    // Generate access token baru
    const newAccessToken = generateAccessToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return res.status(200).json({
      success: true,
      message: 'Access token berhasil diperbarui!',
      data: {
        accessToken: newAccessToken,
        tokenType: 'Bearer',
      },
    });
  } catch (error) {
    console.error('Error saat refresh token:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat memperbarui token.',
    });
  }
}

/**
 * Controller: Ambil profil user yang sedang login (Protected by JWT)
 */
async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Data sesi login valid',
    data: {
      user: req.user,
    },
  });
}

/**
 * Controller: Logout
 */
async function logout(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Logout berhasil. Sesi telah diakhiri.',
  });
}

module.exports = {
  login,
  refreshToken,
  getMe,
  logout,
};
