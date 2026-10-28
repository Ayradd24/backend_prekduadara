const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const http = require('http');
const app = require('./app');
const { testDbConnection } = require('./config/db');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log('====================================================');
  console.log(`🍗 Server Prek Dua Dara Backend Berjalan!`);
  console.log(`🌐 Base URL        : http://localhost:${PORT}`);
  console.log(`🔐 Auth API Endpoints:`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/refresh`);
  console.log(`   - GET  http://localhost:${PORT}/api/auth/me (Protected JWT)`);
  console.log(`📦 Modules API:`);
  console.log(`   - /api/transactions (Protected)`);
  console.log(`   - /api/stocks       (Protected)`);
  console.log(`   - /api/cashiers     (MariaDB kasir)`);
  console.log(`   - /api/products     (Menu)`);
  console.log('====================================================');

  // Cek koneksi ke MariaDB (Laragon)
  await testDbConnection();
});
