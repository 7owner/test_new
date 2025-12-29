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
        
        // Execute the entire SQL script as one query
        await client.query(schemaSqlRaw);
        
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
