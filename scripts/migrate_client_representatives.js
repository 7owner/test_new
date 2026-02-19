const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrateClientRepresentatives() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch all clients with representant_email
        const clientsResult = await client.query(`
            SELECT id, nom_client, representant_nom, representant_email, representant_tel
            FROM client
            WHERE representant_email IS NOT NULL AND representant_email != '';
        `);
        const clientsToMigrate = clientsResult.rows;

        console.log(`Found ${clientsToMigrate.length} clients with representative emails to migrate.`);

        for (const c of clientsToMigrate) {
            console.log(`Processing client: ${c.nom_client} (ID: ${c.id})`);

            let userId;
            // 1. Find or create user
            let userResult = await client.query('SELECT id FROM users WHERE email = $1;', [c.representant_email]);
            if (userResult.rows.length === 0) {
                // User does not exist, create a new one
                const tempPassword = process.env.DEFAULT_CLIENT_PASSWORD || 'password123'; // Use a strong default/env var
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                const newUserResult = await client.query(
                    'INSERT INTO users (email, roles, password) VALUES ($1, $2, $3) RETURNING id;',
                    [c.representant_email, ['ROLE_CLIENT'], hashedPassword]
                );
                userId = newUserResult.rows[0].id;
                console.log(`  Created new user for ${c.representant_email} with ID: ${userId}`);
            } else {
                userId = userResult.rows[0].id;
                console.log(`  Found existing user for ${c.representant_email} with ID: ${userId}`);
                // Ensure existing user has ROLE_CLIENT if they didn't already
                await client.query(
                    `UPDATE users SET roles = jsonb_insert(roles, '{0}', '"ROLE_CLIENT"', true) WHERE id = $1 AND NOT (roles ? 'ROLE_CLIENT');`,
                    [userId]
                );
                // Also ensure they don't have conflicting roles like ROLE_ADMIN unless specifically desired
                // (This script assumes ROLE_CLIENT is the desired role here)
            }

            // 2. Find or create client_representant entry
            let clientRepresentantResult = await client.query(
                'SELECT id FROM client_representant WHERE client_id = $1 AND user_id = $2;',
                [c.id, userId]
            );

            if (clientRepresentantResult.rows.length === 0) {
                // client_representant entry does not exist, create a new one
                const defaultFonction = 'Representant'; // Default if not provided
                await client.query(
                    'INSERT INTO client_representant (client_id, user_id, nom, email, tel, fonction) VALUES ($1, $2, $3, $4, $5, $6);',
                    [c.id, userId, c.representant_nom || 'Représentant Client', c.representant_email, c.representant_tel, defaultFonction]
                );
                console.log(`  Created client_representant entry for client ID ${c.id} and user ID ${userId}`);
            } else {
                console.log(`  Client_representant entry already exists for client ID ${c.id} and user ID ${userId}`);
                // Optionally, update the existing client_representant details if they might have changed in the client table
                 await client.query(
                     `UPDATE client_representant SET nom = $3, email = $4, tel = $5, fonction = $6 WHERE client_id = $1 AND user_id = $2;`,
                     [c.id, userId, c.representant_nom || 'Représentant Client', c.representant_email, c.representant_tel, 'Representant']
                 );
                 console.log(`  Updated existing client_representant entry for client ID ${c.id} and user ID ${userId}`);
            }
        }

        await client.query('COMMIT');
        console.log('Client representative migration completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error during client representative migration:', e);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

migrateClientRepresentatives();
