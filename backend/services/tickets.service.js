class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class TicketsService {
  constructor({ repository, logAudit, assertAgentIsChef }) {
    this.repo = repository;
    this.logAudit = logAudit;
    this.assertAgentIsChef = assertAgentIsChef;
  }

  async listTickets() {
    return this.repo.findAll();
  }

  async getTicket(id) {
    const ticket = await this.repo.findById(id);
    if (!ticket) throw new HttpError(404, 'Ticket not found');
    return ticket;
  }

  async getTicketRelations(id) {
    const ticket = await this.repo.findById(id);
    if (!ticket) throw new HttpError(404, 'Ticket not found');

    const doe = ticket.doe_id ? await this.repo.findDoeById(ticket.doe_id) : null;
    const affaire = ticket.affaire_id ? await this.repo.findAffaireById(ticket.affaire_id) : null;

    let site = null;
    const candidateSiteId = ticket.site_id || (doe && doe.site_id) || null;
    if (candidateSiteId) site = await this.repo.findSiteById(candidateSiteId);

    const demande = ticket.demande_id ? await this.repo.findDemandeById(ticket.demande_id) : null;

    const [interventions, documents, images, responsables, agents_assignes, satisfaction] = await Promise.all([
      this.repo.findInterventionsByTicket(id),
      this.repo.findDocumentsByTicket(id),
      this.repo.findImagesByTicket(id),
      this.repo.findResponsablesByTicket(id),
      this.repo.findAgentsByTicket(id),
      this.repo.findSatisfactionByTicket(id)
    ]);

    return { ticket, doe, affaire, site, demande, interventions, documents, images, responsables, agents_assignes, satisfaction };
  }

  async createTicket(body, user, headers) {
    const { doe_id, affaire_id, site_id } = body || {};
    if (!doe_id || !affaire_id) {
      throw new HttpError(400, 'Champs requis manquants: doe_id et affaire_id');
    }

    let siteIdVal = site_id || null;
    if (!siteIdVal && doe_id) {
      const row = await this.repo.findDoeSiteId(doe_id);
      siteIdVal = (row && row.site_id) || null;
    }

    try {
      const created = await this.repo.createTicket({ ...body, site_id: siteIdVal });
      try {
        await this.logAudit('ticket', created && created.id, 'CREATE', (user && user.email) || headers['x-actor-email'] || null, {
          doe_id: body.doe_id,
          affaire_id: body.affaire_id,
          site_id: siteIdVal,
          demande_id: body.demande_id,
          titre: body.titre,
          description: body.description,
          etat: body.etat,
          responsable: body.responsable
        });
      } catch (_) {}
      return created;
    } catch (err) {
      if (err && err.code && ['23502', '23503', '22P02'].includes(err.code)) {
        throw new HttpError(400, 'Données invalides pour la création du ticket');
      }
      throw err;
    }
  }

  async updateTicket(id, body, user) {
    const result = await this.repo.updateTicketTransaction(id, body || {});
    if (!result.updated) throw new HttpError(404, 'Ticket not found');

    if (result.oldResponsable !== (body && body.responsable)) {
      try {
        await this.repo.insertResponsableHistory(id, result.oldResponsable, body.responsable, user && user.matricule);
      } catch (_) {}
    }

    return result.updated;
  }

  async deleteTicket(id, justification, user) {
    if (!justification) throw new HttpError(400, 'Justification is required');
    await this.logAudit('ticket', id, 'DELETE', user && user.email, { justification });
    await this.repo.deleteTicketById(id);
  }

  async takeTicket(id, body, user, headers) {
    const actorEmail = (user && user.email) || headers['x-actor-email'] || null;
    let actorMatricule = user && user.matricule;
    if (!actorMatricule && actorEmail) {
      const row = await this.repo.findAgentMatriculeByEmail(actorEmail);
      actorMatricule = row && row.matricule;
    }

    if (!actorMatricule) throw new HttpError(400, 'Agent matricule missing for actor');
    if (!actorEmail) throw new HttpError(400, 'Actor email missing');

    const etatRow = await this.repo.findTicketEtat(id);
    const etat = etatRow && etatRow.etat;
    if (etat === 'Termine' || etat === 'Terminé') {
      throw new HttpError(409, 'Ticket terminé: prise non autorisée');
    }

    const { actor_name, date_debut, date_fin, commentaire } = body || {};
    const curResp = await this.repo.findTicketResponsable(id);
    const currentResp = curResp && curResp.responsable;

    if (!currentResp) {
      const ticket = await this.repo.setTicketResponsable(id, actorMatricule);
      try {
        await this.repo.insertResponsableHistory(id, null, actorMatricule, actorMatricule);
      } catch (_) {}
      try {
        await this.logAudit('ticket', id, 'TAKE_PRIMARY', actorEmail, { actor_name, date_debut, date_fin, commentaire });
      } catch (_) {}
      return { status: 200, payload: { message: 'Assigné comme responsable principal du ticket', assignment: 'primary', ticket } };
    }

    const record = await this.repo.addSecondaryResponsable(id, actorMatricule, date_debut, date_fin);
    try {
      await this.logAudit('ticket', id, 'TAKE_SECONDARY', actorEmail, { actor_name, date_debut, date_fin, commentaire });
    } catch (_) {}
    return { status: 201, payload: { message: 'Ajouté comme responsable secondaire', assignment: 'secondary', record } };
  }

  async saveSatisfaction(ticketId, note, commentaire, user) {
    const rating = Number(note);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpError(400, 'Rating must be an integer between 1 and 5.');
    }

    const allowed = await this.repo.checkTicketClientAuthorization(ticketId, user && user.id);
    if (!allowed) throw new HttpError(403, 'Forbidden: You are not the client for this ticket.');

    return this.repo.upsertSatisfaction(ticketId, user && user.id, rating, commentaire);
  }

  async addAgent(id, agent_matricule, date_debut, date_fin) {
    if (!agent_matricule) throw new HttpError(400, 'agent_matricule is required');
    if (!await this.repo.ticketExists(id)) throw new HttpError(404, 'Ticket not found');
    if (!await this.repo.agentExists(agent_matricule)) throw new HttpError(404, 'Agent not found');
    return this.repo.addTicketAgent(id, agent_matricule, date_debut, date_fin);
  }

  async removeAgent(id, matricule) {
    const deleted = await this.repo.removeTicketAgent(id, matricule);
    if (!deleted) throw new HttpError(404, 'Not found');
    return { ok: true };
  }

  async addResponsable(id, agent_matricule, role) {
    if (!agent_matricule) throw new HttpError(400, 'agent_matricule is required');
    await this.assertAgentIsChef(agent_matricule);
    if (!await this.repo.ticketExists(id)) throw new HttpError(404, 'Ticket not found');
    return this.repo.addTicketResponsable(id, agent_matricule, role || 'Secondaire');
  }

  async removeResponsable(id, matricule) {
    const deleted = await this.repo.removeTicketResponsable(id, matricule);
    if (!deleted) throw new HttpError(404, 'Not found');
    return { ok: true };
  }
}

module.exports = { TicketsService, HttpError };
