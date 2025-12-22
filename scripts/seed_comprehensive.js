// scripts/seed_comprehensive.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const log = (message) => console.log(`[SEED] ${message}`);

async function main() {
    const client = await pool.connect();
    log('Starting comprehensive seeding process...');

    try {
        await client.query('BEGIN');

        // Helper function for idempotent insertion (SELECT before INSERT)
        // Returns the ID of the existing or newly created row
        async function getOrCreate(table, selectIdentifier, insertCols, insertVals, returningCol = 'id') {
            const selectQuery = `SELECT ${returningCol} FROM ${table} WHERE ${Object.keys(selectIdentifier).map((key, i) => `${key} = $${i + 1}`).join(' AND ')}`;
            let res = await client.query(selectQuery, Object.values(selectIdentifier));
            if (res.rows.length > 0) {
                return res.rows[0][returningCol];
            }
            const insertQuery = `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${insertCols.map((c, i) => `$${i + 1}`).join(', ')}) RETURNING ${returningCol};`;
            res = await client.query(insertQuery, insertVals);
            return res.rows[0][returningCol];
        }

        // --- Core Data ---
        log('Seeding core data...');

        // Addresses in Marseille
        const addr1Id = await getOrCreate(
            'adresse',
            { ligne1: '123 La Canebière', code_postal: '13001' },
            ['libelle', 'ligne1', 'code_postal', 'ville', 'pays'],
            ['Siège social Sud', '123 La Canebière', '13001', 'Marseille', 'France']
        );
        const addr2Id = await getOrCreate(
            'adresse',
            { ligne1: '456 Boulevard du Prado', code_postal: '13008' },
            ['libelle', 'ligne1', 'code_postal', 'ville', 'pays'],
            ['Dépôt Prado', '456 Boulevard du Prado', '13008', 'Marseille', 'France']
        );
        log(`Addresses created/found: addr1Id=${addr1Id}, addr2Id=${addr2Id}`);

        // Clients in Marseille
        const hashedPassword = await bcrypt.hash('password', 10);
        const client1UserId = await getOrCreate(
            'users',
            { email: 'client.marseille@example.com' },
            ['email', 'password', 'roles'],
            ['client.marseille@example.com', hashedPassword, '["ROLE_CLIENT"]']
        );
        const client1Id = await getOrCreate(
            'client',
            { nom_client: 'Grand Port Maritime de Marseille' },
            ['nom_client', 'representant_email', 'user_id', 'adresse_id'],
            ['Grand Port Maritime de Marseille', 'client.marseille@example.com', client1UserId, addr1Id]
        );

        const client2UserId = await getOrCreate(
            'users',
            { email: 'client.provence@example.com' },
            ['email', 'password', 'roles'],
            ['client.provence@example.com', hashedPassword, '["ROLE_CLIENT"]']
        );
        const client2Id = await getOrCreate(
            'client',
            { nom_client: 'Aéroport Marseille Provence' },
            ['nom_client', 'representant_email', 'user_id', 'adresse_id'],
            ['Aéroport Marseille Provence', 'client.provence@example.com', client2UserId, addr2Id]
        );
        log(`Clients created/found: client1Id=${client1Id}, client2Id=${client2Id}`);

        // Sites in Marseille
        const site1Id = await getOrCreate(
            'site',
            { nom_site: 'Terminal 1 - Croisières' },
            ['nom_site', 'client_id', 'adresse_id', 'statut'],
            ['Terminal 1 - Croisières', client1Id, addr1Id, 'Actif']
        );
        const site2Id = await getOrCreate(
            'site',
            { nom_site: 'Hangar J1' },
            ['nom_site', 'client_id', 'adresse_id', 'statut'],
            ['Hangar J1', client1Id, addr1Id, 'Actif']
        );
        const site3Id = await getOrCreate(
            'site',
            { nom_site: 'Terminal 2 - Hall A' },
            ['nom_site', 'client_id', 'adresse_id', 'statut'],
            ['Terminal 2 - Hall A', client2Id, addr2Id, 'Inactif']
        );
        log(`Sites created/found: site1Id=${site1Id}, site2Id=${site2Id}, site3Id=${site3Id}`);
        
        // --- Associations ---
        log('Seeding associations...');
        const assoc1Id = await getOrCreate(
            'association',
            { titre: 'Zone Portuaire Nord' },
            ['titre', 'email_comptabilite', 'adresse_id'],
            ['Zone Portuaire Nord', 'compta-portnord@example.com', addr1Id]
        );
        log(`Association created/found: assoc1Id=${assoc1Id}`);

        // Link sites to association
        if (site1Id) await client.query(`INSERT INTO association_site (association_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [assoc1Id, site1Id]);
        if (site2Id) await client.query(`INSERT INTO association_site (association_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [assoc1Id, site2Id]);
        log(`Sites linked to association.`);

        // Assign agents to association
        await client.query(`INSERT INTO association_responsable (association_id, agent_matricule) VALUES ($1, 'AGT002') ON CONFLICT DO NOTHING;`, [assoc1Id]); // Admin agent
        await client.query(`INSERT INTO association_agent (association_id, agent_matricule) VALUES ($1, 'AGT001') ON CONFLICT DO NOTHING;`, [assoc1Id]);
        await client.query(`INSERT INTO association_agent (association_id, agent_matricule) VALUES ($1, 'AGT003') ON CONFLICT DO NOTHING;`, [assoc1Id]);
        log(`Agents assigned to association.`);
        
        // --- Contrats ---
        log('Seeding contrats...');
        const contratGtbId = await getOrCreate('contrat', { titre: 'Contrat de maintenance GTB' }, ['titre', 'date_debut'], ['Contrat de maintenance GTB', '2025-01-01']);
        const contratVideoId = await getOrCreate('contrat', { titre: 'Contrat de maintenance Video' }, ['titre', 'date_debut'], ['Contrat de maintenance Video', '2025-01-01']);
        const contratIntrusionId = await getOrCreate('contrat', { titre: 'Contrat de maintenance Intrusion' }, ['titre', 'date_debut'], ['Contrat de maintenance Intrusion', '2025-01-01']);
        const contratAccesId = await getOrCreate('contrat', { titre: 'Contrat de maintenance Contrôle d\'accès' }, ['titre', 'date_debut'], ['Contrat de maintenance Contrôle d\'accès', '2025-01-01']);
        log(`Contrats created/found.`);

        // Link contrats to sites
        if (site1Id) {
            await client.query(`INSERT INTO contrat_site_association (contrat_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [contratGtbId, site1Id]);
            await client.query(`INSERT INTO contrat_site_association (contrat_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [contratVideoId, site1Id]);
        }
        if (site2Id) {
            await client.query(`INSERT INTO contrat_site_association (contrat_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [contratIntrusionId, site2Id]);
            await client.query(`INSERT INTO contrat_site_association (contrat_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [contratAccesId, site2Id]);
        }
        if (site3Id) {
            await client.query(`INSERT INTO contrat_site_association (contrat_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [contratGtbId, site3Id]);
        }
        log('Contrats linked to sites.');

        // --- Workflow Data (4 months) ---
        log('Seeding workflow data...');
        const baseDate = new Date('2025-12-22T10:00:00Z');
        
        // Demande 1 (Dec) -> Ticket -> 2 Interventions
        const dem1Title = 'GTB en panne sur Terminal 1';
        const dem1Id = await getOrCreate(
            'demande_client',
            { titre: dem1Title, client_id: client1Id },
            ['client_id', 'site_id', 'titre', 'description', 'created_at'],
            [client1Id, site1Id, dem1Title, 'Le système de chauffage ne répond plus.', new Date(baseDate.getTime() - 30 * 24 * 3600 * 1000)]
        );
        if (dem1Id) {
            const ticket1Title = `Demande: ${dem1Title}`;
            const ticket1Id = await getOrCreate(
                'ticket',
                { titre: ticket1Title, demande_id: dem1Id },
                ['titre', 'description', 'site_id', 'demande_id', 'etat', 'responsable', 'date_debut'],
                [ticket1Title, 'Le système de chauffage ne répond plus.', site1Id, dem1Id, 'En_cours', 'AGT001', new Date(baseDate.getTime() - 28 * 24 * 3600 * 1000)]
            );
            if (ticket1Id) {
                 await client.query(`UPDATE demande_client SET ticket_id = $1 WHERE id = $2;`, [ticket1Id, dem1Id]);

                const ta1Id = await getOrCreate(
                    'ticket_agent',
                    { ticket_id: ticket1Id, agent_matricule: 'AGT001' },
                    ['ticket_id', 'agent_matricule'],
                    [ticket1Id, 'AGT001']
                );
                
                await getOrCreate(
                    'intervention',
                    { ticket_id: ticket1Id, titre: 'Diagnostic initial' },
                    ['ticket_id', 'site_id', 'titre', 'description', 'date_debut', 'status', 'ticket_agent_id'],
                    [ticket1Id, site1Id, 'Diagnostic initial', 'Vérification des automates.', new Date(baseDate.getTime() - 27 * 24 * 3600 * 1000), 'Termine', ta1Id]
                );
                await getOrCreate(
                    'intervention',
                    { ticket_id: ticket1Id, titre: 'Remplacement automate' },
                    ['ticket_id', 'site_id', 'titre', 'description', 'date_debut', 'status', 'ticket_agent_id'],
                    [ticket1Id, site1Id, 'Remplacement automate', 'Automate A-45 remplacé.', new Date(baseDate.getTime() - 5 * 24 * 3600 * 1000), 'En_attente', ta1Id]
                );
            }
        }

        // Demande 2 (Jan) -> Ticket terminé
        const dem2Title = 'Caméra HS Hangar J1';
        const dem2Id = await getOrCreate(
            'demande_client',
            { titre: dem2Title, client_id: client1Id },
            ['client_id', 'site_id', 'titre', 'description', 'created_at'],
            [client1Id, site2Id, dem2Title, 'Une caméra de surveillance ne transmet plus.', new Date(baseDate.getTime() + 15 * 24 * 3600 * 1000)]
        );
        if(dem2Id) {
            const ticket2Title = `Demande: ${dem2Title}`;
            const ticket2Id = await getOrCreate(
                'ticket',
                { titre: ticket2Title, demande_id: dem2Id },
                ['titre', 'description', 'site_id', 'demande_id', 'etat', 'responsable', 'date_debut', 'date_fin'],
                [ticket2Title, 'Une caméra de surveillance ne transmet plus.', site2Id, dem2Id, 'Termine', 'AGT003', new Date(baseDate.getTime() + 16 * 24 * 3600 * 1000), new Date(baseDate.getTime() + 20 * 24 * 3600 * 1000)]
            );
            if(ticket2Id) {
                await client.query(`UPDATE demande_client SET ticket_id = $1 WHERE id = $2;`, [ticket2Id, dem2Id]);
                await getOrCreate(
                    'intervention',
                    { ticket_id: ticket2Id, titre: 'Changement caméra' },
                    ['ticket_id', 'site_id', 'titre', 'description', 'date_debut', 'date_fin', 'status'],
                    [ticket2Id, site2Id, 'Changement caméra', 'Caméra modèle X remplacée par modèle Y.', new Date(baseDate.getTime() + 17 * 24 * 3600 * 1000), new Date(baseDate.getTime() + 18 * 24 * 3600 * 1000), 'Termine']
                );
            }
        }

        // Demande 3 (Feb) - Non convertie
        const dem3Title = 'Badge ne fonctionne pas - T2';
        await getOrCreate(
            'demande_client',
            { titre: dem3Title, client_id: client2Id },
            ['client_id', 'site_id', 'titre', 'description', 'created_at'],
            [client2Id, site3Id, dem3Title, 'Un employé ne peut pas accéder au Hall A.', new Date(baseDate.getTime() + 50 * 24 * 3600 * 1000)]
        );
        
        log('Workflow data seeded.');
        
        await client.query('COMMIT');
        log('Comprehensive seeding complete.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error during seeding, transaction rolled back.', error);
    } finally {
        client.release();
        log('Seeding process finished.');
    }
}

main().catch(err => console.error(err));
