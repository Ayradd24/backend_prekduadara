-- ========================================================
-- Database Schema Prek Dua Dara (MariaDB / MySQL)
-- ========================================================

CREATE DATABASE IF NOT EXISTS prekduadara_db;
USE prekduadara_db;

-- 1. Tabel Users (Khusus Akun Login Web Admin / Owner)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('owner', 'manager') DEFAULT 'owner',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Kasir (Daftar Staf Kasir POS PrekDuaDara)
CREATE TABLE IF NOT EXISTS kasir (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cashier_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    role_title VARCHAR(50) DEFAULT 'Kasir',
    shift VARCHAR(50) DEFAULT 'Shift Pagi (08:00 - 12:00)',
    status_live ENUM('Aktif Melayani', 'Standby / Rehat', 'Selesai Shift / Off') DEFAULT 'Aktif Melayani',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Products (Menu Makanan & Minuman Resmi PrekDuaDara)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255) DEFAULT '',
    price INT NOT NULL,
    category VARCHAR(50) DEFAULT 'Paket Menu',
    image VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Stocks (Inventaris Bahan Baku)
CREATE TABLE IF NOT EXISTS stocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL,
    min_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    status ENUM('Aman', 'Menipis', 'Kritis') DEFAULT 'Aman',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Tabel Transactions (Riwayat Transaksi Penjualan)
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trx_code VARCHAR(50) NOT NULL UNIQUE,
    time VARCHAR(10) NOT NULL,
    cashier VARCHAR(100) NOT NULL,
    total INT NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Selesai',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabel Transaction Items (Rincian Item per Transaksi)
CREATE TABLE IF NOT EXISTS transaction_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    price INT NOT NULL,
    quantity INT NOT NULL,
    subtotal INT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- ========================================================
-- SEED DATA AWAL (Data Dummy untuk Pengujian)
-- ========================================================

-- Akun Login Web Admin
INSERT IGNORE INTO users (id, name, email, password, role) VALUES
(1, 'Admin', 'admin@gmail.com', 'admin123', 'owner');

-- Daftar Staf Kasir POS (3 Kasir: Rian, Siti, Budi)
INSERT IGNORE INTO kasir (id, cashier_code, name, role_title, shift, status_live, is_active) VALUES
(1, '#KSR-001', 'Rian', 'Kasir', 'Shift Pagi (08:00 - 12:00)', 'Aktif Melayani', TRUE),
(2, '#KSR-002', 'Siti', 'Kasir', 'Shift Siang (12:00 - 17:00)', 'Standby / Rehat', TRUE),
(3, '#KSR-003', 'Budi', 'Kasir', 'Shift Malam (17:00 - 22:00)', 'Standby / Rehat', TRUE);

-- Menu Produk Resmi PrekDuaDara (2 Menu Paket)
INSERT IGNORE INTO products (id, name, description, price, category, image) VALUES
(1, 'Ayam Geprek Bakar + Es Teh', 'Nasi + Ayam Geprek Bakar + Es Teh', 18000, 'Paket Menu', 'assets/images/geprek_bakar.jpg'),
(2, 'Ayam Geprek Biasa + Es Teh', 'Nasi + Ayam Geprek Biasa + Es Teh', 17000, 'Paket Menu', 'assets/images/geprek_biasa.jpg');

-- Stok Bahan Baku Default
INSERT IGNORE INTO stocks (id, name, stock, unit, min_stock, status) VALUES
(1, 'Ayam Potong Segar', 24.00, 'kg', 10.00, 'Aman'),
(2, 'Minyak Goreng Sawit', 5.00, 'liter', 8.00, 'Menipis'),
(3, 'Cabai Rawit Merah', 2.00, 'kg', 5.00, 'Kritis'),
(4, 'Beras Ramos', 50.00, 'kg', 20.00, 'Aman'),
(5, 'Tepung Bumbu Crispy', 15.00, 'kg', 5.00, 'Aman');


-- 7. Tabel Store Settings (Pengaturan & Konfigurasi Toko PrekDuaDara)
CREATE TABLE IF NOT EXISTS store_settings (
    id INT PRIMARY KEY DEFAULT 1,
    nama_warung VARCHAR(255) DEFAULT 'Ayam Geprek PrekDuaDara - Cabang',
    slogan VARCHAR(255) DEFAULT 'Spesial Ayam Geprek Cobek & Sambal Uleg Asli',
    alamat TEXT,
    whatsapp VARCHAR(50) DEFAULT '0812*********',
    email_resto VARCHAR(100) DEFAULT 'halo.cabang@prekduadara.id',
    nib VARCHAR(50) DEFAULT '9120003491824',
    jam_buka_weekday VARCHAR(20) DEFAULT '09:30 WIB',
    jam_tutup_weekday VARCHAR(20) DEFAULT '22:00 WIB',
    jam_buka_weekend VARCHAR(20) DEFAULT '09:00 WIB',
    jam_tutup_weekend VARCHAR(20) DEFAULT '23:00 WIB',
    auto_close_kasir BOOLEAN DEFAULT FALSE,
    istirahat_sore BOOLEAN DEFAULT FALSE,
    pajak_persen VARCHAR(10) DEFAULT '10',
    pajak_tipe VARCHAR(20) DEFAULT 'akhir',
    biaya_kemasan VARCHAR(20) DEFAULT '2.000',
    aturan_pembulatan VARCHAR(100) DEFAULT 'Kelipatan Rp 500 terdekat',
    cetak_logo BOOLEAN DEFAULT TRUE,
    cetak_alamat BOOLEAN DEFAULT TRUE,
    nomor_antrian_besar BOOLEAN DEFAULT TRUE,
    kode_qris_dinamis BOOLEAN DEFAULT TRUE,
    pesan_footer TEXT,
    auto_print_lunas BOOLEAN DEFAULT TRUE,
    channel_tunai BOOLEAN DEFAULT TRUE,
    channel_qris BOOLEAN DEFAULT TRUE,
    channel_edc BOOLEAN DEFAULT TRUE,
    channel_ojol BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO store_settings (
    id, nama_warung, slogan, alamat, whatsapp, email_resto, nib,
    jam_buka_weekday, jam_tutup_weekday, jam_buka_weekend, jam_tutup_weekend,
    auto_close_kasir, istirahat_sore, pajak_persen, pajak_tipe, biaya_kemasan, aturan_pembulatan,
    cetak_logo, cetak_alamat, nomor_antrian_besar, kode_qris_dinamis, pesan_footer, auto_print_lunas,
    channel_tunai, channel_qris, channel_edc, channel_ojol
) VALUES (
    1, 'Ayam Geprek PrekDuaDara - Cabang', 'Spesial Ayam Geprek Cobek & Sambal Uleg Asli',
    'samping gerbang um/matos', '0812*********', 'halo.cabang@prekduadara.id', '9120003491824',
    '09:30 WIB', '22:00 WIB', '09:00 WIB', '23:00 WIB',
    FALSE, FALSE, '10', 'akhir', '2.000', 'Kelipatan Rp 500 terdekat',
    TRUE, TRUE, TRUE, TRUE, 'Matur nuwun sampun mampir! Pedasnya bikin nagih. Follow IG @prekduadara.id', TRUE,
    TRUE, TRUE, TRUE, TRUE
);
