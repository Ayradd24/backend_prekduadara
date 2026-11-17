const express = require('express');
const router = express.Router();
const transactionController = require('../modules/transactions/transactionController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/transactions - Ambil semua riwayat transaksi (Bisa diakses dari web dashboard & flutter)
router.get('/', transactionController.getAllTransactions);

// POST /api/transactions - Buat transaksi baru
router.post('/', transactionController.createTransaction);

module.exports = router;
