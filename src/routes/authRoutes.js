const express = require('express');
const router = express.Router();
const authController = require('../modules/auth/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// Endpoint Login (Public) -> Menghasilkan Access Token & Refresh Token
router.post('/login', authController.login);

// Endpoint Refresh Token (Public) -> Memperbarui Access Token
router.post('/refresh', authController.refreshToken);

// Endpoint Cek Profile User Sesi Sekarang (Protected via JWT)
router.get('/me', authMiddleware, authController.getMe);

// Endpoint Logout (Public/Protected)
router.post('/logout', authController.logout);

module.exports = router;
