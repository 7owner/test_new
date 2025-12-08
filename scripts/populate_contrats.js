const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function populateContrats() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Populating client_id and site_id for contracts...');

        // Fetch existing clients and sites
        const clientsRes = await client.query('SELECT id FROM client');
        const clientIds = clientsRes.rows.map(row => row.id);
        if (clientIds.length === 0) {
            console.warn('No clients found. Skipping contract population.');
            await client.query('ROLLBACK');
            return;
        }

        const sitesRes = await client.query('SELECT id FROM site');
        const siteIds = sitesRes.rows.map(row => row.id);
        if (siteIds.length === 0) {
            console.warn('No sites found. Skipping contract population.');
            await client.query('ROLLBACK');
            return;
        }

        // Fetch all contracts
        const contratsRes = await client.query('SELECT id FROM contrat');
        const contratIds = contratsRes.rows.map(row => row.id);

        for (const contratId of contratIds) {
            const randomClientId = clientIds[Math.floor(Math.random() * clientIds.length)];
            const randomSiteId = siteIds[Math.floor(Math.random() * siteIds.length)];

            await client.query(
                `UPDATE contrat SET client_id = $1, site_id = $2 WHERE id = $3`,
                [randomClientId, randomSiteId, contratId]
            );
        }

        await client.query('COMMIT');
        console.log('Successfully populated client_id and site_id for contracts.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error populating contracts:', e);
    } finally {
        client.release();
        pool.end();
    }
}

populateContrats();
