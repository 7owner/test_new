document.addEventListener('DOMContentLoaded', async function() {
      const App = window.AppCore || {
        getToken: () => localStorage.getItem('token') || '',
        clearAuth: () => {
          localStorage.removeItem('token');
          localStorage.removeItem('userRole');
        },
        decodeToken: (token) => {
          try {
            const payload = (token || '').split('.')[1];
            return payload ? JSON.parse(atob(payload)) : null;
          } catch (_) {
            return null;
          }
        },
        authHeaders: (token) => (token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const qp = new URLSearchParams(location.search);
      const demandeId = qp.get('id');
      const section = qp.get('section');
      const isModal = window.self !== window.top || qp.get('modal') === '1' || qp.get('embed') === '1';
      if (isModal) document.body.classList.add('embed');

      const token = App.getToken();
      if (!token) { window.location.href = '/login.html'; return; }

      const user = App.decodeToken(token);
      const userId = user?.id;
      if (!userId) {
        window.location.href = '/login.html';
        return;
      }

      const headers = App.authHeaders(token);

      if (!demandeId) {
        document.querySelector('main').innerHTML = '<div class="alert alert-danger">ID de demande manquant.</div>';
        return;
      }

      const conversation_id = `demande-${demandeId}`;
      let receiver_id = null;
      let responsableUserId = null;

      const messagesDisplay = document.getElementById('messages-display');
      const messageForm = document.getElementById('message-form');
      const messageBody = document.getElementById('message-body');
      const attachments = document.getElementById('attachments');

      function set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? 'â€”';
      }

      function fmt(iso) {
        if (!iso) return 'â€”';
        const d = new Date(iso);
        return isNaN(d) ? 'â€”' : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
      }

      function getStatusClass(status) {
        const s = String(status || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/_/g, ' ');
        if (s.includes('en cours') || s.includes('en attente')) return 'status-en-cours';
        if (s.includes('trait'))    return 'status-traite';
        if (s.includes('rejet'))    return 'status-rejete';
        if (s.includes('annul'))    return 'status-annule';
        return '';
      }

      function hrefForAttachment(att) {
        return att?.id ? `/api/attachments/${att.id}/view` : '#';
      }

      function setInterlocuteur(resp) {
        const interCard = document.getElementById('interlocuteur-card');
        if (resp && (resp.nom || resp.prenom || resp.email || resp.tel)) {
          interCard?.classList.remove('d-none');
          set('interlocuteur-nom', `${resp.prenom || ''} ${resp.nom || ''}`.trim() || 'â€”');
          set('interlocuteur-email', resp.email || 'â€”');
          set('interlocuteur-tel', resp.tel || 'â€”');
        } else {
          interCard?.classList.add('d-none');
          set('interlocuteur-nom', 'â€”');
          set('interlocuteur-email', 'â€”');
          set('interlocuteur-tel', 'â€”');
        }
      }

      async function loadMessages() {
        try {
          const res = await fetch(`/api/conversations/${conversation_id}`, { headers, credentials: 'same-origin', cache:'no-store' });
          if (res.status === 304) {
            messagesDisplay.innerHTML = '<p class="text-center text-muted py-4">Aucun message pour le moment.</p>';
            return;
          }
          if (!res.ok) throw new Error();
          const messages = await res.json();

          messagesDisplay.innerHTML = '';
          // DÃ©terminer automatiquement le destinataire si absent, Ã  partir des messages existants
          const counterpart = (messages || []).find(m => m.sender_id && m.sender_id !== userId)
            || (messages || []).find(m => m.receiver_id && m.receiver_id !== userId);
          if (counterpart) {
            const inferred = counterpart.sender_id && counterpart.sender_id !== userId
              ? counterpart.sender_id
              : counterpart.receiver_id;
            if (inferred && inferred !== userId) receiver_id = inferred;
          }
          if ((!receiver_id || receiver_id === userId) && responsableUserId && responsableUserId !== userId) {
            receiver_id = responsableUserId;
          }

          messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.sender_id === userId ? 'message-sent' : 'message-received'}`;
            let attHtml = '';
            if (msg.attachments?.length) {
              attHtml = `<div class="message-attachments mt-2">${
                msg.attachments.map(a =>
                  `<a href="${hrefForAttachment(a)}" target="_blank"><i class="bi bi-file-earmark"></i> ${a.file_name}</a>`
                ).join('')
              }</div>`;
            }
            div.innerHTML = `
              <div>${msg.body || ''}</div>
              <small>${fmt(msg.created_at)}</small>
              ${attHtml}
            `;
            messagesDisplay.appendChild(div);
          });

          messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
        } catch (err) {
          messagesDisplay.innerHTML = '<p class="text-center text-muted py-4">Aucun message pour le moment.</p>';
        }
      }

      messageForm.addEventListener('submit', async e => {
        e.preventDefault();
        const body = messageBody.value.trim();
        if (!body && !attachments.files.length) return;

        if (!receiver_id || receiver_id === userId) {
          if (responsableUserId && responsableUserId !== userId) {
            receiver_id = responsableUserId;
          } else {
            receiver_id = null;
          }
        }

        const formData = new FormData();
        formData.append('body', body);
        if (receiver_id && receiver_id !== userId) formData.append('receiver_id', receiver_id);
        formData.append('demande_id', demandeId);
        for (const file of attachments.files) formData.append('attachments', file);

        try {
          const res = await fetch(`/api/conversations/${conversation_id}/messages`, {
            method: 'POST',
            headers: App.authHeaders(token),
            credentials: 'same-origin',
            body: formData
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload?.error || `HTTP ${res.status}`);
          }
          messageBody.value = '';
          attachments.value = '';
          loadMessages();
        } catch (err) {
          alert(`Erreur lors de l'envoi: ${err.message || 'echec'}`);
        }
      });

      try {
        let res = await fetch(`/api/client/demandes/${demandeId}`, { headers, credentials: 'same-origin', cache: 'no-store' });
        if (res.status === 304) {
          res = await fetch(`/api/client/demandes/${demandeId}`, { headers, credentials: 'same-origin', cache: 'reload' });
        }
        if (res.status === 404) {
          // Fallback route (legacy payload shape)
          res = await fetch(`/api/demandes_client/${demandeId}`, { headers, credentials: 'same-origin', cache: 'no-store' });
        }
        if (!res.ok) {
          if (res.status === 401) {
            location.href = '/login.html';
            return;
          }
          if (res.status === 403) {
            throw new Error("AccÃ¨s refusÃ© Ã  cette demande. VÃ©rifiez le compte client utilisÃ©.");
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const payload = await res.json();
        let { demande, ticket, responsable, interventions } = payload || {};
        if (!demande && payload && payload.id) demande = payload;

        // Fallback: rÃ©cupÃ©rer les relations (responsable / interventions / ticket) si absents
        if ((!responsable || !interventions || !ticket) && demande?.id) {
          try {
            const relRes = await fetch(`/api/demandes_client/${demande.id}/relations`, { headers, credentials: 'same-origin', cache: 'no-store' });
            if (relRes.ok) {
              const rel = await relRes.json();
              responsable = responsable || rel.responsable || rel.agent || rel.assignation || null;
              interventions = interventions || rel.interventions || rel.intervention || [];
              ticket = ticket || rel.ticket || null;
            } else if (relRes.status !== 404) {
              console.warn('relations fallback status', relRes.status);
            }
          } catch (e) {
            console.warn('relations fallback failed', e);
          }
        }
        // Fix destinataire/messages: si aucune trace, utiliser le responsable
        if (responsable && (responsable.user_id || responsable.id)) {
          responsableUserId = responsable.user_id || responsable.id;
          if ((!receiver_id || receiver_id === userId) && responsableUserId !== userId) receiver_id = responsableUserId;
        }
        setInterlocuteur(responsable);
        if (!demande) throw new Error('DonnÃ©es de demande manquantes');

        // Sections toujours visibles, mÃªme en modal (requis par la demande utilisateur)
        set('demande-id', demande.id);
        set('demande-date', fmt(demande.created_at));
        set('demande-site', demande.nom_site || 'â€”');
        set('demande-description', demande.description || 'Aucune description');

        const statusEl = document.getElementById('demande-status');
        statusEl.textContent = demande.status || 'â€”';
        statusEl.className = `status-badge ${getStatusClass(demande.status)}`;

        // Ticket liÃ©
        const ticketSection = document.getElementById('ticket-section');
        if (ticket) {
          ticketSection?.classList.remove('d-none');
          set('ticket-titre', ticket.titre || 'â€”');
          set('ticket-date-debut', fmt(ticket.date_debut));
          set('ticket-date-fin', ticket.date_fin ? fmt(ticket.date_fin) : 'En cours');
          const ts = document.getElementById('ticket-status');
          ts.textContent = ticket.etat || 'â€”';
          ts.className = `status-badge ${getStatusClass(ticket.etat)}`;
        } else {
          ticketSection?.classList.add('d-none');
        }

        // Interlocuteur
        const interCard = document.getElementById('interlocuteur-card');
        if (responsable) {
          interCard?.classList.remove('d-none');
          set('interlocuteur-nom', `${responsable.prenom || ''} ${responsable.nom || ''}`.trim() || 'â€”');
          set('interlocuteur-email', responsable.email || 'â€”');
          set('interlocuteur-tel', responsable.tel || 'â€”');
          if (responsable.user_id && responsable.user_id !== userId) receiver_id = responsable.user_id;
        } else {
          interCard?.classList.remove('d-none'); // visible mais vide pour cohÃ©rence
          set('interlocuteur-nom', 'â€”');
          set('interlocuteur-email', 'â€”');
          set('interlocuteur-tel', 'â€”');
        }

        // Interventions
        const intSection = document.getElementById('interventions-section');
        const list = document.getElementById('interventions-list');
        if (interventions?.length) {
          intSection?.classList.remove('d-none');
          list.innerHTML = '';
          interventions.forEach(i => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <p class="mb-1 fw-medium">${i.description || 'Intervention sans description'}</p>
                <small class="d-block text-muted">
                  ${fmt(i.date_debut)} â†’ ${i.date_fin ? fmt(i.date_fin) : 'en cours'}
                </small>
                <small class="d-block mt-1">
                  Statut : <strong>${i.status || 'â€”'}</strong>
                </small>
              </div>
            `;
            list.appendChild(item);
          });
        } else {
          intSection?.classList.remove('d-none');
          list.innerHTML = '<div class="text-muted small">Aucune intervention.</div>';
        }

        loadMessages();

        if (section === 'messages') {
          document.getElementById('messagerie-section')?.scrollIntoView({ behavior: 'smooth' });
          messageBody.focus();
        }

      } catch (err) {
        document.querySelector('main').innerHTML = `<div class="alert alert-danger m-4">Erreur de chargement : ${err.message}</div>`;
      }
    });
