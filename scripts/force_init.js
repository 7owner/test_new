const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function forceInit() {
    const client = await pool.connect();
    try {
        console.log('Forcing database initialization...');
        await client.query('SET search_path TO public;');
        const schemaPath = path.join(__dirname, '..', 'database_correction', 'init_fixed.sql');
        const schemaSqlRaw = fs.readFileSync(schemaPath, 'utf8');
        
        const norm = schemaSqlRaw
            .replace(/\uFEFF/g, '')
            .replace(/\r\n/g, '\n')
            .replace(/\/\*[\s\S]*?\*\//g, ''); // remove /* */ blocks
        const statements = norm
            .split('\n')
            .filter(line => !/^\s*--/.test(line))
            .join('\n')
            .split(';')
            .map(s => s.trim())
            .filter(s => /\S/.test(s))
            .filter(s => /^[A-Za-z]/.test(s));
            
        console.log('Executing', statements.length, 'statements from init_fixed.sql');
        
        await client.query('BEGIN');
        for (const stmt of statements) {
            try {
                await client.query(stmt);
            } catch (e) {
                console.error('Statement failed:', stmt.slice(0, 120) + '...', e.message);
                throw e;
            }
        }
        await client.query('COMMIT');
        
        console.log('Database schema initialized successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error during forced initialization:', e);
    } finally {
        client.release();
        pool.end();
    }
}

forceInit();
