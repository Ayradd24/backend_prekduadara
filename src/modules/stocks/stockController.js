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
    const { amount, action, newStock: directStock } = req.body; // action: 'add' | 'subtract' atau langsung directStock

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

    if (directStock !== undefined) {
      newStock = Math.max(0, Number(directStock) || 0);
    } else {
      const qty = Number(amount) || 0;
      if (action === 'add') {
        newStock += qty;
      } else if (action === 'subtract') {
        newStock = Math.max(0, newStock - qty);
      }
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

/**
 * Controller: Tambah bahan baku baru ke MariaDB
 */
async function createStock(req, res) {
  try {
    const { name, stock, unit, minStock } = req.body;
    if (!name || !unit) {
      return res.status(400).json({
        success: false,
        message: 'Nama dan satuan bahan baku wajib diisi!',
      });
    }

    const numStock = Number(stock) || 0;
    const numMin = Number(minStock) || 10;
    let status = 'Aman';
    if (numStock <= numMin / 2) status = 'Kritis';
    else if (numStock <= numMin) status = 'Menipis';

    const [result] = await pool.query(
      'INSERT INTO stocks (name, stock, unit, min_stock, status) VALUES (?, ?, ?, ?, ?)',
      [name, numStock, unit, numMin, status]
    );

    return res.status(201).json({
      success: true,
      message: 'Bahan baku berhasil ditambahkan ke database',
      data: {
        id: String(result.insertId),
        name,
        stock: numStock,
        unit,
        minStock: numMin,
        status,
      },
    });
  } catch (error) {
    console.error('Error saat menambah stok:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menambah data stok',
    });
  }
}

/**
 * Controller: Hapus bahan baku dari MariaDB
 */
async function deleteStock(req, res) {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM stocks WHERE id = ?', [id]);
    return res.status(200).json({
      success: true,
      message: 'Bahan baku berhasil dihapus dari database',
    });
  } catch (error) {
    console.error('Error saat menghapus stok:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus stok',
    });
  }
}

module.exports = {
  getAllStocks,
  updateStock,
  createStock,
  deleteStock,
};
