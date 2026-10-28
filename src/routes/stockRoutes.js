const express = require('express');
const router = express.Router();
const stockController = require('../modules/stocks/stockController');
const authMiddleware = require('../middlewares/authMiddleware');

// Semua rute inventaris stok dilindungi dengan authMiddleware (JWT Token)
router.use(authMiddleware);

// GET /api/stocks - Ambil daftar stok bahan baku
router.get('/', stockController.getAllStocks);

// PATCH /api/stocks/:id - Tambah atau kurangi stok
router.patch('/:id', stockController.updateStock);

module.exports = router;
