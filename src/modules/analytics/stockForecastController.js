const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { pool } = require('../../config/db');

const GEMINI_ENGINE_LINEUP = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

const SCENARIO_TRENDS = [
  'awal_semester',
  'bulan_puasa',
  'pekan_ujian',
  'siklus_kiriman',
  'libur_semester',
  'normal',
];

const VALID_TRENDS = ['auto', ...SCENARIO_TRENDS];

const VALID_TREND_CATEGORIES = [
  'siklus_mahasiswa',
  'musiman_cuaca',
  'anomali_penjualan',
  'event_khusus',
  'operasional_normal',
];

const MIN_MULTIPLIER = 0.4;
const MAX_MULTIPLIER = 1.8;

const INTEGER_UNITS = new Set([
  'pcs',
  'box',
  'cup',
  'bungkus',
  'pack',
  'block',
  'botol',
  'kaleng',
]);

// Cache in-memory 15 menit (900 detik) untuk hasil sukses Gemini agar kuota awet
const GEMINI_CACHE_TTL_MS = 15 * 60 * 1000;
const geminiForecastCache = new Map();

// Cooldown otomatis 5 menit jika semua model Gemini mengembalikan 429 (anti-delay < 50ms)
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
let geminiRateLimitedUntil = 0;
let geminiRateLimitReason = null;

// Kata kunci acara besar / keramaian untuk fallback lokal yang responsif saat offline
const MAJOR_EVENT_KEYWORDS = [
  'hut',
  'event',
  'presiden',
  'wisuda',
  'konser',
  'ramai',
  'harlah',
  'festival',
  'karnaval',
  'pawai',
  'akbar',
  'muktamar',
  'petinggi',
  'kedatangan',
  'kunjungan',
  'tokoh',
  'menteri',
  'gubernur',
  'acara',
  'rombongan',
];

const WEATHER_RAIN_KEYWORDS = ['hujan', 'gerimis', 'badai', 'ojol', 'takeaway'];

/**
 * Baseline pemakaian harian (fallback saat riwayat transaksi 7 hari masih sedikit/kosong)
 * Dikalibrasi untuk operasional warung ayam geprek area kampus Malang (UM / Matos)
 */
const BASELINE_DAILY_BURN = {
  ayam: 6.5,             // kg/hari
  minyak: 3.2,           // liter/hari
  cabai_rawit: 2.2,      // kg/hari
  beras: 9.5,            // kg/hari
  tepung: 3.8,           // kg/hari
  mozzarella: 1.4,       // kg/hari
  tahu_tempe: 22,        // pcs/hari
  telur: 2.8,            // kg/hari
  jamur: 2.2,            // kg/hari
  teh_gula: 2.6,         // kg/hari
  kemasan: 65,           // pcs/hari
  bawang: 3.0,           // kg/hari
  cabai_hijau: 1.8,      // kg/hari
  tomat: 2.4,            // kg/hari
  serai_daun_jeruk: 1.2, // kg/hari
};

/**
 * Definisi 5 skenario tren pasar mahasiswa di Malang + 1 mode normal (+ metadata mode auto)
 */
const TREND_CATALOG = {
  auto: {
    key: 'auto',
    label: 'Deteksi Otomatis (Open-Ended Gemini AI)',
    shortLabel: 'Auto AI',
    category: 'siklus_mahasiswa',
    description:
      'Gemini AI menemukan tren pasar Malang & anomali penjualan POS secara terbuka dan menghitung multiplier dinamis per bahan baku.',
    impactRange: 'Dinamis oleh AI (0.4x – 1.8x)',
    defaultMultiplier: 1.0,
    multipliers: {},
  },
  awal_semester: {
    key: 'awal_semester',
    label: 'Masa Masuk Kuliah & Awal Semester',
    shortLabel: 'Awal Semester',
    category: 'siklus_mahasiswa',
    description:
      'Mahasiswa baru & lama kembali ke Malang; lonjakan bahan utama (ayam, beras, tepung, cabai, kemasan) sekitar +35% s/d +45%.',
    impactRange: '+35% s/d +45%',
    defaultMultiplier: 1.35,
    multipliers: {
      ayam: 1.45,
      kemasan: 1.42,
      beras: 1.4,
      tepung: 1.4,
      cabai_rawit: 1.4,
      minyak: 1.38,
      bawang: 1.38,
      teh_gula: 1.36,
      cabai_hijau: 1.35,
      tomat: 1.35,
      serai_daun_jeruk: 1.35,
      mozzarella: 1.35,
      tahu_tempe: 1.35,
      telur: 1.35,
      jamur: 1.35,
    },
  },
  bulan_puasa: {
    key: 'bulan_puasa',
    label: 'Periode Bulan Puasa (Ramadan)',
    shortLabel: 'Bulan Puasa',
    category: 'event_khusus',
    description:
      'Lonjakan permintaan buka puasa & sahur; es teh/gula, kemasan takeaway, dan ayam meningkat +30% s/d +55%.',
    impactRange: '+30% s/d +55%',
    defaultMultiplier: 1.3,
    multipliers: {
      teh_gula: 1.55,
      kemasan: 1.5,
      ayam: 1.4,
      beras: 1.35,
      minyak: 1.35,
      telur: 1.35,
      tepung: 1.32,
      cabai_rawit: 1.32,
      bawang: 1.3,
      tahu_tempe: 1.3,
      mozzarella: 1.3,
      jamur: 1.3,
      cabai_hijau: 1.3,
      tomat: 1.3,
      serai_daun_jeruk: 1.3,
    },
  },
  pekan_ujian: {
    key: 'pekan_ujian',
    label: 'Pekan Ujian & Tenggat Tugas',
    shortLabel: 'Pekan Ujian',
    category: 'siklus_mahasiswa',
    description:
      'Mahasiswa fokus belajar di kos/kampus; pesanan takeaway & menu praktis naik +25% s/d +45%.',
    impactRange: '+25% s/d +45%',
    defaultMultiplier: 1.25,
    multipliers: {
      kemasan: 1.45,
      ayam: 1.35,
      teh_gula: 1.35,
      telur: 1.35,
      beras: 1.3,
      tepung: 1.3,
      cabai_rawit: 1.3,
      minyak: 1.28,
      tahu_tempe: 1.28,
      bawang: 1.25,
      cabai_hijau: 1.25,
      tomat: 1.25,
      jamur: 1.25,
      mozzarella: 1.25,
      serai_daun_jeruk: 1.25,
    },
  },
  siklus_kiriman: {
    key: 'siklus_kiriman',
    label: 'Siklus Kiriman Bulanan Mahasiswa',
    shortLabel: 'Siklus Kiriman',
    category: 'siklus_mahasiswa',
    description:
      'Deteksi otomatis tanggal: tgl 1–10 awal bulan (mozzarella & spesial naik), tgl 11–20 stabil, tgl 21–31 tanggal tua (telur, tahu/tempe & paket hemat naik).',
    impactRange: 'Dinamis sesuai tanggal',
    defaultMultiplier: 1.0,
    multipliers: {},
  },
  libur_semester: {
    key: 'libur_semester',
    label: 'Periode Libur Semester / Mudik',
    shortLabel: 'Libur Semester',
    category: 'siklus_mahasiswa',
    description:
      'Mayoritas mahasiswa pulang kampung; demand turun -45% s/d -50% untuk menekan PO bahan segar mudah rusak.',
    impactRange: '-45% s/d -50%',
    defaultMultiplier: 0.52,
    multipliers: {
      ayam: 0.5,
      jamur: 0.5,
      tahu_tempe: 0.5,
      tomat: 0.5,
      cabai_rawit: 0.5,
      cabai_hijau: 0.5,
      serai_daun_jeruk: 0.5,
      mozzarella: 0.5,
      bawang: 0.52,
      telur: 0.53,
      beras: 0.55,
      minyak: 0.55,
      tepung: 0.55,
      teh_gula: 0.55,
      kemasan: 0.55,
    },
  },
  normal: {
    key: 'normal',
    label: 'Operasional Normal (Baseline)',
    shortLabel: 'Normal',
    category: 'operasional_normal',
    description:
      'Kondisi operasional harian standar tanpa lonjakan atau penurunan musiman.',
    impactRange: '0% (Baseline)',
    defaultMultiplier: 1.0,
    multipliers: {},
  },
};

function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function round1(val) {
  return Math.round((Number(val) + Number.EPSILON) * 10) / 10;
}

/**
 * Guardrail: batasi multiplier di rentang aman [0.4, 1.8]
 */
function clampMultiplier(value, fallback = 1.0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return round2(fallback);
  return round2(Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, num)));
}

/**
 * Format rentang persentase dampak dari sekumpulan multiplier bahan baku
 */
function formatImpactRangeFromMultipliers(multiplierValues) {
  if (!Array.isArray(multiplierValues) || multiplierValues.length === 0) {
    return '0% (Baseline)';
  }
  const percents = multiplierValues.map((m) => Math.round((m - 1) * 100));
  const minPct = Math.min(...percents);
  const maxPct = Math.max(...percents);
  const fmt = (p) => (p > 0 ? `+${p}%` : `${p}%`);
  if (minPct === maxPct) return fmt(minPct);
  return `${fmt(minPct)} s/d ${fmt(maxPct)}`;
}

/**
 * Helper cache in-memory 60 detik untuk hasil sukses Gemini
 */
function getCachedGeminiResult(cacheKey) {
  const entry = geminiForecastCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    geminiForecastCache.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function setCachedGeminiResult(cacheKey, value) {
  if (geminiForecastCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of geminiForecastCache.entries()) {
      if (now > v.expiresAt) {
        geminiForecastCache.delete(k);
      }
    }
  }
  geminiForecastCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + GEMINI_CACHE_TTL_MS,
  });
}

/**
 * Pastikan tabel market_trend_settings tersedia dan terisi 1 baris awal (id=1) dengan default 'auto'
 */
async function ensureMarketTrendTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS market_trend_settings (
      id INT PRIMARY KEY DEFAULT 1,
      active_trend VARCHAR(50) DEFAULT 'auto',
      auto_detect_cycle BOOLEAN DEFAULT TRUE,
      target_safe_days INT DEFAULT 4,
      notes VARCHAR(255) DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;
  await pool.query(createTableQuery);

  await pool.query(
    `INSERT IGNORE INTO market_trend_settings (
      id, active_trend, auto_detect_cycle, target_safe_days, notes
    ) VALUES (
      1, 'auto', TRUE, 4, 'Deteksi tren pasar mahasiswa Malang secara otomatis oleh Gemini AI'
    )`
  );
}

/**
 * Petakan nama bahan baku dari tabel stocks ke kunci internal kategori bahan
 */
function resolveStockKey(stockName) {
  const name = String(stockName || '').toLowerCase();
  if (name.includes('ayam')) return 'ayam';
  if (name.includes('minyak')) return 'minyak';
  if (name.includes('cabai hijau') || name.includes('rawit hijau')) return 'cabai_hijau';
  if (name.includes('cabai') || name.includes('rawit')) return 'cabai_rawit';
  if (name.includes('beras') || name.includes('nasi')) return 'beras';
  if (name.includes('tepung')) return 'tepung';
  if (name.includes('mozzarella') || name.includes('keju')) return 'mozzarella';
  if (name.includes('tahu') || name.includes('tempe')) return 'tahu_tempe';
  if (name.includes('telur')) return 'telur';
  if (name.includes('jamur')) return 'jamur';
  if (name.includes('teh') || name.includes('gula')) return 'teh_gula';
  if (name.includes('kemasan') || name.includes('box') || name.includes('cup')) return 'kemasan';
  if (name.includes('bawang')) return 'bawang';
  if (name.includes('tomat') || name.includes('terasi')) return 'tomat';
  if (name.includes('serai') || name.includes('daun jeruk') || name.includes('jeruk')) return 'serai_daun_jeruk';
  return 'other';
}

/**
 * Konversi penjualan item menu (7 hari terakhir) ke estimasi pemakaian bahan baku (total 7 hari)
 */
function calculate7DayUsageFromSales(salesRows) {
  const usage = {};
  const addUsage = (key, amount) => {
    usage[key] = (usage[key] || 0) + amount;
  };

  for (const row of salesRows) {
    const qty = Number(row.quantity) || 0;
    if (qty <= 0) continue;

    const productName = String(row.product_name || '').toLowerCase();
    const sambal = String(row.sambal || '').toLowerCase();
    let usesSambal = false;
    let sambalFactor = 1.0;

    if (productName.includes('mozzarella')) {
      addUsage('ayam', 0.15 * qty);
      addUsage('beras', 0.12 * qty);
      addUsage('tepung', 0.04 * qty);
      addUsage('minyak', 0.04 * qty);
      addUsage('mozzarella', 0.045 * qty);
      addUsage('teh_gula', 0.03 * qty);
      addUsage('kemasan', 2 * qty);
      usesSambal = true;
    } else if (productName.includes('tanpa nasi')) {
      addUsage('ayam', 0.15 * qty);
      addUsage('tepung', 0.04 * qty);
      addUsage('minyak', 0.035 * qty);
      addUsage('kemasan', 1 * qty);
      usesSambal = true;
    } else if (productName.includes('tahu') || productName.includes('tempe')) {
      addUsage('tahu_tempe', 2 * qty);
      addUsage('tepung', 0.025 * qty);
      addUsage('minyak', 0.025 * qty);
      addUsage('kemasan', 1 * qty);
      usesSambal = true;
      sambalFactor = 0.6;
    } else if (productName.includes('telur')) {
      addUsage('telur', 0.065 * qty);
      addUsage('tepung', 0.02 * qty);
      addUsage('minyak', 0.025 * qty);
      addUsage('kemasan', 1 * qty);
      usesSambal = Boolean(sambal);
      sambalFactor = 0.5;
    } else if (productName.includes('jamur')) {
      addUsage('jamur', 0.08 * qty);
      addUsage('tepung', 0.03 * qty);
      addUsage('minyak', 0.03 * qty);
      addUsage('kemasan', 1 * qty);
      usesSambal = Boolean(sambal);
      sambalFactor = 0.5;
    } else if (productName.includes('ayam') || productName.includes('geprek')) {
      addUsage('ayam', 0.15 * qty);
      addUsage('beras', 0.12 * qty);
      addUsage('tepung', 0.035 * qty);
      addUsage('minyak', 0.035 * qty);
      if (productName.includes('teh') || productName.includes('paket')) {
        addUsage('teh_gula', 0.03 * qty);
        addUsage('kemasan', 2 * qty);
      } else {
        addUsage('kemasan', 1 * qty);
      }
      usesSambal = true;
    } else {
      addUsage('kemasan', 1 * qty);
      if (productName.includes('teh')) addUsage('teh_gula', 0.03 * qty);
      usesSambal = Boolean(sambal);
    }

    if (usesSambal) {
      if (sambal.includes('ijo') || sambal.includes('hijau')) {
        addUsage('cabai_hijau', 0.025 * qty * sambalFactor);
        addUsage('bawang', 0.012 * qty * sambalFactor);
        addUsage('minyak', 0.01 * qty * sambalFactor);
      } else if (sambal.includes('matah')) {
        addUsage('bawang', 0.02 * qty * sambalFactor);
        addUsage('cabai_rawit', 0.012 * qty * sambalFactor);
        addUsage('serai_daun_jeruk', 0.012 * qty * sambalFactor);
        addUsage('minyak', 0.01 * qty * sambalFactor);
      } else if (sambal.includes('tomat')) {
        addUsage('tomat', 0.03 * qty * sambalFactor);
        addUsage('cabai_rawit', 0.012 * qty * sambalFactor);
        addUsage('bawang', 0.01 * qty * sambalFactor);
        addUsage('minyak', 0.01 * qty * sambalFactor);
      } else {
        // Default: Sambal Bawang
        addUsage('cabai_rawit', 0.022 * qty * sambalFactor);
        addUsage('bawang', 0.015 * qty * sambalFactor);
        addUsage('minyak', 0.01 * qty * sambalFactor);
      }
    }
  }

  return usage;
}

/**
 * Deteksi fase siklus kiriman bulanan berdasarkan tanggal hari ini (1–31)
 */
function resolveSiklusKirimanConfig(dayOfMonth) {
  if (dayOfMonth <= 10) {
    return {
      subPhase: 'awal_bulan',
      subPhaseLabel: 'Awal Bulan / Baru Kiriman (Tgl 1–10)',
      subPhaseDescription:
        'Daya beli mahasiswa tinggi; permintaan menu spesial (Keju Mozzarella, Ayam Geprek Paket, Jamur Krispi) meningkat.',
      impactRange: '+15% s/d +45% (menu spesial)',
      defaultMultiplier: 1.15,
      multipliers: {
        mozzarella: 1.45,
        ayam: 1.3,
        jamur: 1.3,
        teh_gula: 1.25,
        kemasan: 1.25,
        tepung: 1.25,
        cabai_rawit: 1.25,
        cabai_hijau: 1.25,
        serai_daun_jeruk: 1.25,
        beras: 1.2,
        minyak: 1.2,
        bawang: 1.2,
        tomat: 1.2,
        tahu_tempe: 1.05,
        telur: 1.05,
      },
    };
  }

  if (dayOfMonth >= 21) {
    return {
      subPhase: 'tanggal_tua',
      subPhaseLabel: 'Tanggal Tua / Mode Hemat (Tgl 21–31)',
      subPhaseDescription:
        'Mahasiswa beralih ke lauk hemat; kebutuhan Telur, Tahu & Tempe, serta Beras meningkat, sementara menu premium turun.',
      impactRange: '+20% s/d +45% (lauk hemat)',
      defaultMultiplier: 1.05,
      multipliers: {
        telur: 1.45,
        tahu_tempe: 1.45,
        beras: 1.25,
        cabai_rawit: 1.2,
        bawang: 1.15,
        teh_gula: 1.15,
        minyak: 1.15,
        tepung: 1.15,
        kemasan: 1.1,
        tomat: 1.1,
        cabai_hijau: 1.05,
        serai_daun_jeruk: 1.0,
        ayam: 0.95,
        jamur: 0.95,
        mozzarella: 0.7,
      },
    };
  }

  return {
    subPhase: 'pertengahan_bulan',
    subPhaseLabel: 'Pertengahan Bulan / Stabil (Tgl 11–20)',
    subPhaseDescription:
      'Pola konsumsi mahasiswa berada pada ritme normal dan stabil di pertengahan bulan.',
    impactRange: '0% (Stabil)',
    defaultMultiplier: 1.0,
    multipliers: {},
  };
}

/**
 * Ambil konfigurasi pengali untuk skenario tren konkret (bukan 'auto')
 */
function resolveTrendConfig(trendKey, dayOfMonth) {
  const safeKey = SCENARIO_TRENDS.includes(trendKey) ? trendKey : 'siklus_kiriman';
  const base = TREND_CATALOG[safeKey];

  if (safeKey === 'siklus_kiriman') {
    const cycle = resolveSiklusKirimanConfig(dayOfMonth);
    return {
      ...base,
      impactRange: cycle.impactRange,
      defaultMultiplier: cycle.defaultMultiplier,
      multipliers: cycle.multipliers,
      cycleInfo: {
        dayOfMonth,
        subPhase: cycle.subPhase,
        subPhaseLabel: cycle.subPhaseLabel,
        subPhaseDescription: cycle.subPhaseDescription,
      },
    };
  }

  return {
    ...base,
    cycleInfo: null,
  };
}

/**
 * Resolusi fallback rule-engine yang responsif terhadap kata kunci acara besar / hujan pada customContext
 */
function resolveOfflineFallbackTrendConfig(dayOfMonth, customContext) {
  const baseKiriman = resolveTrendConfig('siklus_kiriman', dayOfMonth);
  if (!customContext) {
    return {
      trendConfig: baseKiriman,
      detectedEventMode: null,
    };
  }

  const lowerCtx = customContext.toLowerCase();
  const matchedMajorEvent = MAJOR_EVENT_KEYWORDS.some((kw) => lowerCtx.includes(kw));
  if (matchedMajorEvent) {
    const shortTitle =
      customContext.length > 52 ? `${customContext.slice(0, 52).trim()}...` : customContext;
    return {
      detectedEventMode: 'major_event',
      trendConfig: {
        key: 'event_khusus_fallback',
        label: `Lonjakan Event Besar: ${shortTitle}`,
        shortLabel: 'Event Besar',
        category: 'event_khusus',
        description: `Lonjakan keramaian massa/peserta acara di Malang berdasarkan catatan lapangan ("${customContext}"), meningkatkan kebutuhan bahan utama +30% s/d +45%.`,
        impactRange: '+30% s/d +45%',
        defaultMultiplier: 1.32,
        multipliers: {
          ayam: 1.45,
          kemasan: 1.45,
          teh_gula: 1.42,
          beras: 1.4,
          minyak: 1.38,
          tepung: 1.38,
          cabai_rawit: 1.38,
          bawang: 1.35,
          tahu_tempe: 1.32,
          telur: 1.32,
          cabai_hijau: 1.3,
          tomat: 1.3,
          jamur: 1.3,
          mozzarella: 1.3,
          serai_daun_jeruk: 1.3,
        },
        cycleInfo: baseKiriman.cycleInfo,
      },
    };
  }

  const matchedWeather = WEATHER_RAIN_KEYWORDS.some((kw) => lowerCtx.includes(kw));
  if (matchedWeather) {
    const shortTitle =
      customContext.length > 52 ? `${customContext.slice(0, 52).trim()}...` : customContext;
    return {
      detectedEventMode: 'weather',
      trendConfig: {
        key: 'cuaca_fallback',
        label: `Kondisi Cuaca / Takeaway: ${shortTitle}`,
        shortLabel: 'Cuaca / Ojol',
        category: 'musiman_cuaca',
        description: `Penyesuaian permintaan takeaway & ojol akibat kondisi lapangan ("${customContext}").`,
        impactRange: '+15% s/d +35%',
        defaultMultiplier: 1.15,
        multipliers: {
          kemasan: 1.35,
          ayam: 1.25,
          beras: 1.2,
          teh_gula: 1.2,
          minyak: 1.2,
          tepung: 1.2,
          cabai_rawit: 1.25,
          bawang: 1.2,
          telur: 1.2,
          tahu_tempe: 1.15,
          jamur: 1.15,
          mozzarella: 1.15,
          cabai_hijau: 1.15,
          tomat: 1.15,
          serai_daun_jeruk: 1.15,
        },
        cycleInfo: baseKiriman.cycleInfo,
      },
    };
  }

  return {
    trendConfig: baseKiriman,
    detectedEventMode: null,
  };
}

/**
 * Ekstrak komponen tanggal eksplisit sesuai zona waktu WIB (Asia/Jakarta)
 */
function getWibDateParts(now = new Date()) {
  const wibParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(now);

  const partMap = {};
  for (const p of wibParts) {
    partMap[p.type] = p.value;
  }

  const weekdayToIndo = {
    Sun: 'Minggu',
    Mon: 'Senin',
    Tue: 'Selasa',
    Wed: 'Rabu',
    Thu: 'Kamis',
    Fri: 'Jumat',
    Sat: 'Sabtu',
  };

  const year = Number(partMap.year);
  const monthNumber = Number(partMap.month);
  const dayOfMonth = Number(partMap.day);
  const dayName = weekdayToIndo[partMap.weekday] || partMap.weekday || 'Hari ini';

  return { year, monthNumber, dayOfMonth, dayName };
}

/**
 * Bangun konteks tanggal lengkap hari ini (WIB / Asia/Jakarta), fase siklus kiriman, & perkiraan kalender Hijriah/Ramadhan
 */
function buildCalendarContext(now) {
  const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  const { year, monthNumber, dayOfMonth, dayName } = getWibDateParts(now);
  const monthName = monthNames[monthNumber - 1] || '';
  const isoDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
  const formattedDate = `${dayName}, ${dayOfMonth} ${monthName} ${year}`;
  const kiriman = resolveSiklusKirimanConfig(dayOfMonth);

  let hijriDate = 'Tidak tersedia';
  let hijriMonthName = '';
  let isRamadanPeriod = false;

  try {
    const formatter = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    hijriDate = formatter.format(now);
    const parts = formatter.formatToParts(now);
    const monthPart = parts.find((p) => p.type === 'month');
    const dayPart = parts.find((p) => p.type === 'day');
    hijriMonthName = monthPart ? monthPart.value : '';
    const hijriDay = dayPart ? Number(dayPart.value) : 0;
    const normalizedHijriMonth = hijriMonthName.toLowerCase();
    isRamadanPeriod =
      normalizedHijriMonth.includes('ramad') ||
      ((normalizedHijriMonth.includes('syaban') ||
        normalizedHijriMonth.includes('sya’ban') ||
        normalizedHijriMonth.includes("sya'ban")) &&
        hijriDay >= 25);
  } catch (e) {
    try {
      hijriDate = new Intl.DateTimeFormat('en-US-u-ca-islamic', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now);
      isRamadanPeriod = hijriDate.toLowerCase().includes('ramad');
    } catch (_) {
      hijriDate = 'Perkiraan kalender Hijriah tidak tersedia';
    }
  }

  return {
    dayName,
    dayOfMonth,
    monthNumber,
    monthName,
    year,
    isoDate,
    formattedDate,
    kirimanPhase: kiriman.subPhase,
    kirimanPhaseLabel: kiriman.subPhaseLabel,
    hijriDate,
    hijriMonthName,
    isRamadanPeriod,
  };
}

/**
 * Normalisasi & batasi (clamp [0.4, 1.8]) object map ingredientMultipliers hasil Gemini
 * agar cocok dengan seluruh bahan baku pada tabel stocks
 */
function sanitizeDynamicMultipliers(rawMultipliers, stockRows, fallbackTrendConfig) {
  const normalizedInput = {};
  if (rawMultipliers && typeof rawMultipliers === 'object' && !Array.isArray(rawMultipliers)) {
    for (const [k, v] of Object.entries(rawMultipliers)) {
      const cleanKey = String(k || '').trim().toLowerCase();
      if (cleanKey) {
        normalizedInput[cleanKey] = v;
      }
    }
  }

  const clampedMap = {};
  for (const s of stockRows) {
    const lowerName = String(s.name || '').trim().toLowerCase();
    const stockKey = resolveStockKey(s.name);
    const fallbackMult =
      fallbackTrendConfig && fallbackTrendConfig.multipliers[stockKey] !== undefined
        ? fallbackTrendConfig.multipliers[stockKey]
        : fallbackTrendConfig
          ? fallbackTrendConfig.defaultMultiplier
          : 1.0;

    let rawVal;
    if (normalizedInput[lowerName] !== undefined) {
      rawVal = normalizedInput[lowerName];
    } else if (normalizedInput[stockKey] !== undefined) {
      rawVal = normalizedInput[stockKey];
    } else {
      const partialKey = Object.keys(normalizedInput).find(
        (k) => lowerName.includes(k) || k.includes(lowerName)
      );
      if (partialKey !== undefined) {
        rawVal = normalizedInput[partialKey];
      }
    }

    clampedMap[lowerName] = clampMultiplier(
      rawVal !== undefined ? rawVal : fallbackMult,
      fallbackMult
    );
  }

  return clampedMap;
}

/**
 * Bangun map ingredientMultipliers dari rule-engine (untuk mode manual & fallback)
 */
function buildRuleMultipliersMap(stockRows, trendConfig) {
  const map = {};
  for (const s of stockRows) {
    const lowerName = String(s.name || '').trim().toLowerCase();
    const stockKey = resolveStockKey(s.name);
    const mult =
      trendConfig.multipliers[stockKey] !== undefined
        ? trendConfig.multipliers[stockKey]
        : trendConfig.defaultMultiplier;
    map[lowerName] = clampMultiplier(mult, 1.0);
  }
  return map;
}

/**
 * Hitung daftar proyeksi stok per bahan baku menggunakan trendConfig dan/atau dynamicMultipliersByName
 */
function computeForecastItems({
  stockRows,
  usage7dByKey,
  salesWeight,
  trendConfig,
  dynamicMultipliersByName = null,
  targetSafeDays,
}) {
  const items = stockRows.map((s) => {
    const currentStock = Number(s.stock) || 0;
    const minStock = Number(s.min_stock) || 0;
    const unit = s.unit || 'kg';
    const lowerName = String(s.name || '').trim().toLowerCase();
    const stockKey = resolveStockKey(s.name);

    const fallbackBaseline =
      BASELINE_DAILY_BURN[stockKey] !== undefined
        ? BASELINE_DAILY_BURN[stockKey]
        : Math.max(round2(minStock / 3), 0.5);

    const rawSalesDailyBurn = (usage7dByKey[stockKey] || 0) / 7;

    let baseDailyBurn;
    let burnSource;
    if (rawSalesDailyBurn <= 0) {
      baseDailyBurn = fallbackBaseline;
      burnSource = 'baseline_fallback';
    } else if (salesWeight >= 1) {
      baseDailyBurn = rawSalesDailyBurn;
      burnSource = 'sales_7d';
    } else {
      baseDailyBurn = rawSalesDailyBurn * salesWeight + fallbackBaseline * (1 - salesWeight);
      burnSource = 'blended';
    }

    let rawTrendMultiplier;
    if (
      dynamicMultipliersByName &&
      dynamicMultipliersByName[lowerName] !== undefined
    ) {
      rawTrendMultiplier = dynamicMultipliersByName[lowerName];
    } else if (trendConfig.multipliers[stockKey] !== undefined) {
      rawTrendMultiplier = trendConfig.multipliers[stockKey];
    } else {
      rawTrendMultiplier = trendConfig.defaultMultiplier;
    }

    const trendMultiplier = clampMultiplier(rawTrendMultiplier, 1.0);
    const projectedDailyBurn = Math.max(round2(baseDailyBurn * trendMultiplier), 0.01);
    const estimatedDaysLeft = round1(currentStock / projectedDailyBurn);
    const isUrgentUnder2Days = estimatedDaysLeft < 2;

    const targetStockForSafeDays = round2(projectedDailyBurn * targetSafeDays);
    const rawSuggestedPo = Math.max(0, targetStockForSafeDays - currentStock);
    const isIntUnit = INTEGER_UNITS.has(unit.trim().toLowerCase());
    const suggestedPoQty =
      rawSuggestedPo <= 0
        ? 0
        : isIntUnit
          ? Math.ceil(rawSuggestedPo)
          : Math.ceil(Number((rawSuggestedPo * 10).toFixed(6))) / 10;

    let urgencyLevel = 'AMAN';
    let poReason = `Stok aman untuk estimasi ${estimatedDaysLeft} hari ke depan.`;
    if (isUrgentUnder2Days) {
      urgencyLevel = 'KRITIS';
      poReason = `Urgent! Stok diperkirakan habis dalam ${estimatedDaysLeft} hari (< 2 hari). Segera lakukan PO ${suggestedPoQty} ${unit}.`;
    } else if (suggestedPoQty > 0) {
      urgencyLevel = 'WASPADA';
      poReason = `Stok cukup untuk ${estimatedDaysLeft} hari. Disarankan PO ${suggestedPoQty} ${unit} agar aman hingga ${targetSafeDays} hari.`;
    }

    return {
      id: String(s.id),
      name: s.name,
      unit,
      stockKey,
      currentStock,
      minStock,
      stockStatus: s.status,
      baselineDailyBurn: round2(fallbackBaseline),
      salesDailyBurn: round2(rawSalesDailyBurn),
      burnSource,
      trendMultiplier,
      trendImpactPercent: Math.round((trendMultiplier - 1) * 100),
      projectedDailyBurn,
      estimatedDaysLeft,
      isUrgentUnder2Days,
      urgencyLevel,
      targetStockForSafeDays,
      suggestedPoQty,
      poReason,
    };
  });

  // Urutkan dari estimatedDaysLeft paling cepat habis di urutan teratas
  items.sort((a, b) => {
    if (a.estimatedDaysLeft !== b.estimatedDaysLeft) {
      return a.estimatedDaysLeft - b.estimatedDaysLeft;
    }
    return b.suggestedPoQty - a.suggestedPoQty;
  });

  return items;
}

/**
 * Bangun insight fallback berbasis rule-engine jika Gemini API tidak tersedia / gagal
 */
function buildRuleFallbackInsight({
  items,
  trendConfig,
  ingredientMultipliers,
  targetSafeDays,
  dayOfMonth,
  isAutoMode,
  customContext,
  detectedEventMode = null,
}) {
  const urgentItems = items.filter((i) => i.isUrgentUnder2Days);
  const tightestItems = urgentItems.length > 0 ? urgentItems.slice(0, 3) : items.slice(0, 3);
  const abundantItems = [...items]
    .sort((a, b) => b.estimatedDaysLeft - a.estimatedDaysLeft)
    .slice(0, 3);

  const tightestNames = tightestItems.map((i) => i.name).join(', ') || 'bahan baku utama';
  const abundantNames = abundantItems.map((i) => i.name).join(', ') || 'stok bahan tersedia';
  const trendLabel =
    detectedEventMode === 'major_event' || detectedEventMode === 'weather'
      ? trendConfig.label
      : trendConfig.cycleInfo
        ? `${trendConfig.label} (${trendConfig.cycleInfo.subPhaseLabel})`
        : trendConfig.label;

  let kitchenStrategy;
  if (detectedEventMode === 'major_event') {
    kitchenStrategy = `Mengantisipasi acara besar "${customContext}" di Malang, lonjakan pengunjung dan pesanan takeaway diproyeksikan naik +30% s/d +45%. Dapur PrekDuaDara perlu mempercepat prep bahan utama (${tightestNames}) dan menambah stok kemasan serta minuman agar layanan tetap lancar hingga target aman ${targetSafeDays} hari.`;
  } else if (detectedEventMode === 'weather') {
    kitchenStrategy = `Menyesuaikan kondisi lapangan "${customContext}", pesanan ojol dan takeaway diperkirakan meningkat signifikan. Prioritaskan kesiapan ${tightestNames} serta stok kemasan takeaway agar tidak menghambat pesanan selama jam ramai.`;
  } else if (trendConfig.key === 'libur_semester') {
    kitchenStrategy = `Saat ${trendLabel}, trafik mahasiswa Malang menurun signifikan sehingga dapur perlu mengerem belanja bahan segar mudah rusak dan menjaga perputaran stok tetap ramping. Fokuskan pemantauan pada ${tightestNames} dengan target aman ${targetSafeDays} hari agar tidak terjadi food waste maupun kekosongan mendadak.`;
  } else {
    kitchenStrategy = `Pada fase ${trendLabel}, permintaan dapur PrekDuaDara perlu mengantisipasi laju pemakaian lebih tinggi khususnya pada ${tightestNames}. Pastikan persiapan prep harian dan pengadaan bahan dilakukan lebih awal agar ketahanan stok terjaga minimal ${targetSafeDays} hari tanpa mengganggu kecepatan layanan kasir.`;
  }

  if (customContext && detectedEventMode !== 'major_event' && detectedEventMode !== 'weather') {
    kitchenStrategy += ` Perhatikan juga catatan lapangan "${customContext}" untuk penyesuaian shift prep dan ketersediaan kemasan.`;
  }

  let promoSuggestion;
  if (detectedEventMode === 'major_event') {
    promoSuggestion = `Siapkan paket nasi box / bundling cepat saji (Ayam Geprek + Es Teh + lauk pendamping dari stok aman ${abundantNames}) untuk menjaring rombongan peserta dan tamu acara "${customContext}".`;
  } else if (detectedEventMode === 'weather') {
    promoSuggestion = `Tawarkan paket bundling Takeaway / Ojol Hemat dengan tambahan lauk dari stok aman (${abundantNames}) agar nilai transaksi per pesanan meningkat saat cuaca kurang bersahabat.`;
  } else if (trendConfig.key === 'bulan_puasa') {
    promoSuggestion = `Tawarkan paket bundling Buka Puasa & Sahur (Ayam Geprek + Es Teh + lauk tambahan) untuk mempercepat perputaran stok ${abundantNames} saat jam puncak magrib dan dini hari.`;
  } else if (trendConfig.key === 'pekan_ujian') {
    promoSuggestion = `Jalankan promo Paket Begadang / Takeaway Praktis bagi mahasiswa kos dengan bonus topping dari stok melimpah (${abundantNames}) agar nilai transaksi per struk meningkat.`;
  } else if (trendConfig.key === 'siklus_kiriman' && trendConfig.cycleInfo?.subPhase === 'tanggal_tua') {
    promoSuggestion = `Tonjolkan promo Paket Hemat Tanggal Tua (Telur Krispi / Tahu & Tempe Geprek + nasi) sambil mengoptimalkan bahan berstok aman seperti ${abundantNames}.`;
  } else if (trendConfig.key === 'siklus_kiriman' && trendConfig.cycleInfo?.subPhase === 'awal_bulan') {
    promoSuggestion = `Dorong upselling Ayam Geprek Mozzarella + Es Teh dan paket combo lauk tambahan untuk memanfaatkan daya beli awal bulan (tgl ${dayOfMonth}) serta menjaga rotasi stok ${abundantNames}.`;
  } else if (trendConfig.key === 'libur_semester') {
    promoSuggestion = `Buat promo bundling hemat untuk pelanggan lokal & ojol guna mempercepat serapan bahan berstok melimpah (${abundantNames}) selama masa libur kuliah.`;
  } else {
    promoSuggestion = `Hadirkan bundling paket rame-rame mahasiswa (Ayam Geprek + Jamur/Telur Krispi + Es Teh) untuk memaksimalkan perputaran stok yang masih melimpah seperti ${abundantNames}.`;
  }

  if (customContext && detectedEventMode !== 'major_event' && detectedEventMode !== 'weather') {
    promoSuggestion += ` Sesuaikan tema promo dengan kondisi lapangan "${customContext}".`;
  }

  let urgentAnalysis;
  if (urgentItems.length > 0) {
    const urgentDetail = urgentItems
      .slice(0, 4)
      .map((i) => `${i.name} (sisa ${i.estimatedDaysLeft} hari, PO ${i.suggestedPoQty} ${i.unit})`)
      .join('; ');
    urgentAnalysis = `Bahan kritis < 2 hari seperti ${urgentDetail} wajib diprioritaskan pada PO hari ini karena berisiko habis sebelum pengiriman berikutnya dan dapat menghentikan menu utama PrekDuaDara di jam ramai.`;
  } else {
    const topWatch = items
      .slice(0, 2)
      .map((i) => `${i.name} (${i.estimatedDaysLeft} hari)`)
      .join(' dan ');
    urgentAnalysis = `Saat ini belum ada bahan yang diperkirakan habis di bawah 2 hari, namun ${topWatch || 'bahan dengan ketahanan terendah'} tetap perlu diprioritaskan dalam jadwal PO berikutnya agar stok aman hingga ${targetSafeDays} hari.`;
  }

  const detectedTrendLabel = isAutoMode
    ? detectedEventMode === 'major_event' || detectedEventMode === 'weather'
      ? trendConfig.label
      : trendConfig.cycleInfo
        ? `Deteksi Kalender: ${trendConfig.cycleInfo.subPhaseLabel}`
        : `Deteksi Kalender: ${trendConfig.label}`
    : trendConfig.label;

  let detectionReason;
  if (isAutoMode && detectedEventMode === 'major_event') {
    detectionReason = `Simulasi lokal mendeteksi kata kunci acara besar pada catatan lapangan ("${customContext}"), sehingga multiplier bahan utama dinaikkan +30% s/d +45% untuk antisipasi lonjakan massa.`;
  } else if (isAutoMode && detectedEventMode === 'weather') {
    detectionReason = `Simulasi lokal mendeteksi kondisi cuaca/takeaway pada catatan lapangan ("${customContext}"), sehingga multiplier kemasan dan bahan utama disesuaikan naik.`;
  } else if (isAutoMode) {
    const customNoteSuffix = customContext
      ? ` Catatan lapangan diterima: "${customContext}".`
      : '';
    detectionReason = trendConfig.cycleInfo
      ? `Mode fallback kalender lokal (tanggal ${dayOfMonth}): ${trendConfig.cycleInfo.subPhaseDescription}${customNoteSuffix}`
      : `Mode fallback otomatis menggunakan skenario ${trendConfig.label}.${customNoteSuffix}`;
  } else {
    detectionReason = customContext
      ? `Mode simulasi manual (${trendConfig.label}) dengan catatan lapangan: "${customContext}".`
      : `Mode simulasi / pilihan manual: ${trendConfig.label}.`;
  }

  const trendCategory = VALID_TREND_CATEGORIES.includes(trendConfig.category)
    ? trendConfig.category
    : 'siklus_mahasiswa';

  return {
    detectedTrendKey: trendConfig.key,
    detectedTrendLabel,
    trendCategory,
    detectionReason,
    ingredientMultipliers,
    kitchenStrategy,
    promoSuggestion,
    urgentAnalysis,
  };
}

/**
 * Bersihkan pembungkus markdown ```json ... ``` atau teks di luar JSON sebelum JSON.parse
 */
function parseGeminiJsonText(rawText) {
  let cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw firstErr;
  }
}

/**
 * Format pesan ringkas penyebab fallback Gemini API agar transparan ke frontend
 */
function formatGeminiErrorReason(status, errorBodyText) {
  let detailMsg = '';
  try {
    const parsedErr = JSON.parse(errorBodyText);
    if (parsedErr?.error?.message) {
      detailMsg = String(parsedErr.error.message).slice(0, 140);
    }
  } catch (_) {
    detailMsg = String(errorBodyText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  if (status === 429) {
    const rawLower = String(errorBodyText || '').toLowerCase();
    if (rawLower.includes('per day') || rawLower.includes('perday') || rawLower.includes('daily')) {
      return 'Gemini API Error 429: Kuota harian Free Tier penuh';
    }
    return 'Gemini API Error 429: Kuota request per menit penuh';
  }
  if (status === 400) {
    return `Gemini API Error 400: Permintaan atau API key tidak valid${detailMsg ? ` (${detailMsg})` : ''}`;
  }
  if (status === 401 || status === 403) {
    return `Gemini API Error ${status}: API key ditolak atau tidak memiliki izin`;
  }
  if (status === 404) {
    return `Gemini API Error 404: Model tidak tersedia untuk API key ini${detailMsg ? ` (${detailMsg})` : ''}`;
  }
  if (status === 503) {
    return 'Gemini API Error 503: Server Gemini sedang sibuk sementara';
  }
  return `Gemini API Error ${status}${detailMsg ? `: ${detailMsg}` : ''}`;
}

/**
 * Helper low-level untuk merotasi 3 model aktif Google Gemini (v1beta)
 * Urutan: gemini-2.5-flash-lite -> gemini-2.5-flash -> gemini-2.5-pro
 * Dilengkapi AbortSignal.timeout(9500), thinkingConfig optimal, & cooldown 5 menit jika semua 429
 * Mengembalikan { ok, parsed, activeModel, fallbackReason, cooldownActive }
 */
async function callGeminiStructuredJson({ prompt, forceRefresh = false }) {
  const apiKey = process.env.GEMINI_API_KEY ? String(process.env.GEMINI_API_KEY).trim() : '';
  if (!apiKey) {
    console.error('❌ [Gemini Forecast] GEMINI_API_KEY belum terbaca di server backend (.env).');
    return {
      ok: false,
      parsed: null,
      activeModel: null,
      fallbackReason: 'GEMINI_API_KEY belum terbaca di server backend (.env)',
      cooldownActive: false,
    };
  }

  // Cooldown 5 menit anti-delay (< 50ms) jika sebelumnya semua model kena 429, kecuali ?force=1
  const nowMs = Date.now();
  if (!forceRefresh && nowMs < geminiRateLimitedUntil) {
    const remainingSec = Math.ceil((geminiRateLimitedUntil - nowMs) / 1000);
    return {
      ok: false,
      parsed: null,
      activeModel: null,
      fallbackReason: `${geminiRateLimitReason || 'Gemini API Error 429: Kuota limit tercapai'} (cooldown otomatis ${remainingSec} detik, kirim ?force=1 untuk coba ulang)`,
      cooldownActive: true,
    };
  }

  const candidateModels =
    process.env.GEMINI_MODEL && String(process.env.GEMINI_MODEL).trim()
      ? Array.from(new Set([String(process.env.GEMINI_MODEL).trim(), ...GEMINI_ENGINE_LINEUP])).slice(0, 3)
      : [...GEMINI_ENGINE_LINEUP];

  const modelErrors = [];
  let rateLimitedCount = 0;

  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const buildRequestBody = (includeThinkingConfig) => {
      const generationConfig = {
        responseMimeType: 'application/json',
        temperature: 0.4,
      };
      if (includeThinkingConfig) {
        generationConfig.thinkingConfig = {
          thinkingBudget: modelName.includes('pro') ? 256 : 0,
        };
      }
      return JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
      });
    };

    try {
      let response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(9500),
        body: buildRequestBody(true),
      });

      if (!response.ok) {
        let errorBodyText = await response.text();

        // Jika HTTP 400 menyebut thinkingConfig / thinking_budget, otomatis retry sekali tanpa thinkingConfig
        if (
          response.status === 400 &&
          /thinkingconfig|thinking_budget|thinkingbudget/i.test(errorBodyText)
        ) {
          console.warn(
            `⚠️  [Gemini Forecast] Model '${modelName}' menolak thinkingConfig (HTTP 400), mengulang tanpa thinkingConfig...`
          );
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(9500),
            body: buildRequestBody(false),
          });
          if (!response.ok) {
            errorBodyText = await response.text();
          }
        }

        if (!response.ok) {
          const shortReason = formatGeminiErrorReason(response.status, errorBodyText);
          modelErrors.push(`${modelName}: HTTP ${response.status}`);
          console.error(
            `❌ [Gemini Forecast] Model '${modelName}' gagal (HTTP ${response.status}):`,
            errorBodyText
          );

          if (response.status === 429) {
            rateLimitedCount++;
            continue;
          }

          // Jika 404 (tidak tersedia di key) atau 503 (server sibuk), langsung lanjut ke model berikutnya
          if (response.status === 404 || response.status === 503) {
            continue;
          }

          // Untuk 400/401/403 (misal API key invalid/ditolak), langsung hentikan rotasi
          return {
            ok: false,
            parsed: null,
            activeModel: null,
            fallbackReason: `${shortReason} [${modelErrors.join(' | ')}]`,
            cooldownActive: false,
          };
        }
      }

      const payload = await response.json();
      const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText || typeof rawText !== 'string') {
        modelErrors.push(`${modelName}: respons kosong`);
        console.error(
          `❌ [Gemini Forecast] Model '${modelName}' mengembalikan respons kosong:`,
          JSON.stringify(payload)
        );
        continue;
      }

      const parsed = parseGeminiJsonText(rawText);

      // Reset cooldown begitu salah satu model berhasil merespons
      geminiRateLimitedUntil = 0;
      geminiRateLimitReason = null;

      return {
        ok: true,
        parsed,
        activeModel: modelName,
        fallbackReason: null,
        cooldownActive: false,
      };
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      const errLabel = isTimeout ? 'timeout 9.5s' : err.message;
      modelErrors.push(`${modelName}: ${errLabel}`);
      console.error(`❌ [Gemini Forecast] Error saat memanggil '${modelName}':`, err);
      continue;
    }
  }

  // Jika seluruh model yang dicoba mengembalikan 429, aktifkan cooldown 5 menit
  if (candidateModels.length > 0 && rateLimitedCount === candidateModels.length) {
    geminiRateLimitedUntil = Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS;
    geminiRateLimitReason = `Gemini API Error 429: Semua model mencapai batas kuota [${modelErrors.join(' | ')}]`;
    return {
      ok: false,
      parsed: null,
      activeModel: null,
      fallbackReason: `${geminiRateLimitReason} (cooldown lokal 5 menit diaktifkan)`,
      cooldownActive: true,
    };
  }

  return {
    ok: false,
    parsed: null,
    activeModel: null,
    fallbackReason: `Semua engine Gemini gagal [${modelErrors.join(' | ')}]`,
    cooldownActive: false,
  };
}

/**
 * Mode AUTO (Open-Ended Trend Discovery):
 * Gemini AI menemukan tren pasar Malang + anomali POS + catatan lapangan (?customContext)
 * dan menghasilkan dynamic ingredientMultipliers untuk setiap bahan baku
 */
async function discoverOpenEndedTrendWithGemini({
  calendarContext,
  salesSignals,
  stockRows,
  baselinePreviewItems,
  targetSafeDays,
  customContext,
  forceRefresh = false,
}) {
  const ingredientKeysList = stockRows.map((s) =>
    String(s.name || '').trim().toLowerCase()
  );

  const promptPayload = {
    restaurant: 'Ayam Geprek PrekDuaDara (dekat gerbang UM & Matos, Malang)',
    menus: [
      'Ayam Geprek Bakar + Es Teh',
      'Ayam Geprek Biasa + Es Teh',
      'Ayam Geprek Mozzarella + Es Teh',
      'Ayam Geprek (Tanpa Nasi)',
      'Tahu & Tempe Geprek',
      'Telur Krispi',
      'Jamur Krispi',
    ],
    sambalVariants: ['Sambal Bawang', 'Sambal Matah', 'Sambal Tomat', 'Sambal Ijo'],
    today: calendarContext,
    priorityCustomContextFromUser: customContext || null,
    salesVelocityAndTopMenus: salesSignals,
    targetSafeDays,
    actualStocks: baselinePreviewItems.map((i) => ({
      name: i.name,
      lowercaseKey: i.name.toLowerCase(),
      currentStock: i.currentStock,
      minStock: i.minStock,
      unit: i.unit,
      baselineDailyBurn: i.projectedDailyBurn,
      estimatedDaysLeftNormal: i.estimatedDaysLeft,
    })),
  };

  const customContextDirective = customContext
    ? [
        `>>> FOKUS UTAMA MUTLAK (OVERWRITE TEMPLATE KALENDER): User melaporkan kejadian/kondisi lapangan khusus: "${customContext}".`,
        '- JANGAN memakai template kalender standar (seperti sekadar "Tanggal Tua" atau "Awal Semester") jika tidak relevan dengan kejadian ini.',
        '- Anda WAJIB merombak secara menyeluruh: "detectedTrendLabel", "trendCategory", "detectionReason", "ingredientMultipliers", "kitchenStrategy", dan "promoSuggestion" berdasarkan dampak nyata kejadian tersebut terhadap keramaian massa, pengamanan/pengalihan arus lalu lintas, tamu/rombongan, maupun permintaan makanan, minuman, dan kemasan takeaway di Malang.',
        '- Isi "detectedTrendLabel" secara spesifik menyebut kejadian/konteks tersebut, dan pilih "trendCategory" yang paling tepat (misal "event_khusus" untuk kunjungan tokoh/acara akbar, "musiman_cuaca" untuk cuaca).',
        '- Sesuaikan setiap angka "ingredientMultipliers" (0.4 s/d 1.8) secara realistis terhadap skenario kejadian tersebut.',
      ].join('\n')
    : '- Tidak ada catatan lapangan khusus dari user; analisis secara terbuka gabungan tanggal/kalender akademik kampus Malang, cuaca musiman, siklus kiriman mahasiswa, dan anomali velocity transaksi POS.';

  const prompt = [
    'Anda adalah AI analis pasar F&B Malang & konsultan supply chain dapur untuk warung Ayam Geprek PrekDuaDara (area kampus UM / UB / Polinema / Matos).',
    'Lakukan Open-Ended Trend Discovery secara mandiri (JANGAN membatasi diri hanya pada 5 tren kaku).',
    customContextDirective,
    '',
    'Balas HANYA dengan 1 objek JSON valid (tanpa teks tambahan di luar JSON) mengikuti struktur persis berikut:',
    '{',
    '  "detectedTrendLabel": "string judul tren spesifik sesuai konteks/event atau temuan data",',
    `  "trendCategory": "pilih tepat satu: ${VALID_TREND_CATEGORIES.join(' | ')}",`,
    '  "detectionReason": "1-2 kalimat berbasis tanggal, velocity transaksi (3 hari vs 14 hari), top menu, dan/atau catatan lapangan",',
    `  "ingredientMultipliers": { /* WAJIB isi angka 0.4 s/d 1.8 untuk setiap kunci berikut: ${ingredientKeysList.map((k) => `"${k}"`).join(', ')} */ },`,
    '  "kitchenStrategy": "2-3 kalimat padat Bahasa Indonesia tentang strategi operasional dapur menyebut bahan kritis dan kondisi/event saat ini",',
    '  "promoSuggestion": "1-2 kalimat ide bundling/promo menu PrekDuaDara yang relevan dengan konteks/event dan stok melimpah",',
    '  "urgentAnalysis": "1-2 kalimat mengapa bahan baku yang habis < 2 hari harus diprioritaskan pada PO hari ini"',
    '}',
    '',
    'DATA SINYAL RIIL:',
    JSON.stringify(promptPayload),
  ].join('\n');

  return callGeminiStructuredJson({ prompt, forceRefresh });
}

/**
 * Mode MANUAL / SIMULASI: Gemini AI memberikan insight untuk skenario tren yang dipilih manual
 */
async function generateManualModeGeminiInsight({
  items,
  trendConfig,
  ingredientMultipliers,
  calendarContext,
  salesSignals,
  targetSafeDays,
  customContext,
  forceRefresh = false,
}) {
  const fallback = buildRuleFallbackInsight({
    items,
    trendConfig,
    ingredientMultipliers,
    targetSafeDays,
    dayOfMonth: calendarContext.dayOfMonth,
    isAutoMode: false,
    customContext,
  });

  const urgentItems = items.filter((i) => i.isUrgentUnder2Days);
  const abundantItems = [...items]
    .sort((a, b) => b.estimatedDaysLeft - a.estimatedDaysLeft)
    .slice(0, 4);

  const quantitativePayload = {
    restaurant: 'Ayam Geprek PrekDuaDara (area kampus UM / Matos, Malang)',
    menus: [
      'Ayam Geprek Bakar + Es Teh',
      'Ayam Geprek Biasa + Es Teh',
      'Ayam Geprek Mozzarella + Es Teh',
      'Ayam Geprek (Tanpa Nasi)',
      'Tahu & Tempe Geprek',
      'Telur Krispi',
      'Jamur Krispi',
    ],
    sambalVariants: ['Sambal Bawang', 'Sambal Matah', 'Sambal Tomat', 'Sambal Ijo'],
    today: calendarContext,
    priorityCustomContextFromUser: customContext || null,
    salesVelocityAndTopMenus: salesSignals,
    activeTrend: {
      key: trendConfig.key,
      label: trendConfig.label,
      description: trendConfig.description,
      impactRange: trendConfig.impactRange,
      cycleInfo: trendConfig.cycleInfo,
    },
    targetSafeDays,
    urgentUnder2Days: urgentItems.map((i) => ({
      name: i.name,
      currentStock: i.currentStock,
      unit: i.unit,
      projectedDailyBurn: i.projectedDailyBurn,
      estimatedDaysLeft: i.estimatedDaysLeft,
      suggestedPoQty: i.suggestedPoQty,
    })),
    abundantStocks: abundantItems.map((i) => ({
      name: i.name,
      currentStock: i.currentStock,
      unit: i.unit,
      estimatedDaysLeft: i.estimatedDaysLeft,
    })),
    allStocksSortedByUrgency: items.map((i) => ({
      name: i.name,
      currentStock: i.currentStock,
      unit: i.unit,
      projectedDailyBurn: i.projectedDailyBurn,
      estimatedDaysLeft: i.estimatedDaysLeft,
      isUrgentUnder2Days: i.isUrgentUnder2Days,
      suggestedPoQty: i.suggestedPoQty,
    })),
  };

  const prompt = [
    'Anda adalah konsultan operasional dapur & supply chain senior untuk warung Ayam Geprek PrekDuaDara di sekitar kampus Malang (UM/Matos).',
    'Berdasarkan data kuantitatif stok, velocity penjualan, dan skenario tren pasar yang dipilih berikut, berikan analisis singkat, tajam, dan aplikatif dalam Bahasa Indonesia.',
    customContext
      ? `FOKUS TAMBAHAN PENTING — Catatan lapangan user: "${customContext}". Bahas secara eksplisit dampaknya pada strategi dapur dan ide promo.`
      : '',
    'Balas HANYA dengan 1 objek JSON valid dengan tepat 3 properti string:',
    '{',
    '  "kitchenStrategy": "2-3 kalimat padat analisis strategis operasional dapur menyebut bahan baku kritis dan kondisi tren saat ini",',
    '  "promoSuggestion": "1-2 kalimat ide bundling/promo menu PrekDuaDara untuk memaksimalkan bahan melimpah atau menyesuaikan daya beli",',
    '  "urgentAnalysis": "1-2 kalimat penjelasan singkat mengapa bahan yang habis < 2 hari harus diprioritaskan pada PO hari ini"',
    '}',
    '',
    'DATA KUANTITATIF:',
    JSON.stringify(quantitativePayload),
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callGeminiStructuredJson({ prompt, forceRefresh });
  if (!result.ok || !result.parsed) {
    return {
      aiEngine: 'rule-fallback',
      aiFallbackReason: result.fallbackReason,
      geminiInsight: fallback,
    };
  }

  const { parsed, activeModel } = result;
  return {
    aiEngine: activeModel,
    aiFallbackReason: null,
    geminiInsight: {
      detectedTrendKey: trendConfig.key,
      detectedTrendLabel: trendConfig.label,
      trendCategory: VALID_TREND_CATEGORIES.includes(trendConfig.category)
        ? trendConfig.category
        : 'siklus_mahasiswa',
      detectionReason: customContext
        ? `Mode simulasi manual (${trendConfig.label}) dengan catatan lapangan: "${customContext}".`
        : `Mode simulasi / pilihan manual: ${trendConfig.label}.`,
      ingredientMultipliers,
      kitchenStrategy:
        typeof parsed.kitchenStrategy === 'string' && parsed.kitchenStrategy.trim()
          ? parsed.kitchenStrategy.trim()
          : fallback.kitchenStrategy,
      promoSuggestion:
        typeof parsed.promoSuggestion === 'string' && parsed.promoSuggestion.trim()
          ? parsed.promoSuggestion.trim()
          : fallback.promoSuggestion,
      urgentAnalysis:
        typeof parsed.urgentAnalysis === 'string' && parsed.urgentAnalysis.trim()
          ? parsed.urgentAnalysis.trim()
          : fallback.urgentAnalysis,
    },
  };
}

/**
 * Controller: GET /api/analytics/stock-forecast
 * Open-Ended Trend Discovery & Dynamic Multipliers oleh Gemini AI (+ Cache 60s, ?force=1, & Safe Fallback)
 */
async function getStockForecast(req, res) {
  try {
    await ensureMarketTrendTable();

    // 1. Ambil konfigurasi tren aktif dari market_trend_settings (default 'auto')
    const [settingsRows] = await pool.query(
      'SELECT * FROM market_trend_settings WHERE id = 1 LIMIT 1'
    );
    const savedSettings = settingsRows[0] || {
      active_trend: 'auto',
      auto_detect_cycle: 1,
      target_safe_days: 4,
      notes: '',
      updated_at: null,
    };

    const requestedTrend = req.query.trend ? String(req.query.trend).trim() : null;
    const selectedMode =
      requestedTrend && VALID_TRENDS.includes(requestedTrend)
        ? requestedTrend
        : savedSettings.active_trend && VALID_TRENDS.includes(savedSettings.active_trend)
          ? savedSettings.active_trend
          : 'auto';

    const isAutoMode = selectedMode === 'auto';

    const customContext = req.query.customContext
      ? String(req.query.customContext).trim().slice(0, 300)
      : '';

    const forceRefresh =
      String(req.query.force || '').trim() === '1' ||
      String(req.query.force || '').trim().toLowerCase() === 'true';

    const requestedSafeDays = req.query.targetSafeDays
      ? Number(req.query.targetSafeDays)
      : null;
    const targetSafeDays =
      requestedSafeDays &&
      Number.isInteger(requestedSafeDays) &&
      requestedSafeDays >= 1 &&
      requestedSafeDays <= 30
        ? requestedSafeDays
        : Number(savedSettings.target_safe_days) || 4;

    const now = new Date();
    const calendarContext = buildCalendarContext(now);
    const { dayOfMonth } = calendarContext;

    // 2. Ambil data stok aktual dari tabel stocks
    const [stockRows] = await pool.query('SELECT * FROM stocks ORDER BY id ASC');

    // 3. Kumpulkan sinyal penjualan riil dari transactions & transaction_items (status = 'Selesai')
    const [
      [salesRows7d],
      [[velocityRow]],
      [topMenus7dRows],
      [[trxCompareRow]],
    ] = await Promise.all([
      pool.query(`
        SELECT
          ti.product_name,
          ti.sambal,
          ti.quantity,
          t.id AS transaction_id
        FROM transaction_items ti
        INNER JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.status = 'Selesai'
          AND t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN t.created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY) THEN ti.quantity ELSE 0 END), 0) AS portions3d,
          COALESCE(SUM(ti.quantity), 0) AS portions14d
        FROM transaction_items ti
        INNER JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.status = 'Selesai'
          AND t.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      `),
      pool.query(`
        SELECT
          ti.product_name AS name,
          SUM(ti.quantity) AS totalSold,
          SUM(ti.subtotal) AS totalRevenue
        FROM transaction_items ti
        INNER JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.status = 'Selesai'
          AND t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY ti.product_name
        ORDER BY totalSold DESC, totalRevenue DESC
        LIMIT 3
      `),
      pool.query(`
        SELECT
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS current7dTrx,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN total ELSE 0 END) AS current7dRevenue,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS prev7dTrx,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN total ELSE 0 END) AS prev7dRevenue
        FROM transactions
        WHERE status = 'Selesai'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      `),
    ]);

    const portions3d = Number(velocityRow?.portions3d) || 0;
    const portions14d = Number(velocityRow?.portions14d) || 0;
    const avgPortionsPerDay3d = round2(portions3d / 3);
    const avgPortionsPerDay14d = round2(portions14d / 14);
    const velocityAnomalyPercent =
      avgPortionsPerDay14d > 0
        ? round1(((avgPortionsPerDay3d - avgPortionsPerDay14d) / avgPortionsPerDay14d) * 100)
        : null;

    const topMenus7d = topMenus7dRows.map((m, idx) => ({
      rank: idx + 1,
      name: m.name,
      totalSold: Number(m.totalSold) || 0,
      totalRevenue: Number(m.totalRevenue) || 0,
    }));

    const uniqueTrxIds = new Set(salesRows7d.map((r) => r.transaction_id));
    const totalTransactions7d = Number(trxCompareRow?.current7dTrx) || uniqueTrxIds.size;
    const prevTransactions7d = Number(trxCompareRow?.prev7dTrx) || 0;
    const current7dRevenue = Number(trxCompareRow?.current7dRevenue) || 0;
    const prev7dRevenue = Number(trxCompareRow?.prev7dRevenue) || 0;
    const transactionGrowthPercent =
      prevTransactions7d > 0
        ? round1(((totalTransactions7d - prevTransactions7d) / prevTransactions7d) * 100)
        : null;

    const totalItemsSold7d = salesRows7d.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
    const usage7dByKey = calculate7DayUsageFromSales(salesRows7d);

    const MIN_TRX_FULL_CONFIDENCE = 14;
    const salesWeight = Math.min(totalTransactions7d / MIN_TRX_FULL_CONFIDENCE, 1);

    const salesSignals = {
      portions3d,
      portions14d,
      avgPortionsPerDay3d,
      avgPortionsPerDay14d,
      velocityAnomalyPercent,
      topMenus7d,
      current7dTransactions: totalTransactions7d,
      prev7dTransactions: prevTransactions7d,
      transactionGrowthPercent,
      current7dRevenue,
      prev7dRevenue,
      totalItemsSold7d,
    };

    // Kunci cache 15 menit (900 detik): kombinasi tanggal + trend + targetSafeDays + customContext + hash stok
    const stockSignature = stockRows
      .map((s) => `${s.id}:${Number(s.stock)}`)
      .join('|');
    const stockHash = crypto.createHash('sha1').update(stockSignature).digest('hex').slice(0, 12);
    const cacheKey = `${calendarContext.isoDate}::${selectedMode}::${targetSafeDays}::${customContext.toLowerCase()}::${stockHash}`;

    // 4. Jalankan mode AUTO (Open-Ended Trend Discovery + Dynamic Multipliers) atau mode MANUAL
    let trendConfig;
    let items;
    let aiEngine;
    let aiFallbackReason = null;
    let geminiInsight;
    let activeTrendMeta;
    let cacheHit = false;

    if (isAutoMode) {
      const normalTrendConfig = resolveTrendConfig('normal', dayOfMonth);
      const {
        trendConfig: offlineFallbackTrendConfig,
        detectedEventMode,
      } = resolveOfflineFallbackTrendConfig(dayOfMonth, customContext);

      const cachedAuto = !forceRefresh ? getCachedGeminiResult(cacheKey) : null;
      let discoveryResult;

      if (cachedAuto) {
        cacheHit = true;
        discoveryResult = cachedAuto;
      } else {
        const baselinePreviewItems = computeForecastItems({
          stockRows,
          usage7dByKey,
          salesWeight,
          trendConfig: normalTrendConfig,
          targetSafeDays,
        });

        discoveryResult = await discoverOpenEndedTrendWithGemini({
          calendarContext,
          salesSignals,
          stockRows,
          baselinePreviewItems,
          targetSafeDays,
          customContext,
          forceRefresh,
        });

        if (discoveryResult && discoveryResult.ok && discoveryResult.parsed) {
          setCachedGeminiResult(cacheKey, discoveryResult);
        }
      }

      if (discoveryResult && discoveryResult.ok && discoveryResult.parsed) {
        const { parsed } = discoveryResult;

        // Guardrail: clamp setiap multiplier dari AI di rentang aman [0.4, 1.8]
        const clampedMultipliers = sanitizeDynamicMultipliers(
          parsed.ingredientMultipliers,
          stockRows,
          normalTrendConfig
        );

        const trendCategory = VALID_TREND_CATEGORIES.includes(parsed.trendCategory)
          ? parsed.trendCategory
          : customContext
            ? 'event_khusus'
            : 'siklus_mahasiswa';

        const detectedTrendLabel =
          typeof parsed.detectedTrendLabel === 'string' && parsed.detectedTrendLabel.trim()
            ? parsed.detectedTrendLabel.trim()
            : customContext
              ? `Analisis AI: ${customContext.slice(0, 60)}`
              : `Deteksi AI: ${calendarContext.kirimanPhaseLabel}`;

        const impactRange = formatImpactRangeFromMultipliers(
          Object.values(clampedMultipliers)
        );

        trendConfig = {
          key: 'ai_dynamic',
          label: detectedTrendLabel,
          shortLabel: 'Auto AI',
          category: trendCategory,
          description:
            typeof parsed.detectionReason === 'string' && parsed.detectionReason.trim()
              ? parsed.detectionReason.trim()
              : 'Tren pasar dan anomali POS dideteksi secara terbuka oleh Gemini AI.',
          impactRange,
          defaultMultiplier: 1.0,
          multipliers: {},
          cycleInfo: offlineFallbackTrendConfig.cycleInfo,
        };

        items = computeForecastItems({
          stockRows,
          usage7dByKey,
          salesWeight,
          trendConfig,
          dynamicMultipliersByName: clampedMultipliers,
          targetSafeDays,
        });

        const fallbackInsight = buildRuleFallbackInsight({
          items,
          trendConfig,
          ingredientMultipliers: clampedMultipliers,
          targetSafeDays,
          dayOfMonth,
          isAutoMode: true,
          customContext,
          detectedEventMode,
        });

        aiEngine = discoveryResult.activeModel;
        aiFallbackReason = null;
        geminiInsight = {
          detectedTrendKey: 'ai_dynamic',
          detectedTrendLabel,
          trendCategory,
          detectionReason:
            typeof parsed.detectionReason === 'string' && parsed.detectionReason.trim()
              ? parsed.detectionReason.trim()
              : fallbackInsight.detectionReason,
          ingredientMultipliers: clampedMultipliers,
          kitchenStrategy:
            typeof parsed.kitchenStrategy === 'string' && parsed.kitchenStrategy.trim()
              ? parsed.kitchenStrategy.trim()
              : fallbackInsight.kitchenStrategy,
          promoSuggestion:
            typeof parsed.promoSuggestion === 'string' && parsed.promoSuggestion.trim()
              ? parsed.promoSuggestion.trim()
              : fallbackInsight.promoSuggestion,
          urgentAnalysis:
            typeof parsed.urgentAnalysis === 'string' && parsed.urgentAnalysis.trim()
              ? parsed.urgentAnalysis.trim()
              : fallbackInsight.urgentAnalysis,
        };

        activeTrendMeta = {
          key: 'ai_dynamic',
          mode: 'auto',
          label: detectedTrendLabel,
          shortLabel: 'Auto AI',
          trendCategory,
          description: geminiInsight.detectionReason,
          impactRange,
          cycleInfo: offlineFallbackTrendConfig.cycleInfo,
          detectedTrendKey: 'ai_dynamic',
          detectedTrendLabel,
          detectionReason: geminiInsight.detectionReason,
          customContext: customContext || null,
        };
      } else {
        // Fallback aman saat mode auto & Gemini gagal -> rule-engine (responsif terhadap kata kunci acara besar)
        trendConfig = offlineFallbackTrendConfig;
        const ruleMultipliers = buildRuleMultipliersMap(stockRows, trendConfig);

        items = computeForecastItems({
          stockRows,
          usage7dByKey,
          salesWeight,
          trendConfig,
          dynamicMultipliersByName: ruleMultipliers,
          targetSafeDays,
        });

        aiEngine = 'rule-fallback';
        aiFallbackReason =
          (discoveryResult && discoveryResult.fallbackReason) ||
          'Gagal menghubungi Google Gemini API';
        geminiInsight = buildRuleFallbackInsight({
          items,
          trendConfig,
          ingredientMultipliers: ruleMultipliers,
          targetSafeDays,
          dayOfMonth,
          isAutoMode: true,
          customContext,
          detectedEventMode,
        });

        activeTrendMeta = {
          key: trendConfig.key,
          mode: 'auto',
          label: geminiInsight.detectedTrendLabel,
          shortLabel: trendConfig.shortLabel,
          trendCategory: geminiInsight.trendCategory,
          description: trendConfig.description,
          impactRange: trendConfig.impactRange,
          cycleInfo: trendConfig.cycleInfo,
          detectedTrendKey: geminiInsight.detectedTrendKey,
          detectedTrendLabel: geminiInsight.detectedTrendLabel,
          detectionReason: geminiInsight.detectionReason,
          customContext: customContext || null,
        };
      }
    } else {
      // Override / simulasi manual skenario spesifik (?trend=...)
      trendConfig = resolveTrendConfig(selectedMode, dayOfMonth);
      const ruleMultipliers = buildRuleMultipliersMap(stockRows, trendConfig);

      items = computeForecastItems({
        stockRows,
        usage7dByKey,
        salesWeight,
        trendConfig,
        dynamicMultipliersByName: ruleMultipliers,
        targetSafeDays,
      });

      const cachedManual = !forceRefresh ? getCachedGeminiResult(cacheKey) : null;
      let manualResult;
      if (cachedManual) {
        cacheHit = true;
        manualResult = cachedManual;
      } else {
        manualResult = await generateManualModeGeminiInsight({
          items,
          trendConfig,
          ingredientMultipliers: ruleMultipliers,
          calendarContext,
          salesSignals,
          targetSafeDays,
          customContext,
          forceRefresh,
        });
        if (manualResult.aiEngine && manualResult.aiEngine !== 'rule-fallback') {
          setCachedGeminiResult(cacheKey, manualResult);
        }
      }

      aiEngine = manualResult.aiEngine;
      aiFallbackReason = manualResult.aiFallbackReason;
      geminiInsight = manualResult.geminiInsight;

      activeTrendMeta = {
        key: trendConfig.key,
        mode: 'manual',
        label: trendConfig.label,
        shortLabel: trendConfig.shortLabel,
        trendCategory: geminiInsight.trendCategory,
        description: trendConfig.description,
        impactRange: trendConfig.impactRange,
        cycleInfo: trendConfig.cycleInfo,
        detectedTrendKey: trendConfig.key,
        detectedTrendLabel: trendConfig.label,
        detectionReason: geminiInsight.detectionReason,
        customContext: customContext || null,
      };
    }

    const urgentUnder2DaysCount = items.filter((i) => i.isUrgentUnder2Days).length;
    const needPoCount = items.filter((i) => i.suggestedPoQty > 0).length;
    const safeCount = items.filter((i) => i.urgencyLevel === 'AMAN').length;
    const usedBaselineFallback = items.some((i) => i.burnSource !== 'sales_7d');

    const availableTrends = VALID_TRENDS.map((key) => {
      if (key === 'auto') {
        const autoMeta = TREND_CATALOG.auto;
        return {
          key: autoMeta.key,
          label: autoMeta.label,
          shortLabel: autoMeta.shortLabel,
          description: autoMeta.description,
          impactRange: autoMeta.impactRange,
          cycleInfo: null,
          isActive: isAutoMode,
        };
      }
      const t = resolveTrendConfig(key, dayOfMonth);
      return {
        key: t.key,
        label: t.label,
        shortLabel: t.shortLabel,
        description: t.description,
        impactRange: t.impactRange,
        cycleInfo: t.cycleInfo,
        isActive: !isAutoMode && t.key === selectedMode,
      };
    });

    const summary = {
      totalIngredients: items.length,
      urgentUnder2DaysCount,
      needPoCount,
      safeCount,
      targetSafeDays,
      totalTransactions7d,
      prevTransactions7d,
      transactionGrowthPercent,
      totalItemsSold7d,
      avgPortionsPerDay3d,
      avgPortionsPerDay14d,
      velocityAnomalyPercent,
      topMenus7d,
      multiplierGuardrailRange: { min: MIN_MULTIPLIER, max: MAX_MULTIPLIER },
      usedBaselineFallback,
      cacheHit,
      generatedAt: now.toISOString(),
    };

    return res.status(200).json({
      success: true,
      message: 'Berhasil menghitung prediksi kebutuhan stok & analisis tren pasar mahasiswa',
      data: {
        settings: {
          activeTrend: selectedMode,
          resolvedTrendKey: trendConfig.key,
          savedTrend: savedSettings.active_trend,
          isAutoMode,
          isPreviewSimulation: Boolean(
            requestedTrend && requestedTrend !== savedSettings.active_trend
          ),
          customContext: customContext || null,
          autoDetectCycle: Boolean(savedSettings.auto_detect_cycle),
          targetSafeDays,
          notes: savedSettings.notes || '',
          updatedAt: savedSettings.updated_at,
        },
        activeTrendMeta,
        calendarContext,
        salesSignals,
        summary,
        aiEngine,
        aiFallbackReason,
        geminiInsight,
        availableTrends,
        items,
      },
    });
  } catch (error) {
    console.error('Error saat menghitung prediksi stok:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghitung prediksi kebutuhan stok dari database',
    });
  }
}

/**
 * Controller: PUT /api/analytics/market-trend
 * Simpan pilihan activeTrend (termasuk 'auto') dan targetSafeDays ke tabel market_trend_settings
 */
async function updateActiveMarketTrend(req, res) {
  try {
    await ensureMarketTrendTable();

    const body = req.body || {};
    const incomingTrend =
      body.activeTrend !== undefined ? body.activeTrend : body.active_trend;
    const incomingSafeDays =
      body.targetSafeDays !== undefined ? body.targetSafeDays : body.target_safe_days;
    const incomingAutoDetect =
      body.autoDetectCycle !== undefined ? body.autoDetectCycle : body.auto_detect_cycle;
    const incomingNotes = body.notes;

    if (incomingTrend !== undefined && !VALID_TRENDS.includes(String(incomingTrend).trim())) {
      return res.status(400).json({
        success: false,
        message: `Pilihan tren tidak valid! Pilihan yang tersedia: ${VALID_TRENDS.join(', ')}`,
      });
    }

    let parsedSafeDays = null;
    if (incomingSafeDays !== undefined && incomingSafeDays !== null && incomingSafeDays !== '') {
      parsedSafeDays = Number(incomingSafeDays);
      if (!Number.isInteger(parsedSafeDays) || parsedSafeDays < 1 || parsedSafeDays > 30) {
        return res.status(400).json({
          success: false,
          message: 'targetSafeDays harus berupa bilangan bulat antara 1 sampai 30 hari!',
        });
      }
    }

    const cleanTrend =
      incomingTrend !== undefined ? String(incomingTrend).trim() : null;
    let cleanAutoDetect =
      incomingAutoDetect !== undefined ? (Boolean(incomingAutoDetect) ? 1 : 0) : null;
    if (cleanTrend !== null && cleanAutoDetect === null) {
      cleanAutoDetect = cleanTrend === 'auto' ? 1 : 0;
    }
    const cleanNotes =
      incomingNotes !== undefined && incomingNotes !== null
        ? String(incomingNotes).trim().slice(0, 255)
        : null;

    await pool.query(
      `UPDATE market_trend_settings SET
        active_trend = COALESCE(?, active_trend),
        target_safe_days = COALESCE(?, target_safe_days),
        auto_detect_cycle = COALESCE(?, auto_detect_cycle),
        notes = COALESCE(?, notes)
      WHERE id = 1`,
      [cleanTrend, parsedSafeDays, cleanAutoDetect, cleanNotes]
    );

    const [rows] = await pool.query(
      'SELECT * FROM market_trend_settings WHERE id = 1 LIMIT 1'
    );
    const updated = rows[0];
    const { dayOfMonth: wibDayOfMonth } = getWibDateParts(new Date());
    const trendMeta =
      updated.active_trend === 'auto'
        ? { ...TREND_CATALOG.auto, cycleInfo: null }
        : resolveTrendConfig(updated.active_trend, wibDayOfMonth);

    return res.status(200).json({
      success: true,
      message: 'Konfigurasi tren pasar mahasiswa berhasil diperbarui!',
      data: {
        activeTrend: updated.active_trend,
        autoDetectCycle: Boolean(updated.auto_detect_cycle),
        targetSafeDays: Number(updated.target_safe_days),
        notes: updated.notes || '',
        updatedAt: updated.updated_at,
        activeTrendMeta: {
          key: trendMeta.key,
          label: trendMeta.label,
          shortLabel: trendMeta.shortLabel,
          description: trendMeta.description,
          impactRange: trendMeta.impactRange,
          cycleInfo: trendMeta.cycleInfo,
        },
      },
    });
  } catch (error) {
    console.error('Error saat memperbarui tren pasar mahasiswa:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan konfigurasi tren pasar mahasiswa',
    });
  }
}

module.exports = {
  getStockForecast,
  updateActiveMarketTrend,
};
