const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');

const app = express();

// Middlewares Global
app.use(cors({
  origin: '*', // Bisa disesuaikan dengan origin Web dan Flutter
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🍗 API Backend Prek Dua Dara berjalan normal',
    timestamp: new Date().toISOString(),
  });
});

// Mount Semua Rute API di bawah prefix /api
app.use('/api', apiRoutes);

// 404 Handler untuk route yang tidak ditemukan
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Rute '${req.originalUrl}' tidak ditemukan pada server ini.`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal pada server.',
  });
});

module.exports = app;
