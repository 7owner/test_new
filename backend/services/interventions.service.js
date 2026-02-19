class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class InterventionsService {
  constructor({ repository, syncInterventionEvents }) {
    this.repo = repository;
    this.syncInterventionEvents = syncInterventionEvents;
  }

  async list(query) {
    const { ticket_id, reference, q } = query || {};
    const params = [];
    const where = [];
    let joins = `
      JOIN ticket t ON i.ticket_id = t.id
      LEFT JOIN site s ON i.site_id = s.id
      LEFT JOIN demande_client dc ON i.demande_id = dc.id
    `;

    if (ticket_id) {
      params.push(ticket_id);
      where.push(`i.ticket_id = $${params.length}`);
    }
    if (reference || q) {
      joins += ` LEFT JOIN intervention_materiel im ON im.intervention_id = i.id
                 LEFT JOIN materiel m ON m.id = im.materiel_id `;
    }
    if (reference) {
      params.push(`%${reference}%`);
      where.push(`(m.reference ILIKE $${params.length} OR m.designation ILIKE $${params.length})`);
    }
    if (q) {
      const term = `%${q}%`;
      params.push(term, term, term, term);
      const idx = params.length - 3;
      where.push(`(
        CAST(i.id AS TEXT) ILIKE $${idx}
        OR COALESCE(i.titre,'') ILIKE $${idx + 1}
        OR COALESCE(i.description,'') ILIKE $${idx + 2}
        OR COALESCE(i.status,'') ILIKE $${idx + 3}
      )`);
      params.push(term, term);
      where.push(`(m.reference ILIKE $${params.length - 1} OR m.designation ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.repo.query(
      `
        SELECT i.*, t.titre as ticket_titre, s.nom_site as site_nom, dc.titre as demande_titre
        FROM intervention i
        ${joins}
        ${whereSql}
        ORDER BY i.date_debut DESC NULLS LAST, i.id DESC
      `,
      params
    );
    return result.rows;
  }

  async getEvents(id) {
    return (await this.repo.query('SELECT * FROM intervention_event WHERE intervention_id=$1 ORDER BY agent_matricule', [id])).rows;
  }

  async syncEvents(id) {
    const interRes = await this.repo.query('SELECT * FROM intervention WHERE id=$1', [id]);
    if (!interRes.rows.length) throw new HttpError(404, 'Intervention not found');
    await this.syncInterventionEvents(interRes.rows[0]);
    return this.getEvents(id);
  }

  async getOne(id) {
    const result = await this.repo.query('SELECT * FROM intervention WHERE id = $1', [id]);
    if (!result.rows.length) throw new HttpError(404, 'Intervention not found');
    return result.rows[0];
  }

  async getCalendar(query) {
    const { agent_ids } = query || {};
    let sql = `
      SELECT i.id, i.titre, i.description, i.date_debut, i.date_fin,
             a.nom as agent_nom, a.prenom as agent_prenom, a.matricule as agent_matricule,
             s.nom_site
      FROM intervention i
      LEFT JOIN ticket t ON i.ticket_id = t.id
      LEFT JOIN agent a ON t.responsable = a.matricule
      LEFT JOIN site s ON i.site_id = s.id
    `;
    const params = [];
    if (agent_ids) {
      sql += ' WHERE a.matricule = ANY($1)';
      params.push(agent_ids.split(','));
    }
    const result = await this.repo.query(sql, params);
    return result.rows.map(row => ({
      id: row.id,
      title: row.titre || ('Intervention #' + row.id),
      start: row.date_debut,
      end: row.date_fin,
      extendedProps: {
        description: `${row.description || ''}<br><b>Agent:</b> ${row.agent_prenom} ${row.agent_nom}<br><b>Site:</b> ${row.nom_site || 'Non spécifié'}`,
        agent: `${row.agent_prenom} ${row.agent_nom}`,
        site: row.nom_site
      }
    }));
  }

  async getRelations(id) {
    const intervention = (await this.repo.query('SELECT * FROM intervention WHERE id=$1', [id])).rows[0];
    if (!intervention) throw new HttpError(404, 'Intervention not found');

    const ticket = intervention.ticket_id
      ? (await this.repo.query('SELECT t.*, d.id as demande_id FROM ticket t LEFT JOIN demande_client d ON t.id = d.ticket_id WHERE t.id = $1', [intervention.ticket_id])).rows[0]
      : null;

    let doe = null;
    let site = null;
    let demande = null;
    let affaire = null;

    if (intervention.site_id) {
      site = (await this.repo.query('SELECT * FROM site WHERE id=$1', [intervention.site_id])).rows[0] || null;
    } else if (ticket && ticket.doe_id) {
      doe = (await this.repo.query('SELECT * FROM doe WHERE id=$1', [ticket.doe_id])).rows[0] || null;
      if (doe && doe.site_id) {
        site = (await this.repo.query('SELECT * FROM site WHERE id=$1', [doe.site_id])).rows[0] || null;
      }
    }

    if (intervention.demande_id) {
      demande = (await this.repo.query('SELECT * FROM demande_client WHERE id=$1', [intervention.demande_id])).rows[0] || null;
    } else if (ticket && ticket.demande_id) {
      demande = (await this.repo.query('SELECT * FROM demande_client WHERE id=$1', [ticket.demande_id])).rows[0] || null;
    }

    if (ticket && ticket.affaire_id) {
      affaire = (await this.repo.query('SELECT * FROM affaire WHERE id=$1', [ticket.affaire_id])).rows[0] || null;
    }

    const rendezvous = (await this.repo.query('SELECT * FROM rendezvous WHERE intervention_id=$1 ORDER BY date_rdv DESC, id DESC', [id])).rows;
    const documents = (await this.repo.query("SELECT * FROM documents_repertoire WHERE cible_type='Intervention' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await this.repo.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Intervention' AND cible_id=$1 ORDER BY id DESC", [id])).rows;

    const materielsDirect = (await this.repo.query(
      "SELECT im.id, m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat, im.quantite, im.commentaire, m.commande_status FROM intervention_materiel im JOIN materiel m ON m.id = im.materiel_id WHERE im.intervention_id=$1 ORDER BY im.id DESC",
      [id]
    )).rows;

    let materielsViaDemande = [];
    if (ticket) {
      const viaReq = await this.repo.query(
        `SELECT DISTINCT m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat,
                COALESCE(gdm.quantite_demandee, dm.quantite, 1) AS quantite,
                m.commentaire, m.commande_status
         FROM demande_materiel dm
         JOIN gestion_demande_materiel gdm ON gdm.demande_materiel_id = dm.id
         JOIN materiel m ON m.id = gdm.materiel_id
         WHERE dm.intervention_id=$1 OR dm.ticket_id = $2`,
        [id, ticket.id]
      );
      materielsViaDemande = viaReq.rows;
    }

    const materiels = [...materielsDirect];
    materielsViaDemande.forEach(mv => {
      if (!materiels.find(md => md.materiel_id === mv.materiel_id)) materiels.push(mv);
    });

    const assigned_agent = intervention.ticket_agent_id
      ? (await this.repo.query(
          `SELECT a.nom, a.prenom, a.matricule FROM agent a JOIN ticket_agent ta ON a.matricule = ta.agent_matricule WHERE ta.id = $1`,
          [intervention.ticket_agent_id]
        )).rows[0]
      : null;

    return { intervention, ticket, doe, site, demande, affaire, rendezvous, documents, images, materiels, assigned_agent };
  }

  async addMateriel(id, body) {
    const { materiel_id, quantite, commentaire } = body || {};
    const chk = await this.repo.query('SELECT id FROM intervention WHERE id=$1', [id]);
    if (!chk.rows[0]) throw new HttpError(404, 'Intervention not found');
    const cm = await this.repo.query('SELECT id FROM materiel WHERE id=$1', [materiel_id]);
    if (!cm.rows[0]) throw new HttpError(404, 'Materiel not found');
    return (await this.repo.query(
      'INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire) VALUES ($1,$2,COALESCE($3,1),$4) RETURNING *',
      [id, materiel_id, Number.isFinite(quantite) ? quantite : null, commentaire || null]
    )).rows[0];
  }

  async listMateriels(id) {
    const it = (await this.repo.query('SELECT ticket_id FROM intervention WHERE id=$1', [id])).rows[0];
    const ticketId = it ? it.ticket_id : null;

    const direct = (await this.repo.query(
      `SELECT im.id, m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat, im.quantite, im.commentaire, m.commande_status
       FROM intervention_materiel im
       JOIN materiel m ON m.id = im.materiel_id
       WHERE im.intervention_id=$1
       ORDER BY im.id DESC`,
      [id]
    )).rows;

    let viaDemande = [];
    if (ticketId) {
      viaDemande = (await this.repo.query(
        `SELECT DISTINCT m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat,
                COALESCE(gdm.quantite_demandee, dm.quantite, 1) AS quantite,
                m.commentaire, m.commande_status
         FROM demande_materiel dm
         JOIN gestion_demande_materiel gdm ON gdm.demande_materiel_id = dm.id
         JOIN materiel m ON m.id = gdm.materiel_id
         WHERE dm.intervention_id=$1 OR dm.ticket_id = $2`,
        [id, ticketId]
      )).rows;
    }

    const all = [...direct];
    viaDemande.forEach(mv => {
      if (!all.find(d => d.materiel_id === mv.materiel_id)) all.push(mv);
    });
    return all;
  }

  async create(body) {
    const { titre, description, date_debut, date_fin, ticket_id, site_id, demande_id, status, ticket_agent_id, metier } = body || {};
    if (!description || !date_debut || !ticket_id) {
      throw new HttpError(400, 'Description, date de début et ticket ID sont requis');
    }
    const created = (await this.repo.query(
      'INSERT INTO intervention (titre, description, date_debut, date_fin, ticket_id, site_id, demande_id, status, ticket_agent_id, metier) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [titre || null, description, date_debut, date_fin, ticket_id, site_id || null, demande_id || null, status || 'En_attente', ticket_agent_id || null, metier || null]
    )).rows[0];
    await this.syncInterventionEvents(created);
    return created;
  }

  async update(id, body) {
    const { description, date_debut, date_fin = null, ticket_id, site_id, demande_id, status, ticket_agent_id, metier } = body || {};
    const result = await this.repo.query(
      'UPDATE intervention SET description = $1, date_debut = $2, date_fin = $3, ticket_id = $4, site_id = $5, demande_id = $6, status = COALESCE($7::statut_intervention, status), ticket_agent_id = $8, metier = $9 WHERE id = $10 RETURNING *',
      [description, date_debut, date_fin, ticket_id, site_id || null, demande_id || null, status, ticket_agent_id || null, metier || null, id]
    );
    if (!result.rows.length) throw new HttpError(404, `Intervention with id ${id} not found`);
    await this.syncInterventionEvents(result.rows[0]);
    return result.rows[0];
  }

  async patch(id, body) {
    const fields = [];
    const values = [];
    const add = (col, val, cast = '') => { values.push(val); fields.push(`${col} = $${values.length}${cast}`); };

    if ('description' in body) add('description', body.description);
    if ('date_debut' in body) add('date_debut', body.date_debut);
    if ('date_fin' in body) add('date_fin', body.date_fin);
    if ('site_id' in body) add('site_id', body.site_id || null);
    if ('demande_id' in body) add('demande_id', body.demande_id || null);
    if ('status' in body) add('status', body.status, '::statut_intervention');
    if ('ticket_agent_id' in body) add('ticket_agent_id', body.ticket_agent_id || null);
    if ('metier' in body) add('metier', body.metier || null);

    if (!fields.length) throw new HttpError(400, 'Aucun champ à mettre à jour');

    const sql = `UPDATE intervention SET ${fields.join(', ')} WHERE id = $${values.length + 1} RETURNING *`;
    values.push(id);
    const result = await this.repo.query(sql, values);
    if (!result.rows.length) throw new HttpError(404, 'Intervention not found');
    await this.syncInterventionEvents(result.rows[0]);
    return result.rows[0];
  }

  async remove(id) {
    await this.repo.query('DELETE FROM intervention WHERE id = $1', [id]);
  }

  async createRendu(interventionId, body, files, user) {
    const { valeur, resume, image_commentaires, image_notes, image_titles } = body || {};
    const commentairesArr = Array.isArray(image_commentaires) ? image_commentaires : (image_commentaires ? [image_commentaires] : []);
    const notesArr = Array.isArray(image_notes) ? image_notes : (image_notes ? [image_notes] : []);
    const titlesArr = Array.isArray(image_titles) ? image_titles : (image_titles ? [image_titles] : []);

    const out = await this.repo.withTransaction(async (client) => {
      const renduResult = await this.repo.query(
        'INSERT INTO rendu_intervention (intervention_id, valeur, resume) VALUES ($1, $2, $3) RETURNING id',
        [interventionId, valeur, resume],
        client
      );
      const renduId = renduResult.rows[0].id;

      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const commentaire = commentairesArr[i] || null;
          const note = notesArr[i] || null;
          const fullComment = [commentaire, note].filter(Boolean).join('\n\n');
          const titre = titlesArr[i] || null;

          const imageResult = await this.repo.query(
            `INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
             VALUES ($1, $2, $3, $4, $5, $6, 'RenduIntervention', $7) RETURNING id`,
            [file.originalname, file.mimetype, file.size, file.buffer, fullComment, user && user.matricule || null, renduId],
            client
          );
          const imageId = imageResult.rows[0].id;

          await this.repo.query('INSERT INTO rendu_intervention_image (rendu_intervention_id, image_id) VALUES ($1, $2)', [renduId, imageId], client);
          await this.repo.query(
            `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, titre, commentaire)
             VALUES ('RenduIntervention', $1, 'Document', $2, $3, $4, $5, $6)`,
            [renduId, file.originalname, file.mimetype, file.size, titre || file.originalname, commentaire || null],
            client
          );
        }
      }
      return { message: 'Rendu created successfully', renduId };
    });

    return out;
  }

  async listRendus(interventionId) {
    return (await this.repo.query(
      `SELECT r.*,
              COALESCE(imgs.cnt,0) + COALESCE(docs.cnt,0) AS attachments_count
       FROM rendu_intervention r
       LEFT JOIN (
          SELECT rii.rendu_intervention_id, COUNT(*) AS cnt
          FROM rendu_intervention_image rii
          GROUP BY rii.rendu_intervention_id
       ) imgs ON imgs.rendu_intervention_id = r.id
       LEFT JOIN (
          SELECT cible_id, COUNT(*) AS cnt
          FROM documents_repertoire
          WHERE cible_type='RenduIntervention'
          GROUP BY cible_id
       ) docs ON docs.cible_id = r.id
       WHERE r.intervention_id = $1
       ORDER BY r.id DESC`,
      [interventionId]
    )).rows;
  }

  async getRendu(id) {
    const rendu = (await this.repo.query('SELECT * FROM rendu_intervention WHERE id = $1', [id])).rows[0];
    if (!rendu) throw new HttpError(404, 'Rendu not found');

    const imagesResult = await this.repo.query(
      `SELECT i.* FROM images i
       JOIN rendu_intervention_image rii ON i.id = rii.image_id
       WHERE rii.rendu_intervention_id = $1
       ORDER BY i.id DESC`,
      [id]
    );
    const documentsResult = await this.repo.query(
      "SELECT * FROM documents_repertoire WHERE cible_type = 'RenduIntervention' AND cible_id = $1 ORDER BY id DESC",
      [id]
    );

    const documents = documentsResult.rows;
    const docMap = new Map((documents || []).map(d => [d.nom_fichier, d]));
    const images = imagesResult.rows.map(img => {
      const doc = docMap.get(img.nom_fichier);
      return doc ? { ...img, titre: doc.titre || doc.nom_fichier, commentaire_image: img.commentaire_image || doc.commentaire } : img;
    });

    let message_attachments = [];
    try {
      const interventionResult = await this.repo.query('SELECT ticket_id FROM intervention WHERE id = $1', [rendu.intervention_id]);
      const ticketId = interventionResult.rows[0] && interventionResult.rows[0].ticket_id;
      if (ticketId) {
        const demandeResult = await this.repo.query('SELECT id FROM demande_client WHERE ticket_id = $1', [ticketId]);
        const demandeId = demandeResult.rows[0] && demandeResult.rows[0].id;
        if (demandeId) {
          const conversationId = `demande-${demandeId}`;
          const messagesResult = await this.repo.query('SELECT id, body as message FROM messagerie WHERE conversation_id = $1', [conversationId]);
          for (const message of messagesResult.rows) {
            const attachmentsResult = await this.repo.query(
              'SELECT id, file_name, file_type, file_size FROM messagerie_attachment WHERE message_id = $1',
              [message.id]
            );
            attachmentsResult.rows.forEach(att => message_attachments.push({ ...att, message: message.message }));
          }
        }
      }
    } catch (e) {
      console.warn(`Could not fetch message attachments for rendu ${id}:`, e.message);
    }

    return { rendu, images, documents, message_attachments };
  }

  async patchRendu(id, body, user) {
    const { resume, valeur } = body || {};
    const userId = user && user.id;
    const roles = (user && user.roles) || [];
    const isAdmin = roles.includes('ROLE_ADMIN');

    const rendu = (await this.repo.query('SELECT intervention_id FROM rendu_intervention WHERE id = $1', [id])).rows[0];
    if (!rendu) throw new HttpError(404, 'Rendu not found');

    if (!isAdmin) {
      const interventionResult = await this.repo.query('SELECT ticket_id FROM intervention WHERE id = $1', [rendu.intervention_id]);
      const ticketId = interventionResult.rows[0] && interventionResult.rows[0].ticket_id;
      if (!ticketId) throw new HttpError(403, 'Forbidden');
      const clientCheck = await this.repo.query(
        'SELECT 1 FROM client c JOIN ticket t ON c.user_id = $2 WHERE t.id = $1',
        [ticketId, userId]
      );
      if (!clientCheck.rows.length) throw new HttpError(403, 'Forbidden');
    }

    if (resume === undefined && valeur === undefined) {
      throw new HttpError(400, 'At least one field (resume or valeur) is required for update.');
    }

    const result = await this.repo.query(
      'UPDATE rendu_intervention SET resume = COALESCE($1, resume), valeur = COALESCE($2, valeur) WHERE id = $3 RETURNING *',
      [resume, valeur, id]
    );
    if (!result.rows.length) throw new HttpError(404, 'Rendu not found');
    return result.rows[0];
  }

  async deleteRendu(id) {
    return this.repo.withTransaction(async (client) => {
      const imagesToDelete = await this.repo.query(
        "SELECT id FROM images WHERE cible_type = 'RenduIntervention' AND cible_id = $1",
        [id],
        client
      );
      for (const img of imagesToDelete.rows) {
        await this.repo.query('DELETE FROM images WHERE id = $1', [img.id], client);
      }
      await this.repo.query('DELETE FROM rendu_intervention_image WHERE rendu_intervention_id = $1', [id], client);
      const result = await this.repo.query('DELETE FROM rendu_intervention WHERE id = $1 RETURNING id', [id], client);
      if (!result.rows.length) throw new HttpError(404, 'Rendu not found');
    });
  }
}

module.exports = { InterventionsService, HttpError };
