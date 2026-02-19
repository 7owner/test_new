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
    await client.query('BEGIN'); // Start transaction for the whole script
    for (const stmt of statements) {
      if (!stmt) continue;
      console.log('Executing statement:', stmt.slice(0, 120)); // Log statement being executed
      await client.query(stmt); // Execute statement
    }
    await client.query('COMMIT'); // Commit the whole transaction
    console.log('seed_fixed applied successfully.');
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
