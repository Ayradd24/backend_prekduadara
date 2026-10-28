const express = require('express');
const router = express.Router();
const cashierController = require('../modules/cashiers/cashierController');
const authMiddleware = require('../middlewares/authMiddleware');

// Endpoint publik atau dilindungi (bisa diakses Flutter kasir tanpa token atau dengan token)
router.get('/', cashierController.getAllCashiers);

// Modifikasi data kasir memerlukan otentikasi JWT admin
router.post('/', authMiddleware, cashierController.createCashier);
router.patch('/:id/toggle', authMiddleware, cashierController.toggleCashierStatus);
router.delete('/:id', authMiddleware, cashierController.deleteCashier);

module.exports = router;
