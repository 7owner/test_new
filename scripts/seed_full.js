// scripts/seed_full.js
// Semis complet couvrant les tables principales (users/agents/clients/sites/demandes/tickets/interventions/associations/contrats/matériel)
// Idempotent : SELECT avant INSERT, liens via ON CONFLICT DO NOTHING

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const log = (msg) => console.log(`[SEED] ${msg}`);

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS reg;', [table]);
  return !!rows[0].reg;
}

async function getOrCreate(client, table, selectIdentifier, insertCols, insertVals, returningCol = 'id') {
  const selectQuery = `SELECT ${returningCol} FROM ${table} WHERE ${Object.keys(selectIdentifier)
    .map((key, i) => `${key} = $${i + 1}`)
    .join(' AND ')}`;
  let res = await client.query(selectQuery, Object.values(selectIdentifier));
  if (res.rows.length > 0) return res.rows[0][returningCol];
  const insertQuery = `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${insertCols
    .map((_, i) => `$${i + 1}`)
    .join(', ')}) RETURNING ${returningCol};`;
  res = await client.query(insertQuery, insertVals);
  return res.rows[0][returningCol];
}

async function seed() {
  const client = await pool.connect();
  log('Démarrage du seed complet...');
  try {
    await client.query('BEGIN');

    // --- préchecks tables facultatives ---
    const hasAssociation = await tableExists(client, 'association');
    const hasContrat = await tableExists(client, 'contrat');
    const hasTicketAgent = await tableExists(client, 'ticket_agent');
    const hasTicketResponsable = await tableExists(client, 'ticket_responsable');
    const hasTicketSatisfaction = await tableExists(client, 'ticket_satisfaction');
    const hasMaterielCatalogue = await tableExists(client, 'materiel_catalogue');
    const hasMateriel = await tableExists(client, 'materiel');

    // --- utilisateurs / rôles ---
    const pwd = await bcrypt.hash('password', 10);
    const adminId = await getOrCreate(
      client,
      'users',
      { email: 'admin@example.com' },
      ['email', 'password', 'roles'],
      ['admin@example.com', pwd, '["ROLE_ADMIN"]']
    );
    const clientUserId = await getOrCreate(
      client,
      'users',
      { email: 'client@example.com' },
      ['email', 'password', 'roles'],
      ['client@example.com', pwd, '["ROLE_CLIENT"]']
    );
    log(`Users ok (admin=${adminId}, client=${clientUserId})`);

    // --- adresses ---
    const addrHq = await getOrCreate(
      client,
      'adresse',
      { ligne1: '123 La Canebière', code_postal: '13001' },
      ['libelle', 'ligne1', 'code_postal', 'ville', 'pays'],
      ['Siège Marseille', '123 La Canebière', '13001', 'Marseille', 'France']
    );
    const addrDepot = await getOrCreate(
      client,
      'adresse',
      { ligne1: '456 Boulevard du Prado', code_postal: '13008' },
      ['libelle', 'ligne1', 'code_postal', 'ville', 'pays'],
      ['Dépôt Prado', '456 Boulevard du Prado', '13008', 'Marseille', 'France']
    );
    log(`Adresses ok (${addrHq}, ${addrDepot})`);

    // --- agence / agents ---
    const agenceId = await getOrCreate(
      client,
      'agence',
      { titre: 'Agence Marseille' },
      ['titre', 'designation', 'telephone', 'email'],
      ['Agence Marseille', 'Agence Sud', '0491000000', 'marseille@exemple.fr']
    );
    const agent1User = await getOrCreate(
      client,
      'users',
      { email: 'agent1@example.com' },
      ['email', 'password', 'roles'],
      ['agent1@example.com', pwd, '["ROLE_USER"]']
    );
    const agent2User = await getOrCreate(
      client,
      'users',
      { email: 'agent2@example.com' },
      ['email', 'password', 'roles'],
      ['agent2@example.com', pwd, '["ROLE_USER"]']
    );
    const agt1 = await getOrCreate(
      client,
      'agent',
      { matricule: 'AGT001' },
      ['matricule', 'nom', 'prenom', 'email', 'tel', 'admin', 'actif', 'agence_id', 'user_id'],
      ['AGT001', 'Dupont', 'Jean', 'agent1@example.com', '0600000001', true, true, agenceId, agent1User]
    );
    const agt2 = await getOrCreate(
      client,
      'agent',
      { matricule: 'AGT002' },
      ['matricule', 'nom', 'prenom', 'email', 'tel', 'admin', 'actif', 'agence_id', 'user_id'],
      ['AGT002', 'Martin', 'Sophie', 'agent2@example.com', '0600000002', false, true, agenceId, agent2User]
    );
    log(`Agents ok (${agt1}, ${agt2})`);

    // --- clients / sites ---
    const cli1 = await getOrCreate(
      client,
      'client',
      { nom_client: 'Grand Port Maritime de Marseille' },
      ['nom_client', 'representant_email', 'user_id', 'adresse_id'],
      ['Grand Port Maritime de Marseille', 'client@example.com', clientUserId, addrHq]
    );
    const cli2 = await getOrCreate(
      client,
      'client',
      { nom_client: 'Aéroport Marseille Provence' },
      ['nom_client', 'representant_email', 'adresse_id'],
      ['Aéroport Marseille Provence', 'client2@example.com', addrDepot]
    );

    const site1 = await getOrCreate(
      client,
      'site',
      { nom_site: 'Terminal Croisières' },
      ['nom_site', 'client_id', 'adresse_id', 'statut'],
      ['Terminal Croisières', cli1, addrHq, 'Actif']
    );
    const site2 = await getOrCreate(
      client,
      'site',
      { nom_site: 'Hangar J1' },
      ['nom_site', 'client_id', 'adresse_id', 'statut'],
      ['Hangar J1', cli1, addrHq, 'Actif']
    );
    const site3 = await getOrCreate(
      client,
      'site',
      { nom_site: 'Terminal Hall A' },
      ['nom_site', 'client_id', 'adresse_id', 'statut'],
      ['Terminal Hall A', cli2, addrDepot, 'Inactif']
    );
    log(`Sites ok (${site1}, ${site2}, ${site3})`);

    // --- associations + contrats (optionnel) ---
    if (hasAssociation) {
      const assocId = await getOrCreate(
        client,
        'association',
        { titre: 'Zone Portuaire Nord' },
        ['titre', 'email_comptabilite', 'adresse_id'],
        ['Zone Portuaire Nord', 'compta-port@example.com', addrHq]
      );
      await client.query(
        'INSERT INTO association_site (association_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [assocId, site1]
      );
      await client.query(
        'INSERT INTO association_site (association_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [assocId, site2]
      );
      await client.query(
        'INSERT INTO association_responsable (association_id, agent_matricule) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [assocId, 'AGT001']
      );
      await client.query(
        'INSERT INTO association_agent (association_id, agent_matricule) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [assocId, 'AGT002']
      );
      log('Association et liens ok');
    }

    if (hasContrat) {
      const contratId = await getOrCreate(
        client,
        'contrat',
        { titre: 'Contrat maintenance GTB' },
        ['titre', 'date_debut'],
        ['Contrat maintenance GTB', '2025-01-01']
      );
      await client.query(
        'INSERT INTO contrat_site_association (contrat_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [contratId, site1]
      );
      log('Contrat lié');
    }

    // --- demandes / tickets / interventions ---
    const dem1 = await getOrCreate(
      client,
      'demande_client',
      { titre: 'GTB en panne' },
      ['client_id', 'site_id', 'titre', 'description', 'status'],
      [cli1, site1, 'GTB en panne', 'Le chauffage ne répond plus.', 'En cours de traitement']
    );
    const ticket1 = await getOrCreate(
      client,
      'ticket',
      { demande_id: dem1 },
      ['titre', 'description', 'site_id', 'demande_id', 'etat', 'responsable', 'date_debut'],
      ['Demande: GTB en panne', 'Ticket ouvert depuis la demande GTB.', site1, dem1, 'En_cours', 'AGT001', '2025-01-15']
    );
    if (hasTicketAgent) {
      await getOrCreate(
        client,
        'ticket_agent',
        { ticket_id: ticket1, agent_matricule: 'AGT001' },
        ['ticket_id', 'agent_matricule'],
        [ticket1, 'AGT001']
      );
    }
    if (hasTicketResponsable) {
      await getOrCreate(
        client,
        'ticket_responsable',
        { ticket_id: ticket1, agent_matricule: 'AGT001' },
        ['ticket_id', 'agent_matricule'],
        [ticket1, 'AGT001']
      );
    }

    // Intervention principale
    const ticketAgentId = hasTicketAgent
      ? (
          await client.query(
            'SELECT id FROM ticket_agent WHERE ticket_id=$1 AND agent_matricule=$2 LIMIT 1',
            [ticket1, 'AGT001']
          )
        ).rows[0]?.id
      : null;
    await getOrCreate(
      client,
      'intervention',
      { ticket_id: ticket1, titre: 'Diagnostic' },
      ['ticket_id', 'site_id', 'titre', 'description', 'date_debut', 'status', 'ticket_agent_id'],
      [ticket1, site1, 'Diagnostic', 'Relevé des automates GTB.', '2025-01-16', 'En_attente', ticketAgentId]
    );

    // Ticket 2 (clos)
    const dem2 = await getOrCreate(
      client,
      'demande_client',
      { titre: 'Caméra HS Hangar' },
      ['client_id', 'site_id', 'titre', 'description', 'status'],
      [cli1, site2, 'Caméra HS Hangar', 'Caméra ne transmet plus.', 'Traitee']
    );
    const ticket2 = await getOrCreate(
      client,
      'ticket',
      { demande_id: dem2 },
      ['titre', 'description', 'site_id', 'demande_id', 'etat', 'responsable', 'date_debut', 'date_fin'],
      ['Demande: Caméra HS', 'Ticket clos', site2, dem2, 'Termine', 'AGT002', '2025-02-10', '2025-02-12']
    );
    if (hasTicketAgent) {
      await getOrCreate(
        client,
        'ticket_agent',
        { ticket_id: ticket2, agent_matricule: 'AGT002' },
        ['ticket_id', 'agent_matricule'],
        [ticket2, 'AGT002']
      );
    }
    if (hasTicketResponsable) {
      await getOrCreate(
        client,
        'ticket_responsable',
        { ticket_id: ticket2, agent_matricule: 'AGT002' },
        ['ticket_id', 'agent_matricule'],
        [ticket2, 'AGT002']
      );
    }
    await getOrCreate(
      client,
      'intervention',
      { ticket_id: ticket2, titre: 'Remplacement caméra' },
      ['ticket_id', 'site_id', 'titre', 'description', 'date_debut', 'date_fin', 'status'],
      [ticket2, site2, 'Remplacement caméra', 'Caméra remplacée.', '2025-02-11', '2025-02-11', 'Termine']
    );

    if (hasTicketSatisfaction) {
      await getOrCreate(
        client,
        'ticket_satisfaction',
        { ticket_id: ticket2 },
        ['ticket_id', 'rating', 'comment'],
        [ticket2, 5, 'Service rapide et efficace.']
      );
    }

    // --- Matériel catalogue + commandes ---
    if (hasMaterielCatalogue) {
      const cat1 = await getOrCreate(
        client,
        'materiel_catalogue',
        { reference: 'REF001' },
        [
          'titre',
          'reference',
          'designation',
          'categorie',
          'fabricant',
          'fournisseur',
          'remise_fournisseur',
          'classe_materiel',
          'prix_achat',
          'commentaire',
          'metier',
          'actif',
        ],
        [
          'Capteur Solaire 450W',
          'REF001',
          'Capteur Solaire 450W',
          'Énergie',
          'SunPower',
          'Fournisseur Solaire',
          0,
          'Classe A',
          280.0,
          'Panneau PV dernière génération',
          'GTB',
          true,
        ]
      );
      const cat2 = await getOrCreate(
        client,
        'materiel_catalogue',
        { reference: 'REF002' },
        [
          'titre',
          'reference',
          'designation',
          'categorie',
          'fabricant',
          'fournisseur',
          'remise_fournisseur',
          'classe_materiel',
          'prix_achat',
          'commentaire',
          'metier',
          'actif',
        ],
        [
          'Caméra IP 4K',
          'REF002',
          'Caméra IP 4K',
          'Sécurité',
          'Hikvision',
          'Fournisseur Sécurité',
          5,
          'Classe B',
          120.0,
          'Caméra haute résolution',
          'Video',
          true,
        ]
      );

      if (hasMateriel) {
        const catRes = await client.query('SELECT * FROM materiel_catalogue WHERE reference IN ($1,$2)', ['REF001', 'REF002']);
        for (const item of catRes.rows) {
          await client.query(
            `INSERT INTO materiel (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, commande_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'A commander')
             ON CONFLICT DO NOTHING`,
            [
              item.titre,
              item.reference,
              item.designation,
              item.categorie,
              item.fabricant,
              item.fournisseur,
              item.remise_fournisseur,
              item.classe_materiel,
              item.prix_achat,
              item.commentaire,
              item.metier,
            ]
          );
        }
        log('Catalogue et commandes créés');
      }
    }

    await client.query('COMMIT');
    log('Seed complet terminé avec succès.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SEED] Erreur, rollback effectué:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((e) => console.error(e));
