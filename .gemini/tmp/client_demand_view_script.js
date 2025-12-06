
    document.addEventListener('DOMContentLoaded', async function() {
      const qp = new URLSearchParams(location.search);
      const demandeId = qp.get('id');
      const token = localStorage.getItem('token');
      if (!token) { window.location.href = '/login.html'; return; }
      let userId = null;
      try {
        const user = JSON.parse(atob(token.split('.')[1]));
        userId = user && user.id;
      } catch (e) {
        console.warn('JWT parse failed, redirecting to login', e);
        window.location.href = '/login.html';
        return;
      }
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      console.log('DEBUG: DOMContentLoaded started. demandeId:', demandeId, 'userId:', userId);

      if (!demandeId) {
        document.querySelector('main').innerHTML = '<div class="alert alert-danger">ID de demande manquant.</div>';
        console.log('DEBUG: demandeId is missing.');
        return;
      }

      const conversation_id = `demande-${demandeId}`;
      let receiver_id = null;

      const messagesDisplay = document.getElementById('messages-display');
      const messageForm = document.getElementById('message-form');
      const messageBodyInput = document.getElementById('message-body');
      const attachmentsInput = document.getElementById('attachments');

      function set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val || 'N/A';
      }



      function fmt(iso) {
        if (!iso) return 'N/A';
        const d = new Date(iso);
        return isNaN(d) ? 'Date invalide' : d.toLocaleString('fr-FR');
      }

      function hrefForAttachment(att) {
        if (!att || !att.id) return '#';
        return `/api/attachments/${att.id}/view`;
      }

      async function loadMessages() {
        console.log('DEBUG: loadMessages started.');
        try {
          const messages = await fetch(`/api/conversations/${conversation_id}`, { headers, credentials: 'same-origin' }).then(res => res.json());
          console.log('DEBUG: Messages fetched:', messages);
          messagesDisplay.innerHTML = '';
          messages.forEach(msg => {
            const msgElement = document.createElement('div');
            msgElement.className = msg.sender_id === userId ? 'message-sent' : 'message-received';
            let attachmentsHTML = '';
            if (msg.attachments && msg.attachments.length > 0) {
              attachmentsHTML = msg.attachments.map(att => 
                `<br><a href="${hrefForAttachment(att)}" target="_blank" download="${att.file_name}">${att.file_name}</a>`
              ).join('');
            }
            msgElement.innerHTML = `
              <p>${msg.body}</p>
              <small>${new Date(msg.created_at).toLocaleString()}</small>
              ${attachmentsHTML}
            `;
            messagesDisplay.prepend(msgElement);
          });
        } catch (error) {
          console.error('Error loading messages:', error);
          messagesDisplay.innerHTML = '<p class="text-muted">Aucun message pour le moment.</p>';
        }
      }
      
      messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = messageBodyInput.value;
        const files = attachmentsInput.files;
        
        if (!body && files.length === 0) return;

        // Ensure sender and receiver are defined before proceeding
        if (!userId) {
            alert("L'expéditeur n'est pas défini. Veuillez vous reconnecter.");
            return;
        }
        if (!receiver_id) {
            alert("Le destinataire n'est pas défini. Impossible d'envoyer le message.");
            return;
        }

        const formData = new FormData();
        formData.append('body', body);
        formData.append('sender_id', String(userId)); // Explicitly cast to string
        formData.append('receiver_id', String(receiver_id)); // Explicitly cast to string
        formData.append('demande_id', demandeId);

        for (let i = 0; i < files.length; i++) {
          formData.append('attachments', files[i]);
        }

        try {
          const res = await fetch(`/api/conversations/${conversation_id}/messages`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            credentials: 'same-origin',
            body: formData
          });

          if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || 'Failed to send message');
          }

          messageBodyInput.value = '';
          attachmentsInput.value = '';
          loadMessages();
        } catch (error) {
          console.error('Error sending message:', error);
          alert("Erreur lors de l'envoi du message.");
        }
      });

      console.log('DEBUG: Before main fetch for demand details.');
      try {
        const res = await fetch(`/api/client/demandes/${demandeId}`, { headers, credentials: 'same-origin' });
        console.log('DEBUG: Main fetch response status:', res.status);
        if (res.status === 401 || res.status === 403) {
          location.href = '/login.html';
          return;
        }
        const data = await res.json();
        console.log('DEBUG: Main fetch data:', data);
        if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);

        const { demande, ticket, responsable, interventions } = data;
        console.log('DEBUG: Destructured data. demande:', demande, 'ticket:', ticket);

        // Populate Demand Info
        set('demande-id', demande.id);
        console.log('DEBUG: demande-id set.');
        set('demande-date', fmt(demande.created_at));
        set('demande-site', demande.nom_site || 'Non spécifié');
        set('demande-description', demande.description);
        set('demande-status', demande.status);
        console.log('DEBUG: Demand info populated.');


        if (ticket) {
          document.getElementById('ticket-section').classList.remove('d-none');
          set('ticket-titre', ticket.titre);
          set('ticket-status', ticket.etat);
          set('ticket-date-debut', fmt(ticket.date_debut));
          set('ticket-date-fin', ticket.date_fin ? fmt(ticket.date_fin) : 'En cours');
          console.log('DEBUG: Ticket info populated.');
        } else {
          console.log('DEBUG: No ticket found.');
        }

        if (responsable) {
            document.getElementById('responsable-section').classList.remove('d-none');
            set('responsable-nom', `${responsable.prenom || ''} ${responsable.nom || ''}`.trim());
            set('responsable-email', responsable.email);
            set('responsable-tel', responsable.tel);
            receiver_id = responsable.user_id; // Set receiver_id
            console.log('DEBUG: Responsable info populated.');
        } else {
          console.log('DEBUG: No responsable found.');
        }

        if (interventions && interventions.length > 0) {
          document.getElementById('interventions-section').classList.remove('d-none');
          const listEl = document.getElementById('interventions-list');
          listEl.innerHTML = ''; // Clear placeholder
          interventions.forEach(inter => {
            const item = document.createElement('div');
            item.className = 'card card-body mb-2';
            item.innerHTML = `
              <p class="mb-1"><strong>Description:</strong> ${inter.description || 'Pas de description'}</p>
              <small class="text-muted">Du ${fmt(inter.date_debut)} au ${inter.date_fin ? fmt(inter.date_fin) : 'en cours'}</small>
              <small class="text-muted">Statut: ${inter.status || 'Non défini'}</small>
            `;
            listEl.appendChild(item);
          });
          console.log('DEBUG: Interventions populated.');
        } else {
          console.log('DEBUG: No interventions found.');
        }

        // Load messages for the demand
        loadMessages();
        console.log('DEBUG: loadMessages called.');

      } catch (err) {
        document.querySelector('main').innerHTML = `<div class="alert alert-danger">Erreur: ${err.message}</div>`;
        console.error('DEBUG: Error in main try-catch block:', err);
      }
    });
  