const express = require('express');
const router = express.Router();
const settingsController = require('../modules/settings/settingsController');

// GET /api/settings - Ambil konfigurasi pengaturan toko
router.get('/', settingsController.getSettings);

// PUT /api/settings - Simpan perubahan konfigurasi pengaturan toko
router.put('/', settingsController.updateSettings);

// POST /api/settings - Alternatif simpan perubahan
router.post('/', settingsController.updateSettings);

module.exports = router;

