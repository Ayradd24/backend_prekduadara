const express = require('express');
const router = express.Router();
const stockController = require('../modules/stocks/stockController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/stocks - Ambil daftar stok bahan baku (bisa diakses dashboard / POS)
router.get('/', stockController.getAllStocks);

// PATCH /api/stocks/:id - Tambah atau kurangi stok
router.patch('/:id', stockController.updateStock);

module.exports = router;
