const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const isSsl = process.env.DB_SSL !== 'false';
const poolConfig = {
  host: process.env.DB_HOST || 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'dvevents.idchfpwhkljerfcpvqvl',
  password: process.env.DB_PASSWORD || 'DvEvents2026_SecureDb!',
  database: process.env.DB_NAME || 'postgres',
  ssl: isSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pgPool = new Pool(poolConfig);

pgPool.on('error', (err) => {
  console.error('⚠️ Supabase pool connection error (handled):', err.message);
});

function adaptSql(sql) {
  if (typeof sql !== 'string') return { adapted: sql, isInsert: false };
  let index = 1;
  let adapted = sql
    .replace(/\bis_active\s*=\s*1\b/gi, 'is_active = true')
    .replace(/\bis_active\s*=\s*0\b/gi, 'is_active = false')
    .replace(/\?/g, () => `$${index++}`);

  const isInsert = /^\s*insert\s+into\s+/i.test(adapted);
  if (isInsert && !/\breturning\b/i.test(adapted)) {
    adapted += ' RETURNING id';
  }
  return { adapted, isInsert };
}

function formatResult(pgRes, isInsert) {
  const rows = pgRes.rows || [];
  rows.insertId = isInsert && rows[0]?.id !== undefined ? rows[0].id : null;
  rows.affectedRows = pgRes.rowCount || 0;
  return [rows, pgRes.fields];
}

async function query(sql, params = []) {
  const { adapted, isInsert } = adaptSql(sql);
  const res = await pgPool.query(adapted, params);
  return formatResult(res, isInsert);
}

async function getConnection() {
  const client = await pgPool.connect();
  return {
    client,
    async query(sql, params = []) {
      const { adapted, isInsert } = adaptSql(sql);
      const res = await client.query(adapted, params);
      return formatResult(res, isInsert);
    },
    async beginTransaction() {
      await client.query('BEGIN');
    },
    async commit() {
      await client.query('COMMIT');
    },
    async rollback() {
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        // ignore rollback error if already closed
      }
    },
    release() {
      client.release();
    }
  };
}

async function testConnection() {
  try {
    const client = await pgPool.connect();
    console.log('✅ PostgreSQL connected to Supabase successfully');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
    return false;
  }
}

const pool = {
  query,
  getConnection,
  end: () => pgPool.end(),
  rawPool: pgPool
};

module.exports = { pool, testConnection };
