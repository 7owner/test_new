class TicketsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findAll() {
    return (await this.pool.query('SELECT t.*, dc.titre as demande_titre, s.nom_site as site_nom FROM ticket t LEFT JOIN demande_client dc ON t.demande_id = dc.id LEFT JOIN site s ON t.site_id = s.id ORDER BY t.id ASC')).rows;
  }

  async findById(id) {
    return (await this.pool.query('SELECT * FROM ticket WHERE id = $1', [id])).rows[0] || null;
  }

  async findDoeById(id) {
    return (await this.pool.query('SELECT * FROM doe WHERE id=$1', [id])).rows[0] || null;
  }

  async findAffaireById(id) {
    return (await this.pool.query('SELECT * FROM affaire WHERE id=$1', [id])).rows[0] || null;
  }

  async findSiteById(id) {
    return (await this.pool.query('SELECT * FROM site WHERE id=$1', [id])).rows[0] || null;
  }

  async findDemandeById(id) {
    return (await this.pool.query('SELECT * FROM demande_client WHERE id=$1', [id])).rows[0] || null;
  }

  async findInterventionsByTicket(id) {
    return (await this.pool.query('SELECT * FROM intervention WHERE ticket_id=$1 ORDER BY id DESC', [id])).rows;
  }

  async findDocumentsByTicket(id) {
    return (await this.pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Ticket' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
  }

  async findImagesByTicket(id) {
    return (await this.pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Ticket' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
  }

  async findResponsablesByTicket(id) {
    return (await this.pool.query(
      `SELECT tr.id,
              tr.role,
              tr.date_debut,
              tr.date_fin,
              tr.agent_matricule,
              a.nom,
              a.prenom,
              a.email
       FROM ticket_responsable tr
       LEFT JOIN agent a ON a.matricule = tr.agent_matricule
       WHERE tr.ticket_id = $1
       ORDER BY tr.id DESC`,
      [id]
    )).rows;
  }

  async findAgentsByTicket(id) {
    return (await this.pool.query(
      `SELECT ta.agent_matricule, ta.date_debut, ta.date_fin,
              a.nom, a.prenom
       FROM ticket_agent ta
       JOIN agent a ON a.matricule = ta.agent_matricule
       WHERE ta.ticket_id=$1
       ORDER BY COALESCE(ta.date_debut, CURRENT_TIMESTAMP) DESC, ta.id DESC`,
      [id]
    )).rows;
  }

  async findSatisfactionByTicket(id) {
    return (await this.pool.query('SELECT rating, comment, envoieok FROM ticket_satisfaction WHERE ticket_id=$1', [id])).rows[0] || null;
  }

  async findDoeSiteId(doeId) {
    return (await this.pool.query('SELECT site_id FROM doe WHERE id=$1', [doeId])).rows[0] || null;
  }

  async createTicket(payload) {
    const { doe_id, affaire_id, site_id, demande_id, titre, description, etat, responsable, date_debut, date_fin } = payload;
    return (await this.pool.query(
      "INSERT INTO ticket (doe_id, affaire_id, site_id, demande_id, titre, description, etat, responsable, date_debut, date_fin) " +
      "VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::etat_rapport,'Pas_commence'::etat_rapport),$8,COALESCE($9::timestamp, CURRENT_TIMESTAMP),$10::timestamp) RETURNING *",
      [doe_id, affaire_id, site_id || null, demande_id || null, titre || null, description || null, etat || null, responsable || null, date_debut || null, date_fin || null]
    )).rows[0];
  }

  async updateTicketTransaction(id, body) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const oldRow = (await client.query('SELECT responsable FROM ticket WHERE id = $1', [id])).rows[0] || null;
      const oldResponsable = oldRow ? oldRow.responsable : null;
      const { titre, description, responsable, doe_id, affaire_id, site_id, demande_id, etat } = body;
      const result = await client.query(
        'UPDATE ticket SET titre = COALESCE($1, titre), description = COALESCE($2, description), responsable = COALESCE($3, responsable), doe_id = COALESCE($4, doe_id), affaire_id = COALESCE($5, affaire_id), site_id = COALESCE($6, site_id), demande_id = COALESCE($7, demande_id), etat = COALESCE($8::etat_rapport, etat) WHERE id = $9 RETURNING *',
        [titre, description, responsable, doe_id, affaire_id, site_id || null, demande_id || null, etat, id]
      );
      if (!result.rows.length) {
        await client.query('ROLLBACK');
        return { updated: null, oldResponsable: null };
      }
      await client.query('COMMIT');
      return { updated: result.rows[0], oldResponsable };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }

  async insertResponsableHistory(id, oldResponsable, newResponsable, modifierMatricule) {
    await this.pool.query(
      'INSERT INTO ticket_historique_responsable (ticket_id, ancien_responsable_matricule, nouveau_responsable_matricule, modifie_par_matricule) VALUES ($1, $2, $3, $4)',
      [id, oldResponsable, newResponsable, modifierMatricule]
    );
  }

  async deleteTicketById(id) {
    await this.pool.query('DELETE FROM ticket WHERE id = $1', [id]);
  }

  async findAgentMatriculeByEmail(email) {
    return (await this.pool.query('SELECT matricule FROM agent WHERE email=$1 LIMIT 1', [email])).rows[0] || null;
  }

  async findTicketEtat(id) {
    return (await this.pool.query('SELECT etat FROM ticket WHERE id=$1', [id])).rows[0] || null;
  }

  async findTicketResponsable(id) {
    return (await this.pool.query('SELECT responsable FROM ticket WHERE id=$1', [id])).rows[0] || null;
  }

  async setTicketResponsable(id, matricule) {
    return (await this.pool.query('UPDATE ticket SET responsable=$1 WHERE id=$2 RETURNING *', [matricule, id])).rows[0] || null;
  }

  async addSecondaryResponsable(id, matricule, dateDebut, dateFin) {
    return (await this.pool.query(
      "INSERT INTO ticket_responsable (ticket_id, agent_matricule, role, date_debut, date_fin) VALUES ($1,$2,'Secondaire',COALESCE($3, CURRENT_TIMESTAMP), $4) RETURNING *",
      [id, matricule, dateDebut || null, dateFin || null]
    )).rows[0] || null;
  }

  async checkTicketClientAuthorization(ticketId, userId) {
    const authQuery = `
      SELECT 1 FROM client c
      JOIN ticket t ON c.user_id = $2
      WHERE t.id = $1 AND (
          t.site_id IN (SELECT id FROM site WHERE client_id = c.id)
          OR
          t.demande_id IN (SELECT id FROM demande_client WHERE client_id = c.id)
      )
    `;
    return (await this.pool.query(authQuery, [ticketId, userId])).rows.length > 0;
  }

  async upsertSatisfaction(ticketId, userId, rating, comment) {
    return (await this.pool.query(
      'INSERT INTO ticket_satisfaction (ticket_id, user_id, rating, comment, envoieok) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (ticket_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, envoieok = TRUE, created_at = CURRENT_TIMESTAMP RETURNING *',
      [ticketId, userId, rating, comment]
    )).rows[0] || null;
  }

  async ticketExists(id) {
    return !!(await this.pool.query('SELECT id FROM ticket WHERE id=$1', [id])).rows[0];
  }

  async agentExists(matricule) {
    return !!(await this.pool.query('SELECT matricule FROM agent WHERE matricule=$1', [matricule])).rows[0];
  }

  async addTicketAgent(id, matricule, dateDebut, dateFin) {
    return (await this.pool.query('INSERT INTO ticket_agent (ticket_id, agent_matricule, date_debut, date_fin) VALUES ($1,$2,$3,$4) RETURNING *', [id, matricule, dateDebut || null, dateFin || null])).rows[0] || null;
  }

  async removeTicketAgent(id, matricule) {
    return (await this.pool.query('DELETE FROM ticket_agent WHERE ticket_id=$1 AND agent_matricule=$2 RETURNING id', [id, matricule])).rows[0] || null;
  }

  async addTicketResponsable(id, matricule, role) {
    return (await this.pool.query("INSERT INTO ticket_responsable (ticket_id, agent_matricule, role) VALUES ($1,$2,$3) RETURNING *", [id, matricule, role || 'Secondaire'])).rows[0] || null;
  }

  async removeTicketResponsable(id, matricule) {
    return (await this.pool.query('DELETE FROM ticket_responsable WHERE ticket_id=$1 AND agent_matricule=$2 RETURNING id', [id, matricule])).rows[0] || null;
  }
}

module.exports = { TicketsRepository };
