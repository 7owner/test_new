class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class TravauxService {
  constructor({ repository, assertAgentIsChef }) {
    this.repo = repository;
    this.assertAgentIsChef = assertAgentIsChef;
  }

  async list(query) {
    const { doe_id, affaire_id, site_id, demande_id, etat, priorite } = query || {};
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    let sql = `
      SELECT
          t.*,
          d.titre AS doe_titre,
          af.nom_affaire AS affaire_nom,
          s.nom_site AS site_nom,
          dc.titre AS demande_titre,
          resp.responsables,
          ags.agents_assignes
      FROM travaux t
      LEFT JOIN doe d ON t.doe_id = d.id
      LEFT JOIN affaire af ON t.affaire_id = af.id
      LEFT JOIN site s ON t.site_id = s.id
      LEFT JOIN demande_client dc ON t.demande_id = dc.id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'agent_matricule', tr.agent_matricule,
          'role', tr.role,
          'nom', ag.nom,
          'prenom', ag.prenom,
          'email', ag.email
        ) ORDER BY tr.id DESC) AS responsables
        FROM travaux_responsable tr
        LEFT JOIN agent ag ON ag.matricule = tr.agent_matricule
        WHERE tr.travaux_id = t.id
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'agent_matricule', ta.agent_matricule,
          'nom', ag.nom,
          'prenom', ag.prenom,
          'email', ag.email
        ) ORDER BY ta.id DESC) AS agents_assignes
        FROM travaux_agent ta
        LEFT JOIN agent ag ON ag.matricule = ta.agent_matricule
        WHERE ta.travaux_id = t.id
      ) ags ON true
    `;

    if (doe_id) {
      conditions.push(`t.doe_id = $${paramIndex++}`);
      params.push(doe_id);
    }
    if (affaire_id) {
      conditions.push(`t.affaire_id = $${paramIndex++}`);
      params.push(affaire_id);
    }
    if (site_id) {
      conditions.push(`t.site_id = $${paramIndex++}`);
      params.push(site_id);
    }
    if (demande_id) {
      conditions.push(`t.demande_id = $${paramIndex++}`);
      params.push(demande_id);
    }
    if (etat) {
      conditions.push(`t.etat = $${paramIndex++}::etat_travaux`);
      params.push(etat);
    }
    if (priorite) {
      conditions.push(`t.priorite ILIKE $${paramIndex++}`);
      params.push(`%${priorite}%`);
    }

    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY t.created_at DESC';

    return (await this.repo.query(sql, params)).rows;
  }

  async getOne(id) {
    const travail = (await this.repo.query(
      `SELECT t.*,
              s.nom_site,
              af.nom_affaire,
              d.titre AS doe_titre
       FROM travaux t
       LEFT JOIN site s ON s.id = t.site_id
       LEFT JOIN affaire af ON af.id = t.affaire_id
       LEFT JOIN doe d ON d.id = t.doe_id
       WHERE t.id = $1`,
      [id]
    )).rows[0];

    if (!travail) throw new HttpError(404, 'Not found');

    const agents_assignes = (await this.repo.query(
      `SELECT ta.agent_matricule,
              ag.nom,
              ag.prenom,
              ag.email,
              ta.date_debut,
              ta.date_fin
       FROM travaux_agent ta
       LEFT JOIN agent ag ON ag.matricule = ta.agent_matricule
       WHERE ta.travaux_id = $1
       ORDER BY ta.id DESC`,
      [id]
    )).rows;

    const responsables = (await this.repo.query(
      `SELECT tr.agent_matricule,
              tr.role,
              tr.date_debut,
              tr.date_fin,
              tr.created_at,
              ag.nom,
              ag.prenom,
              ag.email
       FROM travaux_responsable tr
       LEFT JOIN agent ag ON ag.matricule = tr.agent_matricule
       WHERE tr.travaux_id = $1
       ORDER BY tr.id DESC`,
      [id]
    )).rows;

    const demandes_client = (await this.repo.query(
      `SELECT dc.* FROM demande_client dc
       JOIN demande_client_travaux dct ON dct.demande_id = dc.id
       WHERE dct.travaux_id = $1
       ORDER BY dc.created_at DESC`,
      [id]
    )).rows;

    return { ...travail, agents_assignes, responsables, demandes_client };
  }

  async create(body) {
    let { doe_id, affaire_id, site_id, demande_id, titre, description, etat, priorite, date_debut, date_fin, date_echeance } = body || {};
    if (!titre) throw new HttpError(400, 'Titre is required');

    let created = (await this.repo.query(
      `INSERT INTO travaux (
        doe_id, affaire_id, site_id, demande_id, titre, description, etat, priorite, date_debut, date_fin, date_echeance
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::etat_travaux, 'A_faire'::etat_travaux), $8, COALESCE($9::timestamp, CURRENT_TIMESTAMP), $10, $11) RETURNING *`,
      [
        doe_id || null, affaire_id || null, site_id || null, demande_id || null, titre, description || null, etat || null, priorite || null, date_debut || null, date_fin || null, date_echeance || null
      ]
    )).rows[0];

    if (!created.demande_id && created.site_id) {
      try {
        const siteRow = (await this.repo.query('SELECT id, client_id FROM site WHERE id=$1', [created.site_id])).rows[0];
        if (siteRow && siteRow.client_id) {
          const d = await this.repo.query(
            `INSERT INTO demande_client (titre, description, client_id, site_id, status)
             VALUES ($1, $2, $3, $4, 'En cours')
             RETURNING id`,
            [titre, description || titre || 'Demande travaux', siteRow.client_id, siteRow.id]
          );
          const demandeId = d.rows[0] && d.rows[0].id;
          if (demandeId) {
            await this.repo.query(
              'INSERT INTO demande_client_travaux (demande_id, travaux_id) VALUES ($1,$2) ON CONFLICT (demande_id, travaux_id) DO NOTHING',
              [demandeId, created.id]
            );
            const up = await this.repo.query('UPDATE travaux SET demande_id=$1 WHERE id=$2 RETURNING *', [demandeId, created.id]);
            if (up.rows[0]) created = up.rows[0];
          }
        }
      } catch (autoErr) {
        console.warn('Auto-demande pour travaux echouee', autoErr.message || autoErr);
      }
    }

    return created;
  }

  async update(id, body) {
    const { doe_id, affaire_id, site_id, demande_id, titre, description, etat, priorite, date_debut, date_fin, date_echeance } = body || {};
    if (!titre) throw new HttpError(400, 'Titre is required');

    const out = (await this.repo.query(
      `UPDATE travaux SET
        doe_id = COALESCE($1, doe_id),
        affaire_id = COALESCE($2, affaire_id),
        site_id = COALESCE($3, site_id),
        demande_id = COALESCE($4, demande_id),
        titre = COALESCE($5, titre),
        description = COALESCE($6, description),
        etat = COALESCE($7::etat_travaux, etat),
        priorite = COALESCE($8, priorite),
        date_debut = COALESCE($9, date_debut),
        date_fin = COALESCE($10, date_fin),
        date_echeance = COALESCE($11, date_echeance),
        updated_at = CURRENT_TIMESTAMP
      WHERE id=$12 RETURNING *`,
      [
        doe_id || null, affaire_id || null, site_id || null, demande_id || null, titre || null, description || null, etat || null, priorite || null, date_debut || null, date_fin || null, date_echeance || null,
        id
      ]
    )).rows[0];

    if (!out) throw new HttpError(404, 'Not found');
    return out;
  }

  async remove(id) {
    await this.repo.query('DELETE FROM travaux WHERE id=$1', [id]);
  }

  async listTaches(travauxId) {
    return (await this.repo.query('SELECT * FROM travaux_tache WHERE travaux_id=$1 ORDER BY id DESC', [travauxId])).rows;
  }

  async createTache(travauxId, body) {
    const { titre, description, etat, priorite, date_echeance } = body || {};
    if (!titre) throw new HttpError(400, 'Titre is required');
    return (await this.repo.query(
      `INSERT INTO travaux_tache (travaux_id, titre, description, etat, priorite, date_echeance)
       VALUES ($1, $2, $3, COALESCE($4::etat_travaux, 'A_faire'::etat_travaux), $5, $6) RETURNING *`,
      [travauxId, titre, description || null, etat || null, priorite || null, date_echeance || null]
    )).rows[0];
  }

  async getTache(id) {
    const row = (await this.repo.query('SELECT * FROM travaux_tache WHERE id=$1', [id])).rows[0];
    if (!row) throw new HttpError(404, 'Travaux tache not found');
    return row;
  }

  async updateTache(id, body) {
    const { titre, description, etat, priorite, date_echeance } = body || {};
    if (!titre) throw new HttpError(400, 'Titre is required');

    const row = (await this.repo.query(
      `UPDATE travaux_tache SET
        titre = COALESCE($1, titre),
        description = COALESCE($2, description),
        etat = COALESCE($3::etat_travaux, etat),
        priorite = COALESCE($4, priorite),
        date_echeance = COALESCE($5, date_echeance),
        updated_at = CURRENT_TIMESTAMP
      WHERE id=$6 RETURNING *`,
      [titre || null, description || null, etat || null, priorite || null, date_echeance || null, id]
    )).rows[0];

    if (!row) throw new HttpError(404, 'Travaux tache not found');
    return row;
  }

  async deleteTache(id) {
    await this.repo.query('DELETE FROM travaux_tache WHERE id=$1', [id]);
  }

  async listMateriels(id) {
    return (await this.repo.query(
      `SELECT tm.*, m.designation, m.reference
       FROM travaux_materiel tm
       LEFT JOIN materiel m ON m.id = tm.materiel_id
       WHERE tm.travaux_id=$1
       ORDER BY tm.id DESC`,
      [id]
    )).rows;
  }

  async createMateriel(id, body) {
    const { materiel_id, materiel, commentaire, quantite = 1 } = body || {};
    const matId = materiel_id || materiel;
    if (!matId) throw new HttpError(400, 'materiel_id is required');

    return (await this.repo.query(
      `INSERT INTO travaux_materiel (travaux_id, materiel_id, commentaire, quantite)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, matId, commentaire || null, quantite || 1]
    )).rows[0];
  }

  async patchMateriel(travauxId, matId, body) {
    const { quantite, commentaire, materiel_id } = body || {};
    const row = (await this.repo.query(
      `UPDATE travaux_materiel
         SET quantite = COALESCE($1, quantite),
             commentaire = COALESCE($2, commentaire),
             materiel_id = COALESCE($3, materiel_id)
       WHERE id=$4 AND travaux_id=$5 RETURNING *`,
      [quantite || null, commentaire || null, materiel_id || null, matId, travauxId]
    )).rows[0];

    if (!row) throw new HttpError(404, 'Not found');
    return row;
  }

  async deleteMateriel(travauxId, matId) {
    const res = await this.repo.query('DELETE FROM travaux_materiel WHERE id=$1 AND travaux_id=$2', [matId, travauxId]);
    if (res.rowCount === 0) throw new HttpError(404, 'Not found');
  }

  async addAgent(id, body) {
    const { agent_matricule, date_debut = null, date_fin = null } = body || {};
    if (!agent_matricule) throw new HttpError(400, 'agent_matricule is required');

    const t = (await this.repo.query('SELECT id FROM travaux WHERE id=$1', [id])).rows[0];
    if (!t) throw new HttpError(404, 'Travaux not found');

    const a = (await this.repo.query('SELECT matricule FROM agent WHERE matricule=$1', [agent_matricule])).rows[0];
    if (!a) throw new HttpError(404, 'Agent not found');

    return (await this.repo.query(
      'INSERT INTO travaux_agent (travaux_id, agent_matricule, date_debut, date_fin) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, agent_matricule, date_debut, date_fin]
    )).rows[0];
  }

  async removeAgent(id, matricule) {
    const r = await this.repo.query('DELETE FROM travaux_agent WHERE travaux_id=$1 AND agent_matricule=$2 RETURNING id', [id, matricule]);
    if (!r.rows[0]) throw new HttpError(404, 'Not found');
    return { ok: true };
  }

  async addResponsable(id, body) {
    const { agent_matricule, role = 'Secondaire' } = body || {};
    if (!agent_matricule) throw new HttpError(400, 'agent_matricule is required');

    await this.assertAgentIsChef(agent_matricule);

    const t = (await this.repo.query('SELECT id FROM travaux WHERE id=$1', [id])).rows[0];
    if (!t) throw new HttpError(404, 'Travaux not found');

    return (await this.repo.query(
      'INSERT INTO travaux_responsable (travaux_id, agent_matricule, role) VALUES ($1,$2,$3) RETURNING *',
      [id, agent_matricule, role]
    )).rows[0];
  }

  async saveSatisfaction(travauxId, body, user) {
    const { note, commentaire } = body || {};
    const userId = user && user.id;

    const rating = Number(note);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpError(400, 'Rating must be an integer between 1 and 5.');
    }

    const authQuery = `
      SELECT 1 FROM client c
      JOIN users u ON c.user_id = u.id
      JOIN ticket tk ON tk.client_id = c.id
      JOIN travaux tr ON tr.ticket_id = tk.id
      WHERE tr.id = $1 AND u.id = $2
    `;
    const authCheck = await this.repo.query(authQuery, [travauxId, userId]);
    if (authCheck.rows.length === 0) {
      throw new HttpError(403, 'Forbidden: You are not the client for this travaux.');
    }

    return (await this.repo.query(
      'INSERT INTO travaux_satisfaction (travaux_id, user_id, rating, comment, envoieok) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (travaux_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, envoieok = TRUE, created_at = CURRENT_TIMESTAMP RETURNING *',
      [travauxId, userId, rating, commentaire]
    )).rows[0];
  }

  async createRendu(travauxId, body, files, user) {
    const { valeur, resume, image_commentaires, image_notes, image_titles } = body || {};
    const commentairesArr = Array.isArray(image_commentaires) ? image_commentaires : (image_commentaires ? [image_commentaires] : []);
    const notesArr = Array.isArray(image_notes) ? image_notes : (image_notes ? [image_notes] : []);
    const titlesArr = Array.isArray(image_titles) ? image_titles : (image_titles ? [image_titles] : []);

    return this.repo.withTransaction(async (client) => {
      const renduResult = await this.repo.query(
        'INSERT INTO rendu_travaux (travaux_id, valeur, resume) VALUES ($1, $2, $3) RETURNING id',
        [travauxId, valeur, resume],
        client
      );
      const renduId = renduResult.rows[0].id;

      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const commentaire = commentairesArr[i] || null;
          const note = notesArr[i] || null;
          const fullComment = [commentaire, note].filter(Boolean).join('\\n\\n');
          const titre = titlesArr[i] || null;

          const imageResult = await this.repo.query(
            `INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
             VALUES ($1, $2, $3, $4, $5, $6, 'RenduTravaux', $7) RETURNING id`,
            [file.originalname, file.mimetype, file.size, file.buffer, fullComment, (user && user.matricule) || null, renduId],
            client
          );
          const imageId = imageResult.rows[0].id;

          await this.repo.query('INSERT INTO rendu_travaux_image (rendu_travaux_id, image_id) VALUES ($1, $2)', [renduId, imageId], client);
          await this.repo.query(
            `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, titre, commentaire)
             VALUES ('RenduTravaux', $1, 'Document', $2, $3, $4, $5, $6)`,
            [renduId, file.originalname, file.mimetype, file.size, titre || file.originalname, commentaire || null],
            client
          );
        }
      }

      return { message: 'Rendu created successfully', renduId };
    });
  }

  async listRendus(travauxId) {
    return (await this.repo.query(
      `SELECT r.*,
              COALESCE(imgs.cnt,0) + COALESCE(docs.cnt,0) AS attachments_count
       FROM rendu_travaux r
       LEFT JOIN (
          SELECT rti.rendu_travaux_id, COUNT(*) AS cnt
          FROM rendu_travaux_image rti
          GROUP BY rti.rendu_travaux_id
       ) imgs ON imgs.rendu_travaux_id = r.id
       LEFT JOIN (
          SELECT cible_id, COUNT(*) AS cnt
          FROM documents_repertoire
          WHERE cible_type='RenduTravaux'
          GROUP BY cible_id
       ) docs ON docs.cible_id = r.id
       WHERE r.travaux_id = $1
       ORDER BY r.id DESC`,
      [travauxId]
    )).rows;
  }

  async getRendu(id) {
    const rendu = (await this.repo.query('SELECT * FROM rendu_travaux WHERE id = $1', [id])).rows[0];
    if (!rendu) throw new HttpError(404, 'Rendu travaux not found');

    const imagesResult = await this.repo.query(
      `SELECT i.* FROM images i
       JOIN rendu_travaux_image rti ON i.id = rti.image_id
       WHERE rti.rendu_travaux_id = $1
       ORDER BY i.id DESC`,
      [id]
    );
    const documentsResult = await this.repo.query(
      "SELECT * FROM documents_repertoire WHERE cible_type = 'RenduTravaux' AND cible_id = $1 ORDER BY id DESC",
      [id]
    );

    const documents = documentsResult.rows;
    const docMap = new Map((documents || []).map(d => [d.nom_fichier, d]));
    const images = imagesResult.rows.map(img => {
      const doc = docMap.get(img.nom_fichier);
      return doc ? { ...img, titre: doc.titre || doc.nom_fichier, commentaire_image: img.commentaire_image || doc.commentaire } : img;
    });

    return { rendu, images, documents };
  }

  async addRenduImages(renduId, body, files, user) {
    const { image_commentaires, image_notes, image_titles } = body || {};
    const commentairesArr = Array.isArray(image_commentaires) ? image_commentaires : (image_commentaires ? [image_commentaires] : []);
    const notesArr = Array.isArray(image_notes) ? image_notes : (image_notes ? [image_notes] : []);
    const titlesArr = Array.isArray(image_titles) ? image_titles : (image_titles ? [image_titles] : []);

    return this.repo.withTransaction(async (client) => {
      const renduRes = await this.repo.query('SELECT id FROM rendu_travaux WHERE id=$1', [renduId], client);
      if (!renduRes.rows.length) throw new HttpError(404, 'Rendu travaux not found');

      const createdIds = [];
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const commentaire = commentairesArr[i] || null;
          const note = notesArr[i] || null;
          const fullComment = [commentaire, note].filter(Boolean).join('\\n\\n');
          const titre = titlesArr[i] || null;

          const imageResult = await this.repo.query(
            `INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
             VALUES ($1, $2, $3, $4, $5, $6, 'RenduTravaux', $7) RETURNING id`,
            [file.originalname, file.mimetype, file.size, file.buffer, fullComment, (user && user.matricule) || null, renduId],
            client
          );
          const imageId = imageResult.rows[0].id;
          createdIds.push(imageId);

          await this.repo.query(
            'INSERT INTO rendu_travaux_image (rendu_travaux_id, image_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [renduId, imageId],
            client
          );
          await this.repo.query(
            `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, titre, commentaire)
             VALUES ('RenduTravaux', $1, 'Document', $2, $3, $4, $5, $6)`,
            [renduId, file.originalname, file.mimetype, file.size, titre || file.originalname, commentaire || null],
            client
          );
        }
      }

      return { message: 'Images ajoutees', imageIds: createdIds };
    });
  }

  async patchRenduImage(renduId, imageId, body) {
    const { titre, commentaire } = body || {};

    const img = (await this.repo.query(
      `SELECT i.id, i.nom_fichier
       FROM images i
       JOIN rendu_travaux_image rti ON rti.image_id = i.id
       WHERE rti.rendu_travaux_id = $1 AND i.id = $2`,
      [renduId, imageId]
    )).rows[0];
    if (!img) throw new HttpError(404, 'Image not found for this rendu');

    if (commentaire !== undefined) {
      await this.repo.query('UPDATE images SET commentaire_image = COALESCE($1, commentaire_image) WHERE id=$2', [commentaire, imageId]);
    }

    if (titre !== undefined || commentaire !== undefined) {
      await this.repo.query(
        `UPDATE documents_repertoire
         SET titre = COALESCE($1, titre),
             commentaire = COALESCE($2, commentaire)
         WHERE cible_type='RenduTravaux' AND cible_id=$3 AND nom_fichier=$4`,
        [titre || null, commentaire || null, renduId, img.nom_fichier]
      );
    }

    return { ok: true };
  }

  async deleteRenduImage(renduId, imageId) {
    await this.repo.withTransaction(async (client) => {
      const img = (await this.repo.query(
        `SELECT i.id, i.nom_fichier
         FROM images i
         JOIN rendu_travaux_image rti ON rti.image_id = i.id
         WHERE rti.rendu_travaux_id = $1 AND i.id = $2`,
        [renduId, imageId],
        client
      )).rows[0];
      if (!img) throw new HttpError(404, 'Image not found for this rendu');

      await this.repo.query('DELETE FROM rendu_travaux_image WHERE rendu_travaux_id=$1 AND image_id=$2', [renduId, imageId], client);
      await this.repo.query('DELETE FROM images WHERE id=$1', [imageId], client);
      await this.repo.query(
        "DELETE FROM documents_repertoire WHERE cible_type='RenduTravaux' AND cible_id=$1 AND nom_fichier=$2",
        [renduId, img.nom_fichier],
        client
      );
    });
  }

  async patchRendu(renduId, body) {
    const { resume, valeur } = body || {};
    if (resume === undefined && valeur === undefined) {
      throw new HttpError(400, 'At least one field (resume or valeur) is required for update.');
    }

    const result = await this.repo.query(
      'UPDATE rendu_travaux SET resume = COALESCE($1, resume), valeur = COALESCE($2, valeur) WHERE id = $3 RETURNING *',
      [resume, valeur, renduId]
    );

    if (result.rows.length === 0) throw new HttpError(404, 'Rendu travaux not found');
    return result.rows[0];
  }

  async deleteRendu(renduId) {
    await this.repo.withTransaction(async (client) => {
      const imagesToDelete = await this.repo.query(
        "SELECT id FROM images WHERE cible_type = 'RenduTravaux' AND cible_id = $1",
        [renduId],
        client
      );
      for (const img of imagesToDelete.rows) {
        await this.repo.query('DELETE FROM images WHERE id = $1', [img.id], client);
      }

      await this.repo.query('DELETE FROM rendu_travaux_image WHERE rendu_travaux_id = $1', [renduId], client);
      const result = await this.repo.query('DELETE FROM rendu_travaux WHERE id = $1 RETURNING id', [renduId], client);
      if (result.rows.length === 0) throw new HttpError(404, 'Rendu travaux not found');
    });
  }
}

module.exports = { TravauxService, HttpError };