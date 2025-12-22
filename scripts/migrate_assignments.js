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
    const sqlPath = path.join(__dirname, 'migrate_assignments.sql');
    const sqlRaw = fs.readFileSync(sqlPath, 'utf8');
    const statements = sqlRaw
      .replace(/\uFEFF/g, '')
      .split('\n')
      .filter(l => !/^\s*--/.test(l))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    await client.query('BEGIN');
    for (const stmt of statements) {
      if (!stmt) continue;
      await client.query(stmt);
    }
    await client.query('COMMIT');
    console.log('Migration assignments OK');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();

