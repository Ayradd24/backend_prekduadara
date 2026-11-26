const express = require('express');
const router = express.Router();
const stockForecastController = require('../modules/analytics/stockForecastController');

// GET /api/analytics/stock-forecast - Prediksi kebutuhan stok & analisis 5 tren pasar mahasiswa
router.get('/stock-forecast', stockForecastController.getStockForecast);

// PUT /api/analytics/market-trend - Perbarui tren pasar mahasiswa aktif & target hari aman
router.put('/market-trend', stockForecastController.updateActiveMarketTrend);

module.exports = router;
