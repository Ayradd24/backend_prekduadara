const { pool } = require('../../config/db');

/**
 * Controller: Ambil daftar stok bahan baku dari MariaDB
 */
async function getAllStocks(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM stocks ORDER BY id ASC');
    
    // Format agar cocok dengan frontend (unit, minStock, status)
    const formatted = rows.map((s) => ({
      id: String(s.id),
      name: s.name,
      stock: Number(s.stock),
      unit: s.unit,
      minStock: Number(s.min_stock),
      status: s.status,
    }));

    return res.status(200).json({
      success: true,
      message: 'Berhasil mengambil daftar inventaris stok dari database',
      data: formatted,
    });
  } catch (error) {
    console.error('Error saat mengambil data stok:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data stok dari database',
    });
  }
}

/**
 * Controller: Tambah atau kurangi stok bahan baku di MariaDB
 */
async function updateStock(req, res) {
  try {
    const { id } = req.params;
    const { amount, action } = req.body; // action: 'add' atau 'subtract'

    // Ambil data stok saat ini
    const [rows] = await pool.query('SELECT * FROM stocks WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bahan baku tidak ditemukan di database!',
      });
    }

    const currentItem = rows[0];
    let newStock = Number(currentItem.stock);
    const qty = Number(amount) || 0;

    if (action === 'add') {
      newStock += qty;
    } else if (action === 'subtract') {
      newStock = Math.max(0, newStock - qty);
    }

    // Hitung status baru
    let newStatus = 'Aman';
    const minStock = Number(currentItem.min_stock);
    if (newStock <= minStock / 2) {
      newStatus = 'Kritis';
    } else if (newStock <= minStock) {
      newStatus = 'Menipis';
    }

    // Update ke MariaDB
    await pool.query('UPDATE stocks SET stock = ?, status = ? WHERE id = ?', [
      newStock,
      newStatus,
      id,
    ]);

    return res.status(200).json({
      success: true,
      message: 'Stok berhasil diperbarui di database',
      data: {
        id: String(currentItem.id),
        name: currentItem.name,
        stock: newStock,
        unit: currentItem.unit,
        minStock,
        status: newStatus,
      },
    });
  } catch (error) {
    console.error('Error saat memperbarui stok:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui stok di database',
    });
  }
}

module.exports = {
  getAllStocks,
  updateStock,
};
