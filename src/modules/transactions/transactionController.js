const { pool } = require('../../config/db');

/**
 * Controller: Ambil seluruh riwayat transaksi dari MariaDB beserta rincian menu
 */
async function getAllTransactions(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.id as dbId,
        t.trx_code as id,
        t.time,
        t.cashier,
        t.total,
        t.payment_method as paymentMethod,
        t.status,
        t.created_at,
        COALESCE(
          (SELECT GROUP_CONCAT(
             CONCAT(
               ti.quantity,
               'x ',
               COALESCE(p.name, ti.product_name),
               CASE
                 WHEN ti.sambal IS NOT NULL AND ti.sambal != '' THEN CONCAT(' (', ti.sambal, ')')
                 ELSE ''
               END
             ) SEPARATOR ', '
           )
           FROM transaction_items ti
           LEFT JOIN (
             SELECT MIN(id) as id, name, MAX(category) as category
             FROM products
             GROUP BY name
           ) p ON p.name = ti.product_name
           WHERE ti.transaction_id = t.id),
          'Ayam Geprek Bakar + Es Teh'
        ) as itemsSummary,
        COALESCE(
          (SELECT SUM(ti.quantity)
           FROM transaction_items ti
           WHERE ti.transaction_id = t.id),
          1
        ) as totalItems,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
             JSON_OBJECT(
               'productId', p.id,
               'name', COALESCE(p.name, ti.product_name),
               'category', COALESCE(p.category, 'Paket Menu'),
               'sambal', ti.sambal,
               'price', ti.price,
               'quantity', ti.quantity,
               'subtotal', ti.subtotal
             )
           )
           FROM transaction_items ti
           LEFT JOIN (
             SELECT MIN(id) as id, name, MAX(category) as category
             FROM products
             GROUP BY name
           ) p ON p.name = ti.product_name
           WHERE ti.transaction_id = t.id),
          JSON_ARRAY()
        ) as items
      FROM transactions t 
      ORDER BY t.id DESC
    `);

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
    const cashierName = req.body.cashier || (req.user ? req.user.name : 'Kasir Prek Dua Dara');

    // Format kode transaksi harian: TRX-DDMMYY-001 (contoh: TRX-191126-001)
    // Otomatis reset mulai dari 001 setiap kali berganti tanggal (DDMMYY)
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const datePrefix = `${dd}${mm}${yy}`;

    const [latestRows] = await pool.query(
      'SELECT trx_code FROM transactions WHERE trx_code LIKE ? ORDER BY id DESC LIMIT 1',
      [`TRX-${datePrefix}-%`]
    );

    let nextDailySeq = 1;
    if (latestRows.length > 0) {
      const match = latestRows[0].trx_code.match(/-(\d+)$/);
      if (match) {
        nextDailySeq = parseInt(match[1], 10) + 1;
      }
    }

    const trxCode = `TRX-${datePrefix}-${String(nextDailySeq).padStart(3, '0')}`;

    // Simpan ke tabel transactions
    const [result] = await pool.query(
      'INSERT INTO transactions (trx_code, time, cashier, total, payment_method, status) VALUES (?, ?, ?, ?, ?, ?)',
      [trxCode, time, cashierName, Number(total), paymentMethod, 'Selesai']
    );

    const transactionId = result.insertId;

    // Jika ada rincian item, simpan ke tabel transaction_items
    const savedItems = [];
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        let itemName = item.name || item.product_name || 'Menu';
        let itemPrice = Number(item.price) || 0;
        let itemCategory = item.category || 'Paket Menu';
        let resolvedProductId = item.productId || item.product_id || item.id || null;

        if (resolvedProductId) {
          const [prodRows] = await pool.query(
            'SELECT id, name, price, category FROM products WHERE id = ? LIMIT 1',
            [resolvedProductId]
          );
          if (prodRows.length > 0) {
            if (!item.name && !item.product_name) {
              itemName = prodRows[0].name;
            }
            if (!itemPrice) {
              itemPrice = Number(prodRows[0].price) || 0;
            }
            itemCategory = prodRows[0].category || itemCategory;
            resolvedProductId = prodRows[0].id;
          }
        }

        const rawSambal = item.sambal !== undefined ? item.sambal : req.body.sambal;
        const itemSambal =
          typeof rawSambal === 'string' && rawSambal.trim() !== ''
            ? rawSambal.trim().slice(0, 50)
            : null;
        const itemQuantity = Number(item.quantity) || 1;
        const itemSubtotal = Number(item.subtotal) || itemPrice * itemQuantity;

        await pool.query(
          'INSERT INTO transaction_items (transaction_id, product_name, sambal, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
          [
            transactionId,
            itemName,
            itemSambal,
            itemPrice,
            itemQuantity,
            itemSubtotal,
          ]
        );

        savedItems.push({
          productId: resolvedProductId,
          name: itemName,
          category: itemCategory,
          sambal: itemSambal,
          price: itemPrice,
          quantity: itemQuantity,
          subtotal: itemSubtotal,
        });
      }
    }

    const itemsSummary = savedItems
      .map((item) =>
        item.sambal
          ? `${item.quantity}x ${item.name} (${item.sambal})`
          : `${item.quantity}x ${item.name}`
      )
      .join(', ');

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
        itemsSummary,
        items: savedItems,
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
