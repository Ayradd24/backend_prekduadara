const express = require('express');
const router = express.Router();
const stockController = require('../modules/stocks/stockController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/stocks - Ambil daftar stok bahan baku (bisa diakses dashboard / POS)
router.get('/', stockController.getAllStocks);

// POST /api/stocks - Tambah bahan baku baru
router.post('/', stockController.createStock);

// PATCH /api/stocks/:id - Tambah atau kurangi stok / set nilai langsung
router.patch('/:id', stockController.updateStock);

// DELETE /api/stocks/:id - Hapus bahan baku
router.delete('/:id', stockController.deleteStock);

module.exports = router;
