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
    const seedPath = path.join(__dirname, '..', 'database_correction', 'seed_fixed.sql');
    const raw = fs.readFileSync(seedPath, 'utf8');
    const norm = raw.replace(/\uFEFF/g, '');
    const statements = norm
      .split('\n')
      .filter(l => !/^\s*--/.test(l))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    console.log('Applying seed_fixed.sql statements:', statements.length);
    await client.query('BEGIN');
    for (const stmt of statements) {
      try {
        if (!stmt) continue;
        await client.query(stmt);
      } catch (e) {
        if (e && e.code === '23505') {
          console.warn('Skip duplicate:', stmt.slice(0, 120));
          continue;
        }
        console.warn('Seed statement failed, continuing:', e.message, 'Stmt head:', stmt.slice(0,120));
      }
    }
    await client.query('COMMIT');
    console.log('seed_fixed applied');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('seed_fixed apply failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();

