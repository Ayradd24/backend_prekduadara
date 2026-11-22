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
 * Controller: Tambah produk baru ke MariaDB
 */
async function createProduct(req, res) {
  try {
    const { name, description, price, category, image } = req.body;
    if (
      !name ||
      String(name).trim() === '' ||
      price === undefined ||
      price === null ||
      price === '' ||
      !category ||
      String(category).trim() === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Nama, harga, dan kategori produk wajib diisi!',
      });
    }

    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Harga produk harus berupa angka yang valid!',
      });
    }

    const cleanName = String(name).trim();
    const cleanDescription = description !== undefined && description !== null ? String(description).trim() : '';
    const cleanCategory = String(category).trim();
    const cleanImage = image !== undefined && image !== null ? String(image).trim() : '';

    const [result] = await pool.query(
      'INSERT INTO products (name, description, price, category, image) VALUES (?, ?, ?, ?, ?)',
      [cleanName, cleanDescription, numericPrice, cleanCategory, cleanImage]
    );

    return res.status(201).json({
      success: true,
      message: 'Produk berhasil ditambahkan ke database',
      data: {
        id: result.insertId,
        name: cleanName,
        description: cleanDescription,
        price: numericPrice,
        category: cleanCategory,
        image: cleanImage,
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

/**
 * Controller: Perbarui produk di MariaDB
 */
async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, description, price, category, image } = req.body;

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan di database!',
      });
    }

    const current = rows[0];
    const updatedName = name !== undefined ? String(name).trim() : current.name;
    const updatedDescription =
      description !== undefined && description !== null
        ? String(description).trim()
        : (current.description || '');
    const updatedPrice =
      price !== undefined && price !== null && price !== ''
        ? Number(price)
        : Number(current.price);
    const updatedCategory = category !== undefined ? String(category).trim() : current.category;
    const updatedImage =
      image !== undefined && image !== null
        ? String(image).trim()
        : (current.image || '');

    if (!updatedName || !updatedCategory) {
      return res.status(400).json({
        success: false,
        message: 'Nama dan kategori produk tidak boleh kosong!',
      });
    }

    if (Number.isNaN(updatedPrice) || updatedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Harga produk harus berupa angka yang valid!',
      });
    }

    await pool.query(
      'UPDATE products SET name = ?, description = ?, price = ?, category = ?, image = ? WHERE id = ?',
      [updatedName, updatedDescription, updatedPrice, updatedCategory, updatedImage, current.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Produk berhasil diperbarui di database',
      data: {
        id: current.id,
        name: updatedName,
        description: updatedDescription,
        price: updatedPrice,
        category: updatedCategory,
        image: updatedImage,
      },
    });
  } catch (error) {
    console.error('Error saat memperbarui produk:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui produk di database',
    });
  }
}

/**
 * Controller: Hapus produk dari MariaDB
 */
async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan di database!',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Produk berhasil dihapus dari database',
    });
  } catch (error) {
    console.error('Error saat menghapus produk:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus produk dari database',
    });
  }
}

module.exports = {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};
