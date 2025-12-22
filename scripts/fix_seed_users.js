const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, 'fix_seed_users.sql');
    const raw = fs.readFileSync(sqlPath, 'utf8');
    const statements = raw
      .replace(/\uFEFF/g, '')
      .split('\n')
      .filter(l => !/^\s*--/.test(l))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    await client.query('BEGIN');
    for (const stmt of statements) {
      await client.query(stmt);
    }
    await client.query('COMMIT');
    console.log('Seed users fixed successfully.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Fix failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();

