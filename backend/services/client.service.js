class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class ClientService {
  constructor({ repository, bcrypt, getClientIdsForUser, userOwnsClientId, logAudit }) {
    this.repo = repository;
    this.bcrypt = bcrypt;
    this.getClientIdsForUser = getClientIdsForUser;
    this.userOwnsClientId = userOwnsClientId;
    this.logAudit = logAudit;
  }

  normalizeDemandeStatus(input) {
    const raw = String(input || '').trim();
    const key = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
    const map = {
      en_cours_de_traitement: 'En_cours',
      en_cours: 'En_cours',
      en_attente: 'En_attente',
      traitee: 'Traitee',
      rejetee: 'Rejetee',
      annulee: 'Annule',
      pas_commence: 'En_attente'
    };
    return map[key] || raw;
  }

  async getClientIdFromUser(user) {
    const ids = await this.getClientIdsForUser(user);
    return ids && ids.length ? ids[0] : null;
  }

  async registerClient(body) {
    const { email, password, nom_client, representant_nom, representant_tel, adresse_id, commentaire } = body || {};
    if (!email || !password || !nom_client) throw new HttpError(400, 'email, password, nom_client are required');

    return this.repo.withTransaction(async (cx) => {
      const exists = await this.repo.query('SELECT id FROM users WHERE email=$1', [email], cx);
      if (exists.rows[0]) throw new HttpError(409, 'User already exists');

      const hashed = await this.bcrypt.hash(password, 10);
      const u = (await this.repo.query(
        'INSERT INTO users (email, password, roles) VALUES ($1,$2,$3) RETURNING id,email,roles',
        [email, hashed, JSON.stringify(['ROLE_CLIENT'])],
        cx
      )).rows[0];

      const cli = (await this.repo.query(
        'INSERT INTO client (nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [nom_client, representant_nom || null, email, representant_tel || null, adresse_id || null, commentaire || null, u.id],
        cx
      )).rows[0];

      try { await this.repo.query('UPDATE client SET user_id=$1 WHERE id=$2', [u.id, cli.id], cx); } catch (_) {}
      return { user: u, client: cli };
    });
  }

  async getProfile(user) {
    const email = user && user.email;
    if (!email) throw new HttpError(401, 'Unauthorized');

    const c = (await this.repo.query('SELECT * FROM client WHERE representant_email=$1 OR user_id=$2 LIMIT 1', [email, user.id || null])).rows[0];
    if (c) return c;

    const rep = (await this.repo.query(
      `SELECT c.* FROM client c
       JOIN client_representant cr ON cr.client_id = c.id
       LEFT JOIN users u ON u.id = cr.user_id
       WHERE cr.user_id=$1 OR LOWER(cr.email)=LOWER($2) OR LOWER(u.email)=LOWER($2)
       LIMIT 1`,
      [user.id || null, email]
    )).rows[0];

    if (!rep) throw new HttpError(404, 'Client record not found for this user');
    return rep;
  }

  async listSites(user) {
    const clientIds = await this.getClientIdsForUser(user);
    if (!clientIds || !clientIds.length) return [];
    return (await this.repo.query('SELECT * FROM site WHERE client_id = ANY($1) ORDER BY id DESC', [clientIds])).rows;
  }

  async createSite(user, body) {
    const clientId = await this.getClientIdFromUser(user);
    if (!clientId) throw new HttpError(400, 'Client record not found for this user');

    const { nom_site, adresse_id, commentaire } = body || {};
    if (!nom_site) throw new HttpError(400, 'nom_site is required');

    return (await this.repo.query(
      'INSERT INTO site (nom_site, adresse_id, client_id, commentaire) VALUES ($1,$2,$3,$4) RETURNING *',
      [nom_site, adresse_id || null, clientId, commentaire || null]
    )).rows[0];
  }

  async getSite(user, id) {
    const clientIds = await this.getClientIdsForUser(user);
    if (!clientIds || !clientIds.length) throw new HttpError(403, 'Client not found for user.');

    const site = (await this.repo.query('SELECT * FROM site WHERE id = $1 AND client_id = ANY($2)', [id, clientIds])).rows[0];
    if (!site) throw new HttpError(404, 'Site not found or access denied.');
    return site;
  }

  async getSiteRelations(user, id) {
    const site = await this.getSite(user, id);
    const tickets = (await this.repo.query('SELECT t.id, t.titre, t.etat, t.created_at FROM ticket t WHERE t.site_id = $1 ORDER BY t.created_at DESC', [id])).rows;
    return { site, tickets };
  }

  async updateSite(user, id, body) {
    const { nom_site, commentaire } = body || {};
    if (!nom_site) throw new HttpError(400, 'Le nom du site est obligatoire.');

    const clientId = await this.getClientIdFromUser(user);
    if (!clientId) throw new HttpError(403, 'Client not found for user.');

    const siteCheck = await this.repo.query('SELECT id FROM site WHERE id = $1 AND client_id = $2', [id, clientId]);
    if (siteCheck.rows.length === 0) throw new HttpError(404, 'Site not found or access denied.');

    return (await this.repo.query(
      'UPDATE site SET nom_site = $1, commentaire = $2 WHERE id = $3 AND client_id = $4 RETURNING *',
      [nom_site, commentaire, id, clientId]
    )).rows[0];
  }

  async listMyDemandes(user) {
    const clientIds = await this.getClientIdsForUser(user);
    if (!clientIds || clientIds.length === 0) return [];

    return (await this.repo.query(
      `SELECT d.*,
              s.nom_site AS site_nom,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'travaux_id', tr.id,
                      'travaux_titre', tr.titre,
                      'travaux_etat', tr.etat,
                      'travaux_priorite', tr.priorite,
                      'travaux_date_echeance', tr.date_echeance,
                      'link_id', dct.id
                    )
                  )
                  FROM demande_client_travaux dct
                  JOIN travaux tr ON tr.id = dct.travaux_id
                  WHERE dct.demande_id = d.id
                ), '[]'::json
              ) AS travaux_associes
       FROM demande_client d
       LEFT JOIN site s ON s.id = d.site_id
       WHERE d.client_id = ANY($1)
         AND (d.status IS NULL OR d.status NOT ILIKE 'Supprim%')
       ORDER BY d.id DESC`,
      [clientIds]
    )).rows;
  }

  async getDemande(user, id) {
    const demand = (await this.repo.query('SELECT * FROM demande_client WHERE id = $1', [id])).rows[0];
    if (!demand) throw new HttpError(404, 'Demande client not found');

    const isAdmin = user.roles.includes('ROLE_ADMIN');
    if (!isAdmin) {
      const owns = await this.userOwnsClientId(user, demand.client_id);
      if (!owns) throw new HttpError(403, 'Forbidden: You do not own this demand or lack admin privileges');
    }
    return demand;
  }

  async getDemandeRelations(user, id) {
    const demand = await this.getDemande(user, id);
    const ticket = (await this.repo.query('SELECT * FROM ticket WHERE demande_id=$1 LIMIT 1', [id])).rows[0] || null;

    let responsable = null;
    if (ticket && ticket.responsable) {
      responsable = (await this.repo.query(
        'SELECT matricule, nom, prenom, email, tel, user_id FROM agent WHERE matricule=$1 LIMIT 1',
        [ticket.responsable]
      )).rows[0] || null;
    }

    const interventions = (await this.repo.query(
      `SELECT * FROM intervention
       WHERE demande_id=$1 OR ($2::bigint IS NOT NULL AND ticket_id=$2)
       ORDER BY date_debut DESC NULLS LAST, id DESC`,
      [id, ticket ? ticket.id : null]
    )).rows;

    const travaux = (await this.repo.query(
      `SELECT tr.* FROM travaux tr
       JOIN demande_client_travaux dct ON dct.travaux_id = tr.id
       WHERE dct.demande_id = $1
       ORDER BY tr.created_at DESC`,
      [id]
    )).rows;

    if (responsable && !responsable.user_id && responsable.email) {
      try {
        const u = await this.repo.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [responsable.email]);
        if (u.rows[0] && u.rows[0].id) responsable.user_id = u.rows[0].id;
      } catch (_) {}
    }

    if (!responsable || !responsable.user_id) {
      try {
        const admin = (await this.repo.query(
          "SELECT u.id, u.email, a.matricule, a.nom, a.prenom, a.tel FROM users u LEFT JOIN agent a ON a.user_id=u.id WHERE 'ROLE_ADMIN'=ANY(u.roles) LIMIT 1"
        )).rows[0];
        if (admin) {
          responsable = responsable || {};
          responsable.user_id = admin.id;
          responsable.email = responsable.email || admin.email;
          responsable.matricule = responsable.matricule || admin.matricule;
          responsable.nom = responsable.nom || admin.nom;
          responsable.prenom = responsable.prenom || admin.prenom;
          responsable.tel = responsable.tel || admin.tel;
        }
      } catch (_) {}
    }

    return { responsable, interventions, ticket, travaux };
  }

  async createDemande(user, body) {
    const { site_id, titre, description, client_id } = body || {};
    if (!titre || !description) throw new HttpError(400, 'Titre and Description are required');

    const isAdmin = user.roles.includes('ROLE_ADMIN');
    let finalClientId;

    if (isAdmin && client_id) {
      finalClientId = client_id;
    } else {
      const email = user.email;
      if (!email) throw new HttpError(401, 'Unauthorized: User email not found in token');
      const client = (await this.repo.query(
        'SELECT id FROM client WHERE user_id=$1 OR LOWER(representant_email)=LOWER($2) LIMIT 1',
        [user.id || null, email]
      )).rows[0];
      if (!client) throw new HttpError(403, 'Forbidden: No client associated with this user');
      finalClientId = client.id;
    }

    if (site_id) {
      const site = (await this.repo.query('SELECT id FROM site WHERE id=$1 AND client_id=$2', [site_id, finalClientId])).rows[0];
      if (!site) throw new HttpError(403, 'Forbidden: Site does not belong to this client');
    }

    return (await this.repo.query(
      'INSERT INTO demande_client (client_id, site_id, titre, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [finalClientId, site_id || null, titre, description]
    )).rows[0];
  }

  async updateDemande(user, id, body) {
    const { site_id, titre, description } = body || {};
    if (!titre || !description) throw new HttpError(400, 'Titre and Description are required');

    const isAdmin = user.roles.includes('ROLE_ADMIN');
    const existingDemand = (await this.repo.query('SELECT client_id, ticket_id FROM demande_client WHERE id = $1', [id])).rows[0];
    if (!existingDemand) throw new HttpError(404, 'Demande client not found');
    if (existingDemand.ticket_id) throw new HttpError(409, 'Cannot edit a client demand that has been converted to a ticket.');

    if (!isAdmin) {
      const owns = await this.userOwnsClientId(user, existingDemand.client_id);
      if (!owns) throw new HttpError(403, 'Forbidden: You do not own this demand or lack admin privileges');
    }

    if (site_id) {
      const site = (await this.repo.query('SELECT id FROM site WHERE id=$1 AND client_id=$2', [site_id, existingDemand.client_id])).rows[0];
      if (!site) throw new HttpError(403, 'Forbidden: Site does not belong to this client');
    }

    return (await this.repo.query(
      'UPDATE demande_client SET site_id=$1, titre=$2, description=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *',
      [site_id || null, titre, description, id]
    )).rows[0];
  }

  async getClientDemandeDetails(user, id) {
    const email = user && user.email;
    if (!email) throw new HttpError(401, 'Unauthorized');

    const client = (await this.repo.query('SELECT id FROM client WHERE representant_email=$1 OR user_id=$2 LIMIT 1', [email, user.id || null])).rows[0];
    if (!client) throw new HttpError(404, 'Client record not found for this user');

    const demande = (await this.repo.query(
      'SELECT d.*, s.nom_site FROM demande_client d LEFT JOIN site s ON d.site_id = s.id WHERE d.id=$1 AND d.client_id=$2',
      [id, client.id]
    )).rows[0];
    if (!demande) throw new HttpError(404, 'Demande not found or access denied');

    let ticket = null;
    let responsable = null;
    let interventions = [];

    if (demande.ticket_id) {
      ticket = (await this.repo.query('SELECT * FROM ticket WHERE id=$1', [demande.ticket_id])).rows[0] || null;
      if (ticket) {
        if (ticket.responsable) {
          responsable = (await this.repo.query('SELECT user_id, matricule, nom, prenom, email, tel FROM agent WHERE matricule=$1', [ticket.responsable])).rows[0] || null;
        }
        interventions = (await this.repo.query('SELECT * FROM intervention WHERE ticket_id=$1 ORDER BY date_debut DESC', [ticket.id])).rows;
      }
    }

    if (!responsable) {
      responsable = (await this.repo.query("SELECT user_id, matricule, nom, prenom, email, tel FROM agent WHERE email = 'maboujunior777@gmail.com' LIMIT 1")).rows[0] || null;
      if (responsable && !responsable.user_id && responsable.email) {
        try {
          const u = await this.repo.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [responsable.email]);
          responsable.user_id = (u.rows[0] || {}).id || null;
        } catch (_) {}
      }
    }

    return { demande, ticket, responsable, interventions };
  }

  async linkDemandeTravaux(demandeId, travauxId) {
    if (!travauxId) throw new HttpError(400, 'travaux_id is required');

    const d = (await this.repo.query('SELECT id FROM demande_client WHERE id=$1', [demandeId])).rows[0];
    if (!d) throw new HttpError(404, 'Demande client not found');

    const t = (await this.repo.query('SELECT id FROM travaux WHERE id=$1', [travauxId])).rows[0];
    if (!t) throw new HttpError(404, 'Travaux not found');

    const r = await this.repo.query(
      'INSERT INTO demande_client_travaux (demande_id, travaux_id) VALUES ($1,$2) ON CONFLICT (demande_id, travaux_id) DO NOTHING RETURNING *',
      [demandeId, travauxId]
    );
    return r.rows[0] || { demande_id: Number(demandeId), travaux_id: Number(travauxId) };
  }

  async unlinkDemandeTravaux(id) {
    const r = await this.repo.query('DELETE FROM demande_client_travaux WHERE id=$1 RETURNING *', [id]);
    if (!r.rows[0]) throw new HttpError(404, 'Link not found');
    return { message: 'Link removed', deleted: r.rows[0] };
  }

  async listDemandesAdmin(query) {
    const { client, status, sort, direction, include_deleted, type } = query || {};
    const hasTypeDemande = (await this.repo.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='demande_client'
         AND column_name='type_demande'
       LIMIT 1`
    )).rows.length > 0;

    let sql = `
      SELECT d.*, c.nom_client, c.representant_email, s.nom_site
      ${hasTypeDemande ? ', d.type_demande' : ''}
      FROM demande_client d
      LEFT JOIN client c ON d.client_id=c.id
      LEFT JOIN site s   ON d.site_id=s.id
    `;
    const params = [];
    const conditions = [];

    if (client) {
      conditions.push(`(c.nom_client ILIKE $${params.length + 1} OR c.representant_email ILIKE $${params.length + 1})`);
      params.push(`%${client}%`);
    }
    if (status) {
      const normalizedStatus = this.normalizeDemandeStatus(status);
      conditions.push(`d.status = $${params.length + 1}`);
      params.push(normalizedStatus);
    } else if (!String(include_deleted || '').toLowerCase().startsWith('t')) {
      conditions.push("d.status NOT ILIKE 'Supprim%'");
    }
    if (type && hasTypeDemande) {
      conditions.push(`d.type_demande = $${params.length + 1}`);
      params.push(type);
    }

    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;

    let orderBy = 'd.created_at';
    let orderDirection = 'DESC';
    if (sort) {
      const sortMap = {
        id: 'd.id',
        nom_client: 'c.nom_client',
        site_id: 'd.site_id',
        status: 'd.status',
        created_at: 'd.created_at',
        ...(hasTypeDemande ? { type_demande: 'd.type_demande' } : {})
      };
      if (sortMap[sort]) orderBy = sortMap[sort];
    }
    if (direction && ['asc', 'desc'].includes(direction.toLowerCase())) orderDirection = direction.toUpperCase();

    sql += ` ORDER BY ${orderBy} ${orderDirection}`;
    return (await this.repo.query(sql, params)).rows;
  }

  async updateDemandeStatus(id, body) {
    const { status, commentaire } = body || {};
    const normalizedStatus = this.normalizeDemandeStatus(status);
    const allowed = ['En_attente', 'En_cours', 'Traitee', 'Rejetee', 'Annule'];
    if (!allowed.includes(normalizedStatus)) throw new HttpError(400, 'Invalid status');

    const updateFields = ['status=$1', 'updated_at=CURRENT_TIMESTAMP'];
    const queryParams = [normalizedStatus];

    if (normalizedStatus === 'Rejetee' || normalizedStatus === 'Annule') {
      updateFields.push(`commentaire=$${queryParams.length + 1}`);
      queryParams.push(commentaire || null);
    }

    queryParams.push(id);
    const finalQuery = `UPDATE demande_client SET ${updateFields.join(', ')} WHERE id=$${queryParams.length} RETURNING *`;
    const r = await this.repo.query(finalQuery, queryParams);
    if (!r.rows[0]) throw new HttpError(404, 'Not found');
    return r.rows[0];
  }

  async deleteDemande(id, justification, user) {
    if (!justification) throw new HttpError(400, 'Justification is required');

    return this.repo.withTransaction(async (cx) => {
      const d = (await this.repo.query('SELECT ticket_id FROM demande_client WHERE id=$1 FOR UPDATE', [id], cx)).rows[0];
      if (!d) throw new HttpError(404, 'Demande not found');
      if (d.ticket_id) throw new HttpError(409, 'This demand cannot be deleted because it has been converted into a ticket.');

      await this.logAudit('demande_client', id, 'DELETE', user.email, { justification });
      await this.repo.query("UPDATE demande_client SET status='Supprimee', commentaire=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [justification, id], cx);
      return { message: 'Demand marked as deleted.' };
    });
  }

  async listDeletedDemandes() {
    const r = await this.repo.query(
      `SELECT d.id, d.commentaire, d.status, d.updated_at, c.nom_client, c.representant_email, s.nom_site, a.actor_email, a.details
       FROM demande_client d
       LEFT JOIN client c ON c.id=d.client_id
       LEFT JOIN site s ON s.id=d.site_id
       LEFT JOIN audit_log a ON a.entity='demande_client' AND a.action='DELETE' AND a.entity_id=CAST(d.id AS TEXT)
       WHERE d.status ILIKE 'Supprim%'
       ORDER BY d.updated_at DESC
       LIMIT 200`
    );

    return (r.rows || []).map(row => {
      let justification = row.commentaire || null;
      if (!justification) {
        try {
          const d = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
          justification = d && d.justification ? d.justification : null;
        } catch (_) {}
      }
      return {
        id: row.id,
        actor_email: row.actor_email,
        justification,
        nom_client: row.nom_client,
        representant_email: row.representant_email,
        nom_site: row.nom_site,
        updated_at: row.updated_at
      };
    });
  }

  async restoreDemande(id) {
    const r = await this.repo.query("UPDATE demande_client SET status='En_cours', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status ILIKE 'Supprim%' RETURNING *", [id]);
    if (!r.rows[0]) throw new HttpError(404, 'Demande not found or not deleted');
    return r.rows[0];
  }

  async convertToTicket(id, user) {
    return this.repo.withTransaction(async (cx) => {
      let connectedUserMatricule = user.matricule || null;

      const d = (await this.repo.query('SELECT * FROM demande_client WHERE id=$1 FOR UPDATE', [id], cx)).rows[0];
      if (!d) throw new HttpError(404, 'Demande not found');
      if (d.ticket_id) throw new HttpError(409, 'Demande already converted to ticket');

      if (!connectedUserMatricule && user && user.email) {
        const agentRow = (await this.repo.query('SELECT matricule FROM agent WHERE lower(email)=lower($1) LIMIT 1', [user.email], cx)).rows[0];
        connectedUserMatricule = (agentRow || {}).matricule || null;
      }

      let doe_id = null;
      let affaire_id = null;
      if (d.site_id) {
        const rel = (await this.repo.query('SELECT id, affaire_id FROM doe WHERE site_id=$1 ORDER BY id ASC LIMIT 1', [d.site_id], cx)).rows[0];
        if (rel) {
          doe_id = rel.id;
          affaire_id = rel.affaire_id || null;
        }
      }

      const titre = `Demande client #${d.id}`;
      const desc = d.description || null;
      const t = (await this.repo.query(
        'INSERT INTO ticket (doe_id, affaire_id, site_id, responsable, titre, description, etat) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [doe_id, affaire_id, d.site_id || null, connectedUserMatricule, titre, desc, 'Pas_commence'],
        cx
      )).rows[0];

      if (connectedUserMatricule) {
        await this.repo.query(
          'INSERT INTO ticket_responsable (ticket_id, agent_matricule, role) VALUES ($1, $2, $3)',
          [t.id, connectedUserMatricule, 'Principal'],
          cx
        );
        await this.repo.query(
          'INSERT INTO ticket_agent (ticket_id, agent_matricule) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [t.id, connectedUserMatricule],
          cx
        );
      }

      await this.repo.query("UPDATE demande_client SET status='Traitee', updated_at=CURRENT_TIMESTAMP, ticket_id=$1 WHERE id=$2", [t.id, id], cx);

      return { ticket: t, demande: { id: d.id, status: 'Traitee', ticket_id: t.id } };
    });
  }
}

module.exports = { ClientService, HttpError };