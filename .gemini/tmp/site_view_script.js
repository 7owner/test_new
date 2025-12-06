document.addEventListener('DOMContentLoaded', async function() {
      const qp = new URLSearchParams(location.search);
      const siteId = qp.get('id');
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const set = (id, val, isHtml = false) => { 
        const el = document.getElementById(id); 
        if(el) {
          if (isHtml) el.innerHTML = val || '—';
          else el.textContent = val || '—';
        }
      };

      if (!siteId) {
        set('site-name', 'Erreur');
        set('tickets-list', '<div class="alert alert-danger">ID du site manquant.</div>', true);
        return;
      }


      try {
        const data = await fetch(`/api/sites/${siteId}/relations`, { headers, credentials:'same-origin' }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        });

        const { site, adresse, tickets = [], representants = [], client, contrats = [] } = data; // Added contrats

        // --- Populate Site & Client Info ---
        set('site-name', site.nom_site);
        
        // Display contract titles
        const contractTitlesSpan = document.getElementById('contract-titles');
        if (contractTitlesSpan && contrats.length > 0) {
                    const contractLinks = contrats.map(c =>
                      `<a href="#" class="link-button" style="color: white;" data-bs-toggle="modal" data-bs-target="#contractModal" data-contract-id="${c.id}">${c.titre || 'Contrat #' + c.id}</a>`
                    );          contractTitlesSpan.innerHTML = `(${contractLinks.join(', ')})`;
        } else if (contractTitlesSpan) {
          contractTitlesSpan.innerHTML = '';
        }

        set('view_client', site.nom_client || client?.nom_client || 'Non assigné');
        const contact = `${site.representant_nom || ''} ${site.representant_tel || ''}`.trim();
        set('view_contact', contact || 'Non spécifié');
        set('view_commentaire', site.commentaire || 'Aucun commentaire.');

        // --- Populate Address ---
        if (adresse) {
            const adr = [
                adresse.ligne1,
                adresse.ligne2,
                `${adresse.code_postal||''} ${adresse.ville||''}`,
                adresse.pays
            ].filter(Boolean).join('<br>');
            set('view_adresse', adr, true);
        }

        // --- Populate Tickets ---
        set('tickets-count', `${tickets.length} ticket(s)`);
        const ticketsList = document.getElementById('tickets-list');
        ticketsList.innerHTML = '';
        if (tickets.length === 0) {
            ticketsList.innerHTML = '<div class="text-muted">Aucun ticket associé à ce site.</div>';
        } else {
            tickets.forEach(t => {
                const el = document.createElement('div');
                const dateStr = t.date_debut ? new Date(t.date_debut).toLocaleDateString() : '';
                const etat = (t.etat || '').toLowerCase();
                const badgeClass = etat.includes('termin') ? 'status-termine' : etat.includes('cours') ? 'status-cours' : 'status-attente';
                
                el.className = 'ticket-item';
                el.innerHTML = `
                  <div class="d-flex justify-content-between align-items-start">
                    <div>
                      <a class="fw-semibold text-decoration-none" href="ticket-view.html?id=${t.id}">#${t.id} — ${t.titre || 'Sans titre'}</a>
                      ${t.demande_titre ? `<div class="small text-info fst-italic">Lié à la demande : ${t.demande_titre}</div>` : ''}
                      <div class="small text-muted">${t.description || 'Pas de description.'}</div>
                    </div>
                    <div class="text-end" style="min-width: 100px;">
                      <div class="status-pill ${badgeClass}">${(t.etat||'').replace('_',' ')}</div>
                      <div class="small text-muted mt-1">${dateStr}</div>
                    </div>
                  </div>`;
                ticketsList.appendChild(el);
            });
        }

        // --- Représentants client ---
        const repsList = document.getElementById('representants-list');
        if (repsList) {
          repsList.innerHTML = '';
          if (!representants.length) {
            repsList.innerHTML = '<div class="text-muted">Aucun représentant.</div>';
          } else {
            representants.forEach(rep => {
              const badge = (rep.nom || rep.email || 'N')[0].toUpperCase();
              repsList.innerHTML += `
                <div class="d-flex align-items-start mb-2">
                  <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;">
                    ${badge}
                  </div>
                  <div class="ms-3">
                    <div class="fw-semibold">${rep.nom || 'Inconnu'}</div>
                    <div class="small text-muted">${rep.fonction || ''}</div>
                    <div class="small text-muted"><i class="bi bi-envelope me-1"></i>${rep.email || 'N/A'} ${rep.tel ? `<span class="ms-2"><i class="bi bi-phone me-1"></i>${rep.tel}</span>` : ''}</div>
                  </div>
                </div>`;
            });
          }
        }

        // Modal client
        const clientId = site.client_id || client?.id;
        const clientLink = document.getElementById('view_client');
        if (clientId && clientLink) {
          clientLink.classList.add('link-button');
          clientLink.addEventListener('click', () => {
            const frame = document.getElementById('clientModalFrame');
            if (frame) frame.src = `client-view.html?id=${clientId}`;
            const modalEl = document.getElementById('clientModal');
            if (modalEl) {
              const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
              modal.show();
            }
          });
        }

        // Contract Modal Handler
        const contractModal = document.getElementById('contractModal');
        if (contractModal) {
          contractModal.addEventListener('show.bs.modal', function (event) {
            const button = event.relatedTarget; // Button that triggered the modal
            const contractId = button.getAttribute('data-contract-id'); // Extract info from data-* attributes
            const iframe = document.getElementById('contractModalFrame');
            if (contractId && iframe) {
              iframe.src = `contrat-view.html?id=${contractId}`;
            }
          });
        }

      } catch(e) {
        console.error('Erreur chargement des détails du site:', e);
        document.querySelector('main').innerHTML = `<div class="alert alert-danger">Impossible de charger les informations du site. ${e.message}</div>`;
      }
    });