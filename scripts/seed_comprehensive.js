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

        // --- Core Data ---
        log('Seeding core data...');

        // Addresses in Marseille
        const addr1Res = await client.query(`INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays) VALUES ('Siège social Sud', '123 La Canebière', '13001', 'Marseille', 'France') ON CONFLICT DO NOTHING RETURNING id;`);
        const addr2Res = await client.query(`INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays) VALUES ('Dépôt Prado', '456 Boulevard du Prado', '13008', 'Marseille', 'France') ON CONFLICT DO NOTHING RETURNING id;`);
        const addr1Id = addr1Res.rows[0]?.id;
        const addr2Id = addr2Res.rows[0]?.id;
        log(`Addresses created/found.`);

        // Clients in Marseille
        const client1UserRes = await client.query(`INSERT INTO users (email, password, roles) VALUES ('client.marseille@example.com', $1, '["ROLE_CLIENT"]') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id;`, [await bcrypt.hash('password', 10)]);
        const client1UserId = client1UserRes.rows[0].id;
        const client1Res = await client.query(`INSERT INTO client (nom_client, representant_email, user_id, adresse_id) VALUES ('Grand Port Maritime de Marseille', 'client.marseille@example.com', $1, $2) ON CONFLICT (nom_client) DO UPDATE SET nom_client=EXCLUDED.nom_client RETURNING id;`, [client1UserId, addr1Id]);
        const client1Id = client1Res.rows[0].id;

        const client2UserRes = await client.query(`INSERT INTO users (email, password, roles) VALUES ('client.provence@example.com', $1, '["ROLE_CLIENT"]') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id;`, [await bcrypt.hash('password', 10)]);
        const client2UserId = client2UserRes.rows[0].id;
        const client2Res = await client.query(`INSERT INTO client (nom_client, representant_email, user_id, adresse_id) VALUES ('Aéroport Marseille Provence', 'client.provence@example.com', $1, $2) ON CONFLICT (nom_client) DO UPDATE SET nom_client=EXCLUDED.nom_client RETURNING id;`, [client2UserId, addr2Id]);
        const client2Id = client2Res.rows[0].id;
        log(`Clients created/found.`);

        // Sites in Marseille
        const site1Res = await client.query(`INSERT INTO site (nom_site, client_id, adresse_id, statut) VALUES ('Terminal 1 - Croisières', $1, $2, 'Actif') ON CONFLICT (nom_site) DO UPDATE SET nom_site=EXCLUDED.nom_site RETURNING id;`, [client1Id, addr1Id]);
        const site2Res = await client.query(`INSERT INTO site (nom_site, client_id, adresse_id, statut) VALUES ('Hangar J1', $1, $2, 'Actif') ON CONFLICT (nom_site) DO UPDATE SET nom_site=EXCLUDED.nom_site RETURNING id;`, [client1Id, addr1Id]);
        const site3Res = await client.query(`INSERT INTO site (nom_site, client_id, adresse_id, statut) VALUES ('Terminal 2 - Hall A', $1, $2, 'Inactif') ON CONFLICT (nom_site) DO UPDATE SET nom_site=EXCLUDED.nom_site RETURNING id;`, [client2Id, addr2Id]);
        const site1Id = site1Res.rows[0].id;
        const site2Id = site2Res.rows[0].id;
        const site3Id = site3Res.rows[0].id;
        log(`Sites created/found.`);
        
        // --- Associations ---
        log('Seeding associations...');
        const assoc1Res = await client.query(`INSERT INTO association (titre, email_comptabilite, adresse_id) VALUES ('Zone Portuaire Nord', 'compta-portnord@example.com', $1) ON CONFLICT (titre) DO UPDATE SET titre=EXCLUDED.titre RETURNING id;`, [addr1Id]);
        const assoc1Id = assoc1Res.rows[0].id;
        log(`Association created/found.`);

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
        const contratGtbRes = await client.query(`INSERT INTO contrat (titre, date_debut) VALUES ('Contrat de maintenance GTB', '2025-01-01') ON CONFLICT (titre) DO UPDATE SET titre=EXCLUDED.titre RETURNING id;`);
        const contratVideoRes = await client.query(`INSERT INTO contrat (titre, date_debut) VALUES ('Contrat de maintenance Video', '2025-01-01') ON CONFLICT (titre) DO UPDATE SET titre=EXCLUDED.titre RETURNING id;`);
        const contratIntrusionRes = await client.query(`INSERT INTO contrat (titre, date_debut) VALUES ('Contrat de maintenance Intrusion', '2025-01-01') ON CONFLICT (titre) DO UPDATE SET titre=EXCLUDED.titre RETURNING id;`);
        const contratAccesRes = await client.query(`INSERT INTO contrat (titre, date_debut) VALUES ('Contrat de maintenance Contrôle d''accès', '2025-01-01') ON CONFLICT (titre) DO UPDATE SET titre=EXCLUDED.titre RETURNING id;`);
        const contratGtbId = contratGtbRes.rows[0].id;
        const contratVideoId = contratVideoRes.rows[0].id;
        const contratIntrusionId = contratIntrusionRes.rows[0].id;
        const contratAccesId = contratAccesRes.rows[0].id;
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
        const dem1Res = await client.query(`INSERT INTO demande_client (client_id, site_id, titre, description, created_at) VALUES ($1, $2, 'GTB en panne sur Terminal 1', 'Le système de chauffage ne répond plus.', $3) ON CONFLICT DO NOTHING RETURNING id;`, [client1Id, site1Id, new Date(baseDate.getTime() - 30 * 24 * 3600 * 1000)]);
        const dem1Id = dem1Res.rows[0]?.id;
        if (dem1Id) {
            const ticket1Res = await client.query(`UPDATE demande_client SET ticket_id = (INSERT INTO ticket (titre, description, doe_id, affaire_id, site_id, demande_id, etat, responsable, date_debut) VALUES ($1, $2, null, null, $3, $4, 'En_cours', 'AGT001', $5) RETURNING id) WHERE id = $4 RETURNING ticket_id;`, [`Demande: GTB en panne`, 'Le système de chauffage ne répond plus.', site1Id, dem1Id, new Date(baseDate.getTime() - 28 * 24 * 3600 * 1000)]);
            const ticket1Id = ticket1Res.rows[0]?.ticket_id;
            if (ticket1Id) {
                const ta1Res = await client.query(`INSERT INTO ticket_agent (ticket_id, agent_matricule) VALUES ($1, 'AGT001') ON CONFLICT DO NOTHING RETURNING id;`, [ticket1Id]);
                const ta1Id = ta1Res.rows[0]?.id;
                await client.query(`INSERT INTO intervention (ticket_id, site_id, titre, description, date_debut, status, ticket_agent_id) VALUES ($1, $2, 'Diagnostic initial', 'Vérification des automates.', $3, 'Termine', $4);`, [ticket1Id, site1Id, new Date(baseDate.getTime() - 27 * 24 * 3600 * 1000), ta1Id]);
                await client.query(`INSERT INTO intervention (ticket_id, site_id, titre, description, date_debut, status, ticket_agent_id) VALUES ($1, $2, 'Remplacement automate', 'Automate A-45 remplacé.', $3, 'En_cours', $4);`, [ticket1Id, site1Id, new Date(baseDate.getTime() - 5 * 24 * 3600 * 1000), ta1Id]);
            }
        }

        // Demande 2 (Jan) -> Ticket terminé
        const dem2Res = await client.query(`INSERT INTO demande_client (client_id, site_id, titre, description, created_at) VALUES ($1, $2, 'Caméra HS Hangar J1', 'Une caméra de surveillance ne transmet plus.', $3) ON CONFLICT DO NOTHING RETURNING id;`, [client1Id, site2Id, new Date(baseDate.getTime() + 15 * 24 * 3600 * 1000)]);
        const dem2Id = dem2Res.rows[0]?.id;
        if(dem2Id) {
            const ticket2Res = await client.query(`UPDATE demande_client SET ticket_id = (INSERT INTO ticket (titre, description, doe_id, affaire_id, site_id, demande_id, etat, responsable, date_debut, date_fin) VALUES ($1, $2, null, null, $3, $4, 'Termine', 'AGT003', $5, $6) RETURNING id) WHERE id = $4 RETURNING ticket_id;`, [`Demande: Caméra HS`, 'Une caméra de surveillance ne transmet plus.', site2Id, dem2Id, new Date(baseDate.getTime() + 16 * 24 * 3600 * 1000), new Date(baseDate.getTime() + 20 * 24 * 3600 * 1000)]);
            const ticket2Id = ticket2Res.rows[0]?.ticket_id;
            if(ticket2Id) {
                 await client.query(`INSERT INTO intervention (ticket_id, site_id, titre, description, date_debut, date_fin, status) VALUES ($1, $2, 'Changement caméra', 'Caméra modèle X remplacée par modèle Y.', $3, $4, 'Termine');`, [ticket2Id, site2Id, new Date(baseDate.getTime() + 17 * 24 * 3600 * 1000), new Date(baseDate.getTime() + 18 * 24 * 3600 * 1000)]);
            }
        }

        // Demande 3 (Feb) - Non convertie
        await client.query(`INSERT INTO demande_client (client_id, site_id, titre, description, created_at) VALUES ($1, $2, 'Badge ne fonctionne pas - T2', 'Un employé ne peut pas accéder au Hall A.', $3) ON CONFLICT DO NOTHING;`, [client2Id, site3Id, new Date(baseDate.getTime() + 50 * 24 * 3600 * 1000)]);
        
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
