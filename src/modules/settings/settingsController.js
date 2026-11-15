const { pool } = require('../../config/db');

/**
 * Pastikan tabel store_settings ada dan memiliki setidaknya 1 baris default
 */
async function ensureSettingsTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS store_settings (
      id INT PRIMARY KEY DEFAULT 1,
      nama_warung VARCHAR(255) DEFAULT 'Ayam Geprek PrekDuaDara - Cabang',
      slogan VARCHAR(255) DEFAULT 'Spesial Ayam Geprek Cobek & Sambal Uleg Asli',
      alamat TEXT,
      whatsapp VARCHAR(50) DEFAULT '0812*********',
      email_resto VARCHAR(100) DEFAULT 'halo.cabang@prekduadara.id',
      nib VARCHAR(50) DEFAULT '9120003491824',
      jam_buka_weekday VARCHAR(20) DEFAULT '09:30 WIB',
      jam_tutup_weekday VARCHAR(20) DEFAULT '22:00 WIB',
      jam_buka_weekend VARCHAR(20) DEFAULT '09:00 WIB',
      jam_tutup_weekend VARCHAR(20) DEFAULT '23:00 WIB',
      auto_close_kasir BOOLEAN DEFAULT FALSE,
      istirahat_sore BOOLEAN DEFAULT FALSE,
      pajak_persen VARCHAR(10) DEFAULT '10',
      pajak_tipe VARCHAR(20) DEFAULT 'akhir',
      biaya_kemasan VARCHAR(20) DEFAULT '2.000',
      aturan_pembulatan VARCHAR(100) DEFAULT 'Kelipatan Rp 500 terdekat',
      cetak_logo BOOLEAN DEFAULT TRUE,
      cetak_alamat BOOLEAN DEFAULT TRUE,
      nomor_antrian_besar BOOLEAN DEFAULT TRUE,
      kode_qris_dinamis BOOLEAN DEFAULT TRUE,
      pesan_footer TEXT,
      auto_print_lunas BOOLEAN DEFAULT TRUE,
      channel_tunai BOOLEAN DEFAULT TRUE,
      channel_qris BOOLEAN DEFAULT TRUE,
      channel_edc BOOLEAN DEFAULT TRUE,
      channel_ojol BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;
  await pool.query(createTableQuery);

  const [rows] = await pool.query('SELECT id FROM store_settings WHERE id = 1');
  if (rows.length === 0) {
    const insertDefaultQuery = `
      INSERT INTO store_settings (
        id, nama_warung, slogan, alamat, whatsapp, email_resto, nib,
        jam_buka_weekday, jam_tutup_weekday, jam_buka_weekend, jam_tutup_weekend,
        auto_close_kasir, istirahat_sore, pajak_persen, pajak_tipe, biaya_kemasan, aturan_pembulatan,
        cetak_logo, cetak_alamat, nomor_antrian_besar, kode_qris_dinamis, pesan_footer, auto_print_lunas,
        channel_tunai, channel_qris, channel_edc, channel_ojol
      ) VALUES (
        1, 'Ayam Geprek PrekDuaDara - Cabang', 'Spesial Ayam Geprek Cobek & Sambal Uleg Asli',
        'samping gerbang um/matos', '0812*********', 'halo.cabang@prekduadara.id', '9120003491824',
        '09:30 WIB', '22:00 WIB', '09:00 WIB', '23:00 WIB',
        FALSE, FALSE, '10', 'akhir', '2.000', 'Kelipatan Rp 500 terdekat',
        TRUE, TRUE, TRUE, TRUE, 'Matur nuwun sampun mampir! Pedasnya bikin nagih. Follow IG @prekduadara.id', TRUE,
        TRUE, TRUE, TRUE, TRUE
      )
    `;
    await pool.query(insertDefaultQuery);
  }
}

/**
 * Format data dari database ke camelCase untuk frontend
 */
function formatSettings(row) {
  return {
    namaWarung: row.nama_warung || '',
    slogan: row.slogan || '',
    alamat: row.alamat || '',
    whatsapp: row.whatsapp || '',
    emailResto: row.email_resto || '',
    nib: row.nib || '',
    jamBukaWeekday: row.jam_buka_weekday || '09:30 WIB',
    jamTutupWeekday: row.jam_tutup_weekday || '22:00 WIB',
    jamBukaWeekend: row.jam_buka_weekend || '09:00 WIB',
    jamTutupWeekend: row.jam_tutup_weekend || '23:00 WIB',
    autoCloseKasir: Boolean(row.auto_close_kasir),
    istirahatSore: Boolean(row.istirahat_sore),
    pajakPersen: String(row.pajak_persen || '10'),
    pajakTipe: (row.pajak_tipe === 'termasuk' ? 'termasuk' : 'akhir'),
    biayaKemasan: String(row.biaya_kemasan || '2.000'),
    aturanPembulatan: row.aturan_pembulatan || 'Kelipatan Rp 500 terdekat',
    cetakLogo: Boolean(row.cetak_logo),
    cetakAlamat: Boolean(row.cetak_alamat),
    nomorAntrianBesar: Boolean(row.nomor_antrian_besar),
    kodeQrisDinamis: Boolean(row.kode_qris_dinamis),
    pesanFooter: row.pesan_footer || '',
    autoPrintLunas: Boolean(row.auto_print_lunas),
    channelTunai: Boolean(row.channel_tunai),
    channelQris: Boolean(row.channel_qris),
    channelEdc: Boolean(row.channel_edc),
    channelOjol: Boolean(row.channel_ojol),
    updatedAt: row.updated_at,
  };
}

/**
 * Controller: GET /api/settings - Ambil konfigurasi pengaturan toko
 */
async function getSettings(req, res) {
  try {
    await ensureSettingsTable();
    const [rows] = await pool.query('SELECT * FROM store_settings WHERE id = 1 LIMIT 1');
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pengaturan toko tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Berhasil mengambil pengaturan toko',
      data: formatSettings(rows[0]),
    });
  } catch (error) {
    console.error('Error saat mengambil pengaturan toko:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil pengaturan toko dari database: ' + error.message,
    });
  }
}

/**
 * Controller: PUT /api/settings - Update konfigurasi pengaturan toko
 */
async function updateSettings(req, res) {
  try {
    await ensureSettingsTable();
    const body = req.body || {};

    const updateQuery = `
      UPDATE store_settings SET
        nama_warung = COALESCE(?, nama_warung),
        slogan = COALESCE(?, slogan),
        alamat = COALESCE(?, alamat),
        whatsapp = COALESCE(?, whatsapp),
        email_resto = COALESCE(?, email_resto),
        nib = COALESCE(?, nib),
        jam_buka_weekday = COALESCE(?, jam_buka_weekday),
        jam_tutup_weekday = COALESCE(?, jam_tutup_weekday),
        jam_buka_weekend = COALESCE(?, jam_buka_weekend),
        jam_tutup_weekend = COALESCE(?, jam_tutup_weekend),
        auto_close_kasir = COALESCE(?, auto_close_kasir),
        istirahat_sore = COALESCE(?, istirahat_sore),
        pajak_persen = COALESCE(?, pajak_persen),
        pajak_tipe = COALESCE(?, pajak_tipe),
        biaya_kemasan = COALESCE(?, biaya_kemasan),
        aturan_pembulatan = COALESCE(?, aturan_pembulatan),
        cetak_logo = COALESCE(?, cetak_logo),
        cetak_alamat = COALESCE(?, cetak_alamat),
        nomor_antrian_besar = COALESCE(?, nomor_antrian_besar),
        kode_qris_dinamis = COALESCE(?, kode_qris_dinamis),
        pesan_footer = COALESCE(?, pesan_footer),
        auto_print_lunas = COALESCE(?, auto_print_lunas),
        channel_tunai = COALESCE(?, channel_tunai),
        channel_qris = COALESCE(?, channel_qris),
        channel_edc = COALESCE(?, channel_edc),
        channel_ojol = COALESCE(?, channel_ojol)
      WHERE id = 1
    `;

    const values = [
      body.namaWarung !== undefined ? body.namaWarung : null,
      body.slogan !== undefined ? body.slogan : null,
      body.alamat !== undefined ? body.alamat : null,
      body.whatsapp !== undefined ? body.whatsapp : null,
      body.emailResto !== undefined ? body.emailResto : null,
      body.nib !== undefined ? body.nib : null,
      body.jamBukaWeekday !== undefined ? body.jamBukaWeekday : null,
      body.jamTutupWeekday !== undefined ? body.jamTutupWeekday : null,
      body.jamBukaWeekend !== undefined ? body.jamBukaWeekend : null,
      body.jamTutupWeekend !== undefined ? body.jamTutupWeekend : null,
      body.autoCloseKasir !== undefined ? body.autoCloseKasir : null,
      body.istirahatSore !== undefined ? body.istirahatSore : null,
      body.pajakPersen !== undefined ? body.pajakPersen : null,
      body.pajakTipe !== undefined ? body.pajakTipe : null,
      body.biayaKemasan !== undefined ? body.biayaKemasan : null,
      body.aturanPembulatan !== undefined ? body.aturanPembulatan : null,
      body.cetakLogo !== undefined ? body.cetakLogo : null,
      body.cetakAlamat !== undefined ? body.cetakAlamat : null,
      body.nomorAntrianBesar !== undefined ? body.nomorAntrianBesar : null,
      body.kodeQrisDinamis !== undefined ? body.kodeQrisDinamis : null,
      body.pesanFooter !== undefined ? body.pesanFooter : null,
      body.autoPrintLunas !== undefined ? body.autoPrintLunas : null,
      body.channelTunai !== undefined ? body.channelTunai : null,
      body.channelQris !== undefined ? body.channelQris : null,
      body.channelEdc !== undefined ? body.channelEdc : null,
      body.channelOjol !== undefined ? body.channelOjol : null,
    ];

    await pool.query(updateQuery, values);

    const [rows] = await pool.query('SELECT * FROM store_settings WHERE id = 1 LIMIT 1');
    return res.status(200).json({
      success: true,
      message: 'Perubahan pengaturan toko berhasil disimpan!',
      data: formatSettings(rows[0]),
    });
  } catch (error) {
    console.error('Error saat menyimpan pengaturan toko:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan pengaturan toko: ' + error.message,
    });
  }
}

module.exports = {
  getSettings,
  updateSettings,
};

