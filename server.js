const express = require('express');
const cors = require('cors'); // Wajib dipasang sesuai soal UTS agar Next.js bisa akses

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Agar bisa membaca data dari form frontend

// Test root route
app.get('/', (req, res) => {
  res.send('✅ Server Backend PrekDuaDara berjalan');
});

// Endpoint API Login (Backend menerima request dari Frontend)
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  // SEMENTARA: Kita pakai akun yang di-hardcode. 
  // Nanti kita ganti pakai database MySQL sesuai syarat UTS.
  if (email === 'admin@gmail.com' && password === 'admin123') {
    // Jika benar, kirim status 200 (OK)
    res.status(200).json({ message: 'Login berhasil!' });
  } else {
    // Jika salah, kirim status 400 atau 401 (Error)
    res.status(401).json({ message: 'Email atau password salah!' });
  }
});

// Jalankan Backend di port 5000 (agar tidak bentrok dengan Next.js di 3000)
app.listen(PORT, () => {
  console.log(`✅ Server Backend berjalan di http://localhost:${PORT}`);
});
