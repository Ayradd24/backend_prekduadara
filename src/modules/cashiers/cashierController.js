const { pool } = require('../../config/db');

/**
 * Helper: Cek apakah waktu saat ini masuk dalam rentang jam shift
 */
function isCurrentTimeWithinShift(shiftStr) {
  if (!shiftStr) return false;
  const s = shiftStr.toLowerCase();
  if (s.includes('off') || s.includes('libur')) return false;

  const match = s.match(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/);
  const now = new Date();
  const nowTotal = now.getHours() * 60 + now.getMinutes();

  if (!match) {
    const nowH = now.getHours();
    if (s.includes('pagi')) return nowH >= 8 && nowH < 12;
    if (s.includes('siang')) return nowH >= 12 && nowH < 17;
    if (s.includes('malam')) return nowH >= 17 && nowH < 22;
    return false;
  }

  const startTotal = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const endTotal = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);

  if (startTotal <= endTotal) {
    return nowTotal >= startTotal && nowTotal < endTotal;
  } else {
    return nowTotal >= startTotal || nowTotal < endTotal;
  }
}

/**
 * Controller: Ambil daftar staf kasir dari tabel MariaDB `kasir`
 */
async function getAllCashiers(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM kasir ORDER BY id ASC');
    
    const formatted = rows.map((c) => {
      const isActive = Boolean(c.is_active);
      let statusLive = c.status_live;

      if (!isActive) {
        statusLive = 'Selesai Shift / Off';
      } else {
        statusLive = isCurrentTimeWithinShift(c.shift) ? 'Aktif Melayani' : 'Standby / Rehat';
      }

      return {
        id: c.cashier_code,
        dbId: c.id,
        name: c.name,
        roleTitle: c.role_title || 'Kasir',
        shift: c.shift,
        statusLive,
        isActive,
        createdAt: c.created_at,
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Berhasil mengambil daftar staf kasir dari tabel kasir',
      data: formatted,
    });
  } catch (error) {
    console.error('Error saat mengambil staf kasir:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data staf kasir dari database',
    });
  }
}

/**
 * Controller: Tambah staf kasir baru (hanya nama kasir dan shift)
 */
async function createCashier(req, res) {
  try {
    const { name, shift } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Nama kasir wajib diisi!',
      });
    }

    // Hitung nomor kode kasir berikutnya (misal: #KSR-004)
    const [[countResult]] = await pool.query('SELECT COUNT(*) as count FROM kasir');
    const cashierCode = `#KSR-${String(countResult.count + 1).padStart(3, '0')}`;

    const [result] = await pool.query(
      'INSERT INTO kasir (cashier_code, name, role_title, shift, status_live, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [
        cashierCode,
        name.trim(),
        'Kasir',
        shift || 'Shift Pagi (08:00 - 12:00)',
        'Standby / Rehat',
        true,
      ]
    );

    return res.status(201).json({
      success: true,
      message: `Kasir '${name}' berhasil didaftarkan ke sistem!`,
      data: {
        id: cashierCode,
        dbId: result.insertId,
        name: name.trim(),
        roleTitle: 'Kasir',
        shift: shift || 'Shift Pagi (08:00 - 12:00)',
        statusLive: 'Standby / Rehat',
        isActive: true,
      },
    });
  } catch (error) {
    console.error('Error saat menambah staf kasir:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menambahkan staf kasir ke database',
    });
  }
}

/**
 * Controller: Saklar aktifkan / nonaktifkan akses kasir
 */
async function toggleCashierStatus(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM kasir WHERE cashier_code = ? OR id = ?',
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Staf kasir tidak ditemukan!',
      });
    }

    const current = rows[0];
    const newStatus = !current.is_active;

    let newStatusLive = req.body?.status_live;
    if (!newStatusLive) {
      if (!newStatus) {
        newStatusLive = 'Selesai Shift / Off';
      } else {
        newStatusLive = isCurrentTimeWithinShift(current.shift) ? 'Aktif Melayani' : 'Standby / Rehat';
      }
    }

    await pool.query('UPDATE kasir SET is_active = ?, status_live = ? WHERE id = ?', [
      newStatus,
      newStatusLive,
      current.id,
    ]);

    return res.status(200).json({
      success: true,
      message: `Status akses untuk ${current.name} berhasil diubah`,
      data: {
        id: current.cashier_code,
        isActive: newStatus,
        statusLive: newStatusLive,
      },
    });
  } catch (error) {
    console.error('Error saat toggle status kasir:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengubah status kasir',
    });
  }
}

/**
 * Controller: Hapus staf kasir
 */
async function deleteCashier(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM kasir WHERE cashier_code = ? OR id = ?',
      [id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Staf kasir tidak ditemukan!',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Staf kasir berhasil dihapus dari database',
    });
  } catch (error) {
    console.error('Error saat menghapus staf kasir:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus staf kasir',
    });
  }
}

/**
 * Controller: Update data staf kasir
 */
async function updateCashier(req, res) {
  try {
    const { id } = req.params;
    const { name, role_title, shift, status_live } = req.body;

    const [rows] = await pool.query('SELECT * FROM kasir WHERE cashier_code = ? OR id = ?', [id, id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Staf kasir tidak ditemukan!' });
    }

    const current = rows[0];
    const updatedName = name !== undefined ? name.trim() : current.name;
    const updatedRole = role_title !== undefined ? role_title.trim() : current.role_title;
    const updatedShift = shift !== undefined ? shift.trim() : current.shift;
    const updatedStatus = status_live !== undefined ? status_live.trim() : current.status_live;

    await pool.query(
      'UPDATE kasir SET name = ?, role_title = ?, shift = ?, status_live = ? WHERE id = ?',
      [updatedName, updatedRole, updatedShift, updatedStatus, current.id]
    );

    return res.status(200).json({
      success: true,
      message: `Data kasir ${updatedName} berhasil diperbarui!`,
      data: {
        id: current.cashier_code,
        dbId: current.id,
        name: updatedName,
        roleTitle: updatedRole,
        shift: updatedShift,
        statusLive: updatedStatus,
        isActive: Boolean(current.is_active),
      },
    });
  } catch (error) {
    console.error('Error saat mengupdate kasir:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengupdate staf kasir' });
  }
}

module.exports = {
  getAllCashiers,
  createCashier,
  updateCashier,
  toggleCashierStatus,
  deleteCashier,
};
