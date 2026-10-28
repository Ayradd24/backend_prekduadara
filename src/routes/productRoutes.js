const express = require('express');
const router = express.Router();
const productController = require('../modules/products/productController');

// Ambil daftar menu produk (Bisa diakses kasir & dashboard)
router.get('/', productController.getAllProducts);

module.exports = router;
