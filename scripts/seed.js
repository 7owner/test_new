const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();
  try {
    const initSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql')).toString();
    await client.query(initSql);
    console.log('Schema OK');
    const seedSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql')).toString();
    await client.query(seedSql);
    console.log('Seed OK');
  } catch (e) {
    console.error('Seed failed:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

