const { pool } = require('../../config/db');

/**
 * Controller: Ambil daftar seluruh menu produk dari MariaDB
 */
async function getAllProducts(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM products ORDER BY id ASC');
    return res.status(200).json({
      success: true,
      message: 'Berhasil mengambil daftar produk menu dari database',
      data: rows,
    });
  } catch (error) {
    console.error('Error saat mengambil produk:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data produk dari database',
    });
  }
}

/**
 * Controller: Tambah produk baru ke MariaDB (opsional)
 */
async function createProduct(req, res) {
  try {
    const { name, price, category, image } = req.body;
    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Nama, harga, dan kategori produk wajib diisi!',
      });
    }

    const [result] = await pool.query(
      'INSERT INTO products (name, price, category, image) VALUES (?, ?, ?, ?)',
      [name, Number(price), category, image || '']
    );

    return res.status(201).json({
      success: true,
      message: 'Produk berhasil ditambahkan ke database',
      data: {
        id: result.insertId,
        name,
        price: Number(price),
        category,
        image: image || '',
      },
    });
  } catch (error) {
    console.error('Error saat menambah produk:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan produk ke database',
    });
  }
}

module.exports = {
  getAllProducts,
  createProduct,
};
