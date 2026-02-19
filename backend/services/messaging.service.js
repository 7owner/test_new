class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class MessagingService {
  constructor({ repository }) {
    this.repo = repository;
  }

  async createConversation(user, body) {
    const { message_body, recipient_email } = body || {};
    const sender_id = user.id;

    if (!message_body || !recipient_email) {
      throw new HttpError(400, 'Message body and recipient email are required');
    }

    return this.repo.withTransaction(async (client) => {
      const recipientResult = await this.repo.query('SELECT id FROM users WHERE email = $1', [recipient_email], client);
      if (recipientResult.rows.length === 0) throw new HttpError(404, 'Recipient not found');
      const receiver_id = recipientResult.rows[0].id;

      if (sender_id === receiver_id) throw new HttpError(400, 'Cannot start a conversation with yourself');

      const user1 = Math.min(sender_id, receiver_id);
      const user2 = Math.max(sender_id, receiver_id);
      const conversation_id = `user${user1}-user${user2}`;

      return (await this.repo.query(
        'INSERT INTO messagerie (conversation_id, sender_id, receiver_id, body) VALUES ($1, $2, $3, $4) RETURNING *',
        [conversation_id, sender_id, receiver_id, message_body],
        client
      )).rows[0];
    });
  }

  async listConversations(user, query) {
    const userId = user.id;
    const isAdmin = Array.isArray(user && user.roles) && user.roles.includes('ROLE_ADMIN');
    const { search, site, client: clientName } = query || {};

    let sql = `
      SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id, m.body, m.created_at, m.sender_id, m.receiver_id,
          u_sender.email as sender_email,
          u_receiver.email as receiver_email
      FROM messagerie m
      LEFT JOIN users u_sender ON m.sender_id = u_sender.id
      LEFT JOIN users u_receiver ON m.receiver_id = u_receiver.id
      LEFT JOIN (
          SELECT id, site_id, client_id, titre, ('demande-' || id) as conversation_id_str
          FROM demande_client
      ) AS dc ON m.conversation_id = dc.conversation_id_str
      LEFT JOIN site s ON dc.site_id = s.id
      LEFT JOIN client cl ON dc.client_id = cl.id
    `;

    const params = [];
    const conditions = [];
    if (!isAdmin) {
      params.push(userId);
      conditions.push(`(m.sender_id = $${params.length} OR m.receiver_id = $${params.length})`);
    }

    if (site) {
      params.push(`%${site}%`);
      conditions.push(`s.nom_site ILIKE $${params.length}`);
    }
    if (clientName) {
      params.push(`%${clientName}%`);
      conditions.push(`cl.nom_client ILIKE $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
            m.body ILIKE $${params.length} OR
            m.conversation_id ILIKE $${params.length} OR
            dc.titre ILIKE $${params.length} OR
            u_sender.email ILIKE $${params.length} OR
            u_receiver.email ILIKE $${params.length}
        )`);
    }

    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY m.conversation_id, m.created_at DESC';

    const result = await this.repo.query(sql, params);
    return result.rows.map((convo) => {
      const other_user_email = convo.sender_id === userId ? convo.receiver_email : convo.sender_email;
      return { ...convo, other_user_email };
    });
  }

  async getConversation(conversation_id) {
    return (await this.repo.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.ticket_id, m.demande_id, m.client_id, m.body, m.is_read, m.created_at,
                (SELECT json_agg(json_build_object('id', ma.id, 'file_name', ma.file_name, 'file_type', ma.file_type, 'file_size', ma.file_size))
                 FROM messagerie_attachment ma WHERE ma.message_id = m.id) as attachments
         FROM messagerie m
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC`,
      [conversation_id]
    )).rows;
  }

  async sendMessage(conversation_id, user, bodyInput, files) {
    const rawSenderId = bodyInput && bodyInput.sender_id;
    const rawReceiverId = bodyInput && bodyInput.receiver_id;
    const rawBody = (bodyInput && (bodyInput.body ?? bodyInput.message_body)) ?? '';

    const senderId = rawSenderId ? Number(rawSenderId) : Number(user && user.id);
    let receiverId = rawReceiverId ? Number(rawReceiverId) : null;
    const body = typeof rawBody === 'string' ? rawBody : String(rawBody ?? '');

    if (!senderId || Number.isNaN(senderId)) throw new HttpError(400, 'sender_id is required');
    if ((!body || !body.trim()) && (!files || files.length === 0)) {
      throw new HttpError(400, 'Message body or attachments are required.');
    }

    if (!receiverId || Number.isNaN(receiverId)) {
      const m = /^user(\d+)-user(\d+)$/.exec(conversation_id || '');
      if (m) {
        const u1 = Number(m[1]);
        const u2 = Number(m[2]);
        if (senderId === u1) receiverId = u2;
        else if (senderId === u2) receiverId = u1;
      }
    }

    if (!receiverId || Number.isNaN(receiverId)) {
      try {
        const last = await this.repo.query(
          'SELECT sender_id, receiver_id FROM messagerie WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 1',
          [conversation_id]
        );
        if (last.rows[0]) {
          const { sender_id: s, receiver_id: r } = last.rows[0];
          receiverId = Number(s) === senderId ? Number(r) : Number(s);
        }
      } catch (e) {
        console.warn('Could not infer receiver for conversation:', conversation_id, e.message);
      }
    }

    if ((!receiverId || Number.isNaN(receiverId)) && /^demande-\d+$/.test(conversation_id || '')) {
      try {
        const demandeIdFromConv = Number((conversation_id || '').split('-')[1]);
        const r = await this.repo.query(
          `SELECT a.user_id
               FROM demande_client d
               LEFT JOIN ticket t ON t.id = d.ticket_id
               LEFT JOIN agent a ON a.matricule = t.responsable
               WHERE d.id = $1
               LIMIT 1`,
          [demandeIdFromConv]
        );
        const inferred = r.rows[0] && r.rows[0].user_id ? Number(r.rows[0].user_id) : null;
        if (inferred && !Number.isNaN(inferred) && inferred !== senderId) receiverId = inferred;
      } catch (e) {
        console.warn('Could not infer receiver from demande responsable:', conversation_id, e.message);
      }
    }

    if (!receiverId || Number.isNaN(receiverId)) throw new HttpError(400, 'receiver_id is required');
    if (receiverId === senderId) throw new HttpError(400, 'receiver_id must be different from sender_id');

    let ticketId = null;
    let demandeId = null;
    let clientId = null;

    const parts = conversation_id.split('-');
    if (parts.length === 2) {
      const type = parts[0];
      const id = parseInt(parts[1], 10);
      if (!isNaN(id)) {
        if (type === 'ticket') {
          ticketId = id;
          try {
            const ticketResult = await this.repo.query('SELECT site_id, demande_id FROM ticket WHERE id = $1', [ticketId]);
            if (ticketResult.rows.length > 0) {
              demandeId = ticketResult.rows[0].demande_id;
              const siteId = ticketResult.rows[0].site_id;
              if (siteId) {
                const siteResult = await this.repo.query('SELECT client_id FROM site WHERE id = $1', [siteId]);
                if (siteResult.rows.length > 0) clientId = siteResult.rows[0].client_id;
              }
            }
          } catch (err) {
            console.warn(`Could not derive client_id/demande_id from ticket ${ticketId}:`, err.message);
          }
        } else if (type === 'demande') {
          demandeId = id;
          try {
            const demandeResult = await this.repo.query('SELECT client_id FROM demande_client WHERE id = $1', [demandeId]);
            if (demandeResult.rows.length > 0) clientId = demandeResult.rows[0].client_id;
          } catch (err) {
            console.warn(`Could not derive client_id from demande_client ${demandeId}:`, err.message);
          }
        } else if (type === 'client') {
          clientId = id;
        }
      }
    }

    return this.repo.withTransaction(async (client) => {
      const messageResult = await this.repo.query(
        'INSERT INTO messagerie (conversation_id, sender_id, receiver_id, ticket_id, demande_id, client_id, body) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [conversation_id, senderId, receiverId, ticketId, demandeId, clientId, body || null],
        client
      );
      const messageId = messageResult.rows[0].id;

      if (files && files.length > 0) {
        for (const file of files) {
          await this.repo.query(
            'INSERT INTO messagerie_attachment (message_id, file_blob, file_name, file_type, file_size) VALUES ($1, $2, $3, $4, $5)',
            [messageId, file.buffer, file.originalname, file.mimetype, file.size],
            client
          );
        }
      }

      return { message: 'Message sent', messageId };
    });
  }
}

module.exports = { MessagingService, HttpError };