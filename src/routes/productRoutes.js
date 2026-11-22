const express = require('express');
const router = express.Router();
const productController = require('../modules/products/productController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/products - Ambil daftar menu produk (Publik, bisa diakses kasir & dashboard tanpa token)
router.get('/', productController.getAllProducts);

// POST /api/products - Tambah produk baru (Protected JWT)
router.post('/', authMiddleware, productController.createProduct);

// PUT /api/products/:id - Perbarui produk (Protected JWT)
router.put('/:id', authMiddleware, productController.updateProduct);

// DELETE /api/products/:id - Hapus produk (Protected JWT)
router.delete('/:id', authMiddleware, productController.deleteProduct);

module.exports = router;
