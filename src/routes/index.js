const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const transactionRoutes = require('./transactionRoutes');
const stockRoutes = require('./stockRoutes');
const cashierRoutes = require('./cashierRoutes');
const settingsRoutes = require('./settingsRoutes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/transactions', transactionRoutes);
router.use('/stocks', stockRoutes);
router.use('/cashiers', cashierRoutes);
router.use('/settings', settingsRoutes);

// Alias untuk kompatibilitas /api/login langsung dari frontend sebelumnya
const authController = require('../modules/auth/authController');
router.post('/login', authController.login);

module.exports = router;
