const express = require('express');
const router = express.Router();
const cashierController = require('../modules/cashiers/cashierController');

// Endpoint staf kasir (diakses oleh Web Dashboard & Flutter POS)
router.get('/', cashierController.getAllCashiers);
router.post('/login', cashierController.loginCashier);
router.post('/logout', cashierController.logoutCashier);
router.post('/', cashierController.createCashier);
router.put('/:id', cashierController.updateCashier);
router.patch('/:id/toggle', cashierController.toggleCashierStatus);
router.delete('/:id', cashierController.deleteCashier);

module.exports = router;
