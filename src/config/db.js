const mysql = require('mysql2/promise');

// Buat connection pool ke MariaDB / MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'prekduadara_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Fungsi untuk menguji koneksi database MariaDB
 */
async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Berhasil terhubung ke database MariaDB (Laragon)!');
    connection.release();
    return true;
  } catch (error) {
    console.warn('⚠️  Peringatan: Belum dapat terhubung ke MariaDB (Laragon).');
    console.warn('   Pastikan Laragon sudah diklik "Start All".');
    console.warn(`   Detail error: ${error.message}`);
    return false;
  }
}

module.exports = {
  pool,
  testDbConnection,
};
