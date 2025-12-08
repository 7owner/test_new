const { Pool } = require('pg');
const { faker } = require('@faker-js/faker');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const NUM_FAKES = 50;

// Helper to generate unique values
function generateUnique(generator, count) {
    const items = new Set();
    while (items.size < count) {
        items.add(generator());
    }
    return Array.from(items);
}

async function seedFakerData() {
    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');
        console.log(`Starting to seed ${NUM_FAKES} fake records for each entity...`);

        // 1. Agences
        const agenceTitres = generateUnique(() => faker.company.name(), 5);
        const agences = agenceTitres.map(titre => ({ titre, email: faker.internet.email() }));
        const agenceRes = await dbClient.query(
            `INSERT INTO agence (titre, email) SELECT titre, email FROM jsonb_to_recordset($1) as x(titre TEXT, email TEXT) ON CONFLICT (titre) DO NOTHING RETURNING id`,
            [JSON.stringify(agences)]
        );
        const agenceIds = agenceRes.rows.map(r => r.id);
        console.log(`-> 5 agences created/processed.`);

        // 2. Agents
        const agentEmails = generateUnique(() => faker.internet.email(), NUM_FAKES);
        const agents = agentEmails.map((email, i) => {
            const prenom = faker.person.firstName();
            const nom = faker.person.lastName();
            return {
                matricule: `AGT-Faker-${i}`,
                nom,
                prenom,
                email,
                agence_id: faker.helpers.arrayElement(agenceIds)
            };
        });
        await dbClient.query(
            `INSERT INTO agent (matricule, nom, prenom, email, agence_id) 
             SELECT matricule, nom, prenom, email, agence_id::BIGINT FROM jsonb_to_recordset($1) as x(matricule TEXT, nom TEXT, prenom TEXT, email TEXT, agence_id BIGINT)
             ON CONFLICT (matricule) DO NOTHING`,
            [JSON.stringify(agents)]
        );
        const agentMatricules = agents.map(a => a.matricule);
        console.log(`-> ${NUM_FAKES} agents created/processed.`);

        // 3. Clients
        const clientNoms = generateUnique(() => faker.company.name(), NUM_FAKES);
        const clients = clientNoms.map(nom => ({ nom_client: nom }));
        const clientRes = await dbClient.query(
            `INSERT INTO client (nom_client) SELECT nom_client FROM jsonb_to_recordset($1) as x(nom_client TEXT) ON CONFLICT (nom_client) DO NOTHING RETURNING id`,
            [JSON.stringify(clients)]
        );
        const clientIds = clientRes.rows.map(r => r.id);
        console.log(`-> ${NUM_FAKES} clients created/processed.`);

        // 4. Sites
        const siteNoms = generateUnique(() => faker.company.name() + ' Site', NUM_FAKES);
        const sites = siteNoms.map(nom => ({
            nom_site: nom,
            client_id: faker.helpers.arrayElement(clientIds),
        }));
        const siteRes = await dbClient.query(
            `INSERT INTO site (nom_site, client_id) SELECT nom_site, client_id::BIGINT FROM jsonb_to_recordset($1) as x(nom_site TEXT, client_id BIGINT) ON CONFLICT (nom_site) DO NOTHING RETURNING id`,
            [JSON.stringify(sites)]
        );
        const siteIds = siteRes.rows.map(r => r.id);
        console.log(`-> ${NUM_FAKES} sites created/processed.`);

        // 5. Affaires
        const affaireNoms = generateUnique(() => `Affaire ${faker.commerce.productName()}`, NUM_FAKES);
        const affaires = affaireNoms.map(nom => ({
            nom_affaire: nom,
            client_id: faker.helpers.arrayElement(clientIds),
        }));
        const affaireRes = await dbClient.query(
            `INSERT INTO affaire (nom_affaire, client_id) SELECT nom_affaire, client_id::BIGINT FROM jsonb_to_recordset($1) as x(nom_affaire TEXT, client_id BIGINT) ON CONFLICT (nom_affaire) DO NOTHING RETURNING id`,
            [JSON.stringify(affaires)]
        );
        const affaireIds = affaireRes.rows.map(r => r.id);
        console.log(`-> ${NUM_FAKES} affaires created/processed.`);
        
        // 6. Contrats
        const contratTitres = generateUnique(() => `Contrat ${faker.commerce.productName()}`, NUM_FAKES);
        const contrats = contratTitres.map(titre => ({
            titre: titre,
            date_debut: faker.date.past(),
        }));
        await dbClient.query(
            `INSERT INTO contrat (titre, date_debut) SELECT titre, date_debut::DATE FROM jsonb_to_recordset($1) as x(titre TEXT, date_debut DATE) ON CONFLICT (titre) DO NOTHING`,
            [JSON.stringify(contrats)]
        );
        console.log(`-> ${NUM_FAKES} contrats created/processed.`);
        
        // 7. Tickets
        const tickets = [];
        for (let i = 0; i < NUM_FAKES; i++) {
            tickets.push({
                titre: faker.lorem.sentence(5),
                description: faker.lorem.paragraph(),
                site_id: faker.helpers.arrayElement(siteIds),
                affaire_id: faker.helpers.arrayElement(affaireIds),
                responsable: faker.helpers.arrayElement(agentMatricules),
                etat: faker.helpers.arrayElement(['Pas_commence', 'En_cours', 'Termine']),
            });
        }
        const ticketRes = await dbClient.query(
            `INSERT INTO ticket (titre, description, site_id, affaire_id, responsable, etat) 
             SELECT titre, description, site_id::BIGINT, affaire_id::BIGINT, responsable, etat::etat_rapport FROM jsonb_to_recordset($1) as x(titre TEXT, description TEXT, site_id BIGINT, affaire_id BIGINT, responsable TEXT, etat TEXT)
             RETURNING id`,
            [JSON.stringify(tickets)]
        );
        const ticketIds = ticketRes.rows.map(r => r.id);
        console.log(`-> ${NUM_FAKES} tickets created.`);
        
        // 8. Interventions
        const interventions = [];
        for (let i = 0; i < NUM_FAKES; i++) {
            interventions.push({
                titre: faker.lorem.sentence(4),
                description: faker.lorem.paragraph(),
                ticket_id: faker.helpers.arrayElement(ticketIds),
                date_debut: faker.date.past(),
                status: faker.helpers.arrayElement(['En_attente', 'Termine']),
            });
        }
        await dbClient.query(
            `INSERT INTO intervention (titre, description, ticket_id, date_debut, status)
             SELECT titre, description, ticket_id::BIGINT, date_debut::DATE, status::statut_intervention FROM jsonb_to_recordset($1) as x(titre TEXT, description TEXT, ticket_id BIGINT, date_debut DATE, status TEXT)`,
            [JSON.stringify(interventions)]
        );
        console.log(`-> ${NUM_FAKES} interventions created.`);

        await dbClient.query('COMMIT');
        console.log('✅ Fake data seeding complete.');

    } catch (e) {
        await dbClient.query('ROLLBACK');
        console.error('Error during fake data seeding:', e);
    } finally {
        dbClient.release();
        pool.end();
    }
}

seedFakerData();
