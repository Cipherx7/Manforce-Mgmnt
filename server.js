// server.js - Manpower Management Platform
// DV Events | Node.js + Express + PostgreSQL (Supabase)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const { testConnection } = require('./db');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true
}));

// ─── Public Routes (no auth needed) ─────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'DV Events Manpower Platform' });
});

// ─── Protected API Routes (JWT required) ────────────────────────────────────
app.use('/api/managers',     authenticate, require('./routes/managers'));
app.use('/api/resources',    authenticate, require('./routes/resources'));
app.use('/api/projects',     authenticate, require('./routes/projects'));
app.use('/api/assignments',  authenticate, require('./routes/assignments'));
app.use('/api/nominations',  authenticate, require('./routes/nominations'));
app.use('/api/attendance',   authenticate, require('./routes/attendance'));
app.use('/api/payments',     authenticate, require('./routes/payments'));
app.use('/api/clients',      authenticate, require('./routes/clients'));
app.use('/api/dashboard',    authenticate, require('./routes/dashboard'));
app.use('/api/users',        require('./routes/users')); // auth inside route file

// ─── Catch-all: serve SPA ────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Start (local standalone execution) ──────────────────────────────────────
async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 DV Events Manpower Platform running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api/health`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
