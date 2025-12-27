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

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 LIMIT 1;`,
    [table, column]
  );
  return rows.length > 0;
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
    const hasMessagerie = await tableExists(client, 'messagerie');
    const hasMessagerieAttachment = await tableExists(client, 'messagerie_attachment');
    const hasClientRepresentant = await tableExists(client, 'client_representant');
    const hasSiteAgent = await tableExists(client, 'site_agent');
    const hasSiteResponsable = await tableExists(client, 'site_responsable');
    const hasInterventionMateriel = await tableExists(client, 'intervention_materiel');
    const hasRendezvous = await tableExists(client, 'rendezvous');
    const hasDocuments = await tableExists(client, 'documents_repertoire');
    const hasAchat = await tableExists(client, 'achat');
    const hasFacture = await tableExists(client, 'facture');
    const hasReglement = await tableExists(client, 'reglement');
    const hasFonction = await tableExists(client, 'fonction');
    const hasAgentFonction = await tableExists(client, 'agent_fonction');
    const hasEquipe = await tableExists(client, 'equipe');
    const hasAgentEquipe = await tableExists(client, 'agent_equipe');
    const hasAgenceMembre = await tableExists(client, 'agence_membre');
    const hasAffaire = await tableExists(client, 'affaire');
    const hasDoe = await tableExists(client, 'doe');
    const hasSiteAffaire = await tableExists(client, 'site_affaire');
    const hasTicketAgentId = await columnExists(client, 'intervention', 'ticket_agent_id');
    const statusCol =
      (await columnExists(client, 'intervention', 'status')) ? 'status' :
      (await columnExists(client, 'intervention', 'statut')) ? 'statut' :
      (await columnExists(client, 'intervention', 'statut_intervention')) ? 'statut_intervention' :
      (await columnExists(client, 'intervention', 'etat')) ? 'etat' :
      null;

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
    const agent3User = await getOrCreate(
      client,
      'users',
      { email: 'agent3@example.com' },
      ['email', 'password', 'roles'],
      ['agent3@example.com', pwd, '["ROLE_USER"]']
    );
    const agt1 = await getOrCreate(
      client,
      'agent',
      { matricule: 'AGT001' },
      ['matricule', 'nom', 'prenom', 'email', 'tel', 'admin', 'actif', 'agence_id', 'user_id'],
      ['AGT001', 'Dupont', 'Jean', 'agent1@example.com', '0600000001', true, true, agenceId, agent1User],
      'matricule'
    );
    const agt2 = await getOrCreate(
      client,
      'agent',
      { matricule: 'AGT002' },
      ['matricule', 'nom', 'prenom', 'email', 'tel', 'admin', 'actif', 'agence_id', 'user_id'],
      ['AGT002', 'Martin', 'Sophie', 'agent2@example.com', '0600000002', false, true, agenceId, agent2User],
      'matricule'
    );
    const agt3 = await getOrCreate(
      client,
      'agent',
      { matricule: 'AGT003' },
      ['matricule', 'nom', 'prenom', 'email', 'tel', 'admin', 'actif', 'agence_id', 'user_id'],
      ['AGT003', 'Durand', 'Paul', 'agent3@example.com', '0600000003', false, true, agenceId, agent3User],
      'matricule'
    );

    if (hasFonction) {
      const fnTech = await getOrCreate(client, 'fonction', { code: 'TECH' }, ['code', 'libelle'], ['TECH', 'Technicien']);
      const fnChef = await getOrCreate(client, 'fonction', { code: 'CHEF' }, ['code', 'libelle'], ['CHEF', 'Chef de projet']);
      if (hasAgentFonction) {
        await getOrCreate(client, 'agent_fonction', { agent_matricule: 'AGT001', fonction_id: fnChef }, ['agent_matricule', 'fonction_id', 'principal'], ['AGT001', fnChef, true]);
        await getOrCreate(client, 'agent_fonction', { agent_matricule: 'AGT002', fonction_id: fnTech }, ['agent_matricule', 'fonction_id', 'principal'], ['AGT002', fnTech, true]);
        await getOrCreate(client, 'agent_fonction', { agent_matricule: 'AGT003', fonction_id: fnTech }, ['agent_matricule', 'fonction_id', 'principal'], ['AGT003', fnTech, true]);
      }
    }
    if (hasEquipe) {
      const eq1 = await getOrCreate(client, 'equipe', { nom: 'Equipe Sud' }, ['agence_id', 'nom'], [agenceId, 'Equipe Sud']);
      const eq2 = await getOrCreate(client, 'equipe', { nom: 'Equipe Projet' }, ['agence_id', 'nom'], [agenceId, 'Equipe Projet']);
      if (hasAgentEquipe) {
        await getOrCreate(client, 'agent_equipe', { equipe_id: eq1, agent_matricule: 'AGT001' }, ['equipe_id', 'agent_matricule'], [eq1, 'AGT001']);
        await getOrCreate(client, 'agent_equipe', { equipe_id: eq1, agent_matricule: 'AGT002' }, ['equipe_id', 'agent_matricule'], [eq1, 'AGT002']);
        await getOrCreate(client, 'agent_equipe', { equipe_id: eq2, agent_matricule: 'AGT003' }, ['equipe_id', 'agent_matricule'], [eq2, 'AGT003']);
      }
      if (hasAgenceMembre) {
        await getOrCreate(client, 'agence_membre', { agence_id: agenceId, agent_matricule: 'AGT001' }, ['agence_id', 'agent_matricule', 'role'], [agenceId, 'AGT001', 'Admin']);
        await getOrCreate(client, 'agence_membre', { agence_id: agenceId, agent_matricule: 'AGT002' }, ['agence_id', 'agent_matricule', 'role'], [agenceId, 'AGT002', 'Membre']);
        await getOrCreate(client, 'agence_membre', { agence_id: agenceId, agent_matricule: 'AGT003' }, ['agence_id', 'agent_matricule', 'role'], [agenceId, 'AGT003', 'Membre']);
      }
    }
    log(`Agents ok (${agt1}, ${agt2}, ${agt3})`);

    // --- clients / sites ---
    // représentant dédié (si modèle client_representant existe)
    let repUserId = null;
    if (hasClientRepresentant) {
      repUserId = await getOrCreate(
        client,
        'users',
        { email: 'representant@example.com' },
        ['email', 'password', 'roles'],
        ['representant@example.com', pwd, '["ROLE_CLIENT"]']
      );
    }

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

    // Client représentants (nouveau modèle)
    if (hasClientRepresentant && repUserId) {
      const cols = ['client_id', 'user_id'];
      const vals1 = [cli1, repUserId];
      const vals2 = [cli2, repUserId];
      if (await columnExists(client, 'client_representant', 'nom')) { cols.push('nom'); vals1.push('Marie Responsable'); vals2.push('Marie Responsable'); }
      if (await columnExists(client, 'client_representant', 'email')) { cols.push('email'); vals1.push('representant@example.com'); vals2.push('representant@example.com'); }
      if (await columnExists(client, 'client_representant', 'tel')) { cols.push('tel'); vals1.push('0611223344'); vals2.push('0611223344'); }
      if (await columnExists(client, 'client_representant', 'fonction')) { cols.push('fonction'); vals1.push('Responsable site'); vals2.push('Responsable site'); }

      await getOrCreate(
        client,
        'client_representant',
        { client_id: cli1, user_id: repUserId },
        cols,
        vals1
      );
      await getOrCreate(
        client,
        'client_representant',
        { client_id: cli2, user_id: repUserId },
        cols,
        vals2
      );
      log('Représentants client liés');
    }

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

    // Site agents/responsables
    if (hasSiteAgent) {
      await getOrCreate(client, 'site_agent', { site_id: site1, agent_matricule: 'AGT001' }, ['site_id', 'agent_matricule'], [site1, 'AGT001']);
      await getOrCreate(client, 'site_agent', { site_id: site2, agent_matricule: 'AGT002' }, ['site_id', 'agent_matricule'], [site2, 'AGT002']);
      await getOrCreate(client, 'site_agent', { site_id: site3, agent_matricule: 'AGT003' }, ['site_id', 'agent_matricule'], [site3, 'AGT003']);
    }
    if (hasSiteResponsable) {
      await getOrCreate(client, 'site_responsable', { site_id: site1, agent_matricule: 'AGT001' }, ['site_id', 'agent_matricule', 'role'], [site1, 'AGT001', 'Responsable']);
      await getOrCreate(client, 'site_responsable', { site_id: site2, agent_matricule: 'AGT002' }, ['site_id', 'agent_matricule', 'role'], [site2, 'AGT002', 'Responsable']);
    }

    // Affaires / DOE
    let affaire1 = null;
    let affaire2 = null;
    let doe1 = null;
    let doe2 = null;
    if (hasAffaire) {
      const hasNumeroAffaire = await columnExists(client, 'affaire', 'numero_affaire');
      const affCols = ['nom_affaire', 'client_id', 'description'];
      const affVals1 = ['AFF-2025-GTB', cli1, 'Affaire GTB portuaire'];
      const affVals2 = ['AFF-2025-CAM', cli1, 'Surveillance vidéo Hangar'];
      if (hasNumeroAffaire) { affCols.push('numero_affaire'); affVals1.push('NUM-GTB-001'); affVals2.push('NUM-CAM-002'); }
      affaire1 = await getOrCreate(client, 'affaire', { nom_affaire: 'AFF-2025-GTB' }, affCols, affVals1);
      affaire2 = await getOrCreate(client, 'affaire', { nom_affaire: 'AFF-2025-CAM' }, affCols, affVals2);
    }
    if (hasDoe) {
      const doeCols = ['site_id', 'affaire_id', 'titre', 'description'];
      doe1 = await getOrCreate(client, 'doe', { titre: 'DOE GTB Terminal' }, doeCols, [site1, affaire1, 'DOE GTB Terminal', 'Dossier GTB complet']);
      doe2 = await getOrCreate(client, 'doe', { titre: 'DOE Caméras Hangar' }, doeCols, [site2, affaire2, 'DOE Caméras Hangar', 'Dossier caméras']);
    }
    if (hasSiteAffaire && affaire1 && affaire2) {
      await getOrCreate(client, 'site_affaire', { site_id: site1, affaire_id: affaire1 }, ['site_id', 'affaire_id'], [site1, affaire1]);
      await getOrCreate(client, 'site_affaire', { site_id: site2, affaire_id: affaire2 }, ['site_id', 'affaire_id'], [site2, affaire2]);
    }

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
      ['titre', 'description', 'site_id', 'demande_id', 'etat', 'responsable', 'date_debut', ...(hasDoe ? ['doe_id'] : []), ...(hasAffaire ? ['affaire_id'] : [])],
      ['Demande: GTB en panne', 'Ticket ouvert depuis la demande GTB.', site1, dem1, 'En_cours', 'AGT001', '2025-01-15', ...(hasDoe ? [doe1] : []), ...(hasAffaire ? [affaire1] : [])]
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
    {
      const cols = ['ticket_id', 'site_id', 'titre', 'description', 'date_debut'];
      const vals = [ticket1, site1, 'Diagnostic', 'Relevé des automates GTB.', '2025-01-16'];
      if (statusCol) { cols.push(statusCol); vals.push('En_attente'); }
      if (hasTicketAgentId) { cols.push('ticket_agent_id'); vals.push(ticketAgentId); }
      await getOrCreate(
        client,
        'intervention',
        { ticket_id: ticket1, titre: 'Diagnostic' },
        cols,
        vals
      );
    }

    // Intervention secondaire ticket1
    {
      const cols = ['ticket_id', 'site_id', 'titre', 'description', 'date_debut'];
      const vals = [ticket1, site1, 'Correction GTB', 'Remplacement automate GTB.', '2025-01-20'];
      if (statusCol) { cols.push(statusCol); vals.push('En_attente'); }
      if (hasTicketAgentId) { cols.push('ticket_agent_id'); vals.push(ticketAgentId); }
      await getOrCreate(
        client,
        'intervention',
        { ticket_id: ticket1, titre: 'Correction GTB' },
        cols,
        vals
      );
    }

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
      ['titre', 'description', 'site_id', 'demande_id', 'etat', 'responsable', 'date_debut', 'date_fin', ...(hasDoe ? ['doe_id'] : []), ...(hasAffaire ? ['affaire_id'] : [])],
      ['Demande: Caméra HS', 'Ticket clos', site2, dem2, 'Termine', 'AGT002', '2025-02-10', '2025-02-12', ...(hasDoe ? [doe2] : []), ...(hasAffaire ? [affaire2] : [])]
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
    {
      const cols = ['ticket_id', 'site_id', 'titre', 'description', 'date_debut', 'date_fin'];
      const vals = [ticket2, site2, 'Remplacement caméra', 'Caméra remplacée.', '2025-02-11', '2025-02-11'];
      if (statusCol) { cols.push(statusCol); vals.push('Termine'); }
      await getOrCreate(
        client,
        'intervention',
        { ticket_id: ticket2, titre: 'Remplacement caméra' },
        cols,
        vals
      );
    }

    // Ticket 3 (site 3, ouvert)
    const dem3 = await getOrCreate(
      client,
      'demande_client',
      { titre: 'Accès badge Hall A' },
      ['client_id', 'site_id', 'titre', 'description', 'status'],
      [cli2, site3, 'Accès badge Hall A', 'Badge ne fonctionne pas.', 'En cours de traitement']
    );
    const ticket3 = await getOrCreate(
      client,
      'ticket',
      { titre: 'Badge Hall A' },
      ['titre', 'description', 'site_id', 'demande_id', 'etat', 'responsable', 'date_debut'],
      ['Badge Hall A', 'Création d\'un nouvel accès.', site3, dem3, 'En_cours', 'AGT003', '2025-03-05']
    );
    if (hasTicketAgent) {
      await getOrCreate(client, 'ticket_agent', { ticket_id: ticket3, agent_matricule: 'AGT003' }, ['ticket_id', 'agent_matricule'], [ticket3, 'AGT003']);
    }
    if (hasTicketResponsable) {
      await getOrCreate(client, 'ticket_responsable', { ticket_id: ticket3, agent_matricule: 'AGT003' }, ['ticket_id', 'agent_matricule'], [ticket3, 'AGT003']);
    }
    {
      const cols = ['ticket_id', 'site_id', 'titre', 'description', 'date_debut'];
      const vals = [ticket3, site3, 'Pose lecteur badge', 'Installation d\'un nouveau lecteur.', '2025-03-06'];
      if (statusCol) { cols.push(statusCol); vals.push('En_attente'); }
      await getOrCreate(client, 'intervention', { ticket_id: ticket3, titre: 'Pose lecteur badge' }, cols, vals);
    }

    if (hasTicketSatisfaction) {
      await getOrCreate(
        client,
        'ticket_satisfaction',
        { ticket_id: ticket2 },
        ['ticket_id', 'rating', 'comment'],
        [ticket2, 5, 'Service rapide et efficace.']
      );
    }

    // --- Messagerie (conversations & messages) ---
    if (hasMessagerie) {
      const hasTicketFk = await columnExists(client, 'messagerie', 'ticket_id');
      const hasDemandeFk = await columnExists(client, 'messagerie', 'demande_id');
      const hasClientFk = await columnExists(client, 'messagerie', 'client_id');

      async function insertMessage(selectKey, cols, vals) {
        // selectKey: object to identify an existing message (conversation_id + body)
        return getOrCreate(client, 'messagerie', selectKey, cols, vals);
      }

      // Conversation liée à la demande 1 / ticket 1
      const convoDem1 = `demande-${dem1}`;
      const baseCols = ['conversation_id', 'sender_id', 'receiver_id', 'body'];
      const colSet1 = [...baseCols];
      const valSet1 = [convoDem1, adminId, clientUserId, 'Bonjour, nous avons bien reçu votre demande GTB.'];
      if (hasTicketFk) { colSet1.push('ticket_id'); valSet1.push(ticket1); }
      if (hasDemandeFk) { colSet1.push('demande_id'); valSet1.push(dem1); }
      if (hasClientFk) { colSet1.push('client_id'); valSet1.push(cli1); }
      await insertMessage({ conversation_id: convoDem1, body: valSet1[3] }, colSet1, valSet1);

      const colSet2 = [...baseCols];
      const valSet2 = [convoDem1, clientUserId, adminId, 'Merci, pouvez-vous intervenir cette semaine ?'];
      if (hasTicketFk) { colSet2.push('ticket_id'); valSet2.push(ticket1); }
      if (hasDemandeFk) { colSet2.push('demande_id'); valSet2.push(dem1); }
      if (hasClientFk) { colSet2.push('client_id'); valSet2.push(cli1); }
      await insertMessage({ conversation_id: convoDem1, body: valSet2[3] }, colSet2, valSet2);

      // Conversation liée au ticket 2 (caméra)
      const convoTicket2 = `ticket-${ticket2}`;
      const colSet3 = [...baseCols];
      const valSet3 = [convoTicket2, adminId, clientUserId, 'Ticket caméra HS traité, retour à la normale.'];
      if (hasTicketFk) { colSet3.push('ticket_id'); valSet3.push(ticket2); }
      if (hasDemandeFk) { colSet3.push('demande_id'); valSet3.push(dem2); }
      if (hasClientFk) { colSet3.push('client_id'); valSet3.push(cli1); }
      const msgId = await insertMessage({ conversation_id: convoTicket2, body: valSet3[3] }, colSet3, valSet3);

      // Attachement de test
      if (hasMessagerieAttachment) {
        await client.query(
          'INSERT INTO messagerie_attachment (message_id, file_blob, file_name, file_type, file_size) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
          [msgId, Buffer.from('Rapport intervention caméra', 'utf8'), 'rapport.txt', 'text/plain', Buffer.byteLength('Rapport intervention caméra')]
        );
      }

      log('Messagerie seedée');
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
        if (hasInterventionMateriel) {
          const matRes = await client.query('SELECT id FROM materiel ORDER BY id ASC LIMIT 2');
          const mats = matRes.rows;
          const intRes = await client.query('SELECT id FROM intervention WHERE ticket_id IN ($1,$2) ORDER BY id ASC', [ticket1, ticket2]);
          const ints = intRes.rows;
          if (mats.length && ints.length) {
            await client.query(
              'INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
              [ints[0].id, mats[0].id, 1, 'Utilisé pour diagnostic']
            );
          }
          if (mats.length > 1 && ints.length > 1) {
            await client.query(
              'INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
              [ints[1].id, mats[1].id, 2, 'Pose caméra']
            );
          }
        }
      }
    }

    // Rendezvous
    if (hasRendezvous) {
      await getOrCreate(
        client,
        'rendezvous',
        { titre: 'RDV GTB Janvier' },
        ['titre', 'description', 'date_rdv', 'date_fin', 'statut', 'sujet', 'intervention_id', 'site_id'],
        ['RDV GTB Janvier', 'Planification diagnostic', '2025-01-15 09:00', '2025-01-15 10:00', 'Planifie', 'intervention', 1, site1]
      );
      await getOrCreate(
        client,
        'rendezvous',
        { titre: 'RDV Caméra' },
        ['titre', 'description', 'date_rdv', 'date_fin', 'statut', 'sujet', 'intervention_id', 'site_id'],
        ['RDV Caméra', 'Remplacement caméra', '2025-02-11 14:00', '2025-02-11 15:00', 'Planifie', 'intervention', 2, site2]
      );
    }

    // Documents
    if (hasDocuments) {
      const docCols = ['cible_type', 'cible_id', 'nature', 'nom_fichier'];
      const docExtra = [];
      if (await columnExists(client, 'documents_repertoire', 'type_mime')) { docCols.push('type_mime'); docExtra.push('application/pdf'); }
      if (await columnExists(client, 'documents_repertoire', 'taille_octets')) { docCols.push('taille_octets'); docExtra.push(12345); }
      await client.query(
        `INSERT INTO documents_repertoire (${docCols.join(',')}) VALUES ($1,$2,$3,$4${docExtra.length ? ',' + docExtra.map((_, i) => `$${i + 5}`).join(',') : ''}) ON CONFLICT DO NOTHING`,
        ['Ticket', ticket1, 'Document', 'rapport_ticket1.pdf', ...docExtra]
      );
      await client.query(
        `INSERT INTO documents_repertoire (${docCols.join(',')}) VALUES ($1,$2,$3,$4${docExtra.length ? ',' + docExtra.map((_, i) => `$${i + 5}`).join(',') : ''}) ON CONFLICT DO NOTHING`,
        ['Site', site1, 'Document', 'plan_site1.pdf', ...docExtra]
      );
    }

    // Financier
    if (hasAchat) {
      const achat1 = await getOrCreate(client, 'achat', { reference: 'ACH-GTB-001' }, ['reference', 'site_id', 'statut'], ['ACH-GTB-001', site1, 'Commande']);
      if (hasFacture) {
        const hasRefFacture = await columnExists(client, 'facture', 'reference');
        const factCols = hasRefFacture ? ['reference', 'client_id', 'statut'] : ['client_id', 'statut'];
        const factVals = hasRefFacture ? ['FAC-GTB-001', cli1, 'Emise'] : [cli1, 'Emise'];
        const facture1 = await getOrCreate(client, 'facture', hasRefFacture ? { reference: 'FAC-GTB-001' } : { client_id: cli1, statut: 'Emise' }, factCols, factVals);
        if (hasReglement) {
          await getOrCreate(client, 'reglement', { facture_id: facture1, montant: 1500 }, ['facture_id', 'montant'], [facture1, 1500]);
        }
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
