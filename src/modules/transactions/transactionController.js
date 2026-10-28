const { pool } = require('../../config/db');

/**
 * Controller: Ambil seluruh riwayat transaksi dari MariaDB
 */
async function getAllTransactions(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT trx_code as id, time, cashier, total, payment_method as paymentMethod, status, created_at FROM transactions ORDER BY transactions.id DESC'
    );

    return res.status(200).json({
      success: true,
      message: 'Berhasil mengambil riwayat transaksi dari database',
      data: rows,
    });
  } catch (error) {
    console.error('Error saat mengambil transaksi:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil riwayat transaksi dari database',
    });
  }
}

/**
 * Controller: Simpan transaksi baru ke MariaDB
 */
async function createTransaction(req, res) {
  try {
    const { total, paymentMethod, items } = req.body;

    if (!total || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Total dan metode pembayaran wajib diisi!',
      });
    }

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const cashierName = req.user ? req.user.name : 'Kasir Prek Dua Dara';

    // Hitung count untuk trx_code
    const [[countResult]] = await pool.query('SELECT COUNT(*) as count FROM transactions');
    const trxCode = `TRX-${String(countResult.count + 1).padStart(3, '0')}`;

    // Simpan ke tabel transactions
    const [result] = await pool.query(
      'INSERT INTO transactions (trx_code, time, cashier, total, payment_method, status) VALUES (?, ?, ?, ?, ?, ?)',
      [trxCode, time, cashierName, Number(total), paymentMethod, 'Selesai']
    );

    const transactionId = result.insertId;

    // Jika ada rincian item, simpan ke tabel transaction_items
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        await pool.query(
          'INSERT INTO transaction_items (transaction_id, product_name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?)',
          [
            transactionId,
            item.name || 'Menu',
            Number(item.price) || 0,
            Number(item.quantity) || 1,
            Number(item.subtotal) || Number(item.price) * (Number(item.quantity) || 1),
          ]
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Transaksi berhasil disimpan ke database',
      data: {
        id: trxCode,
        time,
        cashier: cashierName,
        total: Number(total),
        paymentMethod,
        status: 'Selesai',
      },
    });
  } catch (error) {
    console.error('Error saat membuat transaksi:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan transaksi ke database',
    });
  }
}

module.exports = {
  getAllTransactions,
  createTransaction,
};
