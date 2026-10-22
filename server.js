const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Server Backend PrekDuaDara berjalan');
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (email === 'admin@gmail.com' && password === 'admin123') {
    res.status(200).json({ message: 'Login berhasil!' });
  } else {
    res.status(401).json({ message: 'Email atau password salah!' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server Backend berjalan di http://localhost:${PORT}`);
});
