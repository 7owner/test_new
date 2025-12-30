async function buildHeaders(json=false){
      const h = json? { 'Content-Type':'application/json' } : {};
      const token = localStorage.getItem('token');
      if (token) { h['Authorization'] = `Bearer ${token}`; return h; }
      try { const r = await fetch('/api/csrf-token', { credentials:'same-origin' }); const d = await r.json().catch(()=>({})); if (d && d.csrfToken) h['CSRF-Token'] = d.csrfToken; } catch {}
      return h;
    }

    document.addEventListener('DOMContentLoaded', function() {
      // Tickets ouverts (liste, triés, limités)
      const urgentMaintenancesDiv = document.getElementById('urgentMaintenances');
      (async () => {
        let siteMap = new Map();
        try { const rs = await fetch('/api/sites', { headers: await buildHeaders(false), credentials:'same-origin' }); if (rs.ok){ const rows = await rs.json(); siteMap = new Map((rows||[]).map(s => [String(s.id), s.nom_site || `Site #${s.id}`])); } } catch {}
        try {
          const r = await fetch('/api/tickets', { headers: await buildHeaders(false), credentials:'same-origin' });
          const data = r.ok? await r.json() : [];
          let open = (Array.isArray(data)? data: []).filter(t => String(t.etat) !== 'Termine');
          const getWhen = t => t.date_debut || t.date_fin || null;
          open.sort((a,b) => (new Date(getWhen(b)||0)) - (new Date(getWhen(a)||0)) );
          const limited = open.slice(0,5);
          if (!limited.length) { urgentMaintenancesDiv.innerHTML = '<p class="text-muted">Aucun ticket ouvert.</p>'; return; }
          urgentMaintenancesDiv.innerHTML = '';
          limited.forEach(t => {
            const siteName = siteMap.get(String(t.site_id)) || (t.site_id ? `Site #${t.site_id}` : 'N/A');
            const badge = (s => { switch(String(s||'')) { case 'Pas_commence': return 'bg-secondary'; case 'En_attente': return 'bg-info'; case 'En_cours': return 'bg-warning'; case 'Bloque': return 'bg-danger'; default: return 'bg-light text-dark'; } })(t.etat);
            const el = document.createElement('div'); el.className='card card-body mb-2';
            el.innerHTML = `
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h6 class="card-title mb-1">${t.titre || '(Sans titre)'}</h6>
                  <p class="card-text text-muted mb-1">Site: ${siteName}</p>
                  <span class="badge ${badge}">${String(t.etat||'').replace('_',' ')}</span>
                </div>
                <div>
                  <button class="btn btn-sm btn-info ticket-modal-btn" data-id="${t.id}"><i class="bi bi-eye"></i> Détails</button>
                </div>
              </div>`;
            urgentMaintenancesDiv.appendChild(el);
          });
          const footer = document.createElement('div'); footer.className='d-flex justify-content-end mt-2'; footer.innerHTML = '<a class="btn btn-sm btn-outline-primary" href="/tickets.html">Voir tout</a>'; urgentMaintenancesDiv.appendChild(footer);
        } catch (e) { urgentMaintenancesDiv.innerHTML = '<p class="text-muted">Impossible de charger les tickets ouverts.</p>'; }
      })();

      // Commandes reçues
      const ordersReceivedDiv = document.getElementById('ordersReceived');
      (async () => {
        if (!ordersReceivedDiv) return;
        try {
          const headers = await buildHeaders(false);
          // Fetch full dashboard data which now includes recentOrders
          const dashboardData = await (await fetch('/api/dashboard', { headers, credentials: 'same-origin' })).json();
          const recentOrders = dashboardData.recentOrders || [];

          if (!recentOrders.length) {
            ordersReceivedDiv.innerHTML = '<p class="text-muted">Aucune commande reçue.</p>';
            return;
          }
          ordersReceivedDiv.innerHTML = '';
          
          recentOrders.forEach(cmd => {
            const el = document.createElement('div');
            el.className = 'card card-body mb-2';
            const prix = cmd.prix_achat != null ? `${Number(cmd.prix_achat).toFixed(2)} €` : '—';
            const qtyUsed = Number(cmd.total_quantite_used_in_interventions || 0);
            const status = cmd.commande_status || 'N/A';
            const statusBadge = (() => {
              switch (status) {
                case 'Reçu':
                case 'Recu': return 'bg-success';
                case 'Installé': return 'bg-info text-dark';
                case 'En livraison': return 'bg-warning text-dark';
                default: return 'bg-secondary';
              }
            })();

            el.innerHTML = `
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <div class="fw-semibold">${cmd.reference || 'Sans ref.'} — ${cmd.designation || cmd.titre || ''}</div>
                  <div class="small text-muted">Fournisseur: ${cmd.fournisseur || '—'}</div>
                  <div class="small text-muted">Prix: ${prix}</div>
                  <div class="small text-muted">Quantité (interventions): ${qtyUsed}</div>
                </div>
                <div class="d-flex flex-column align-items-end gap-1">
                  <span class="badge ${statusBadge}">${status}</span>
                  <a class="btn btn-sm btn-outline-primary btn-intervention-modal" data-id="${cmd.intervention_id || ''}">
                    <i class="bi bi-search"></i> Trouver intervention
                  </a>
                </div>
              </div>`;
            ordersReceivedDiv.appendChild(el);
          });
          const footer = document.createElement('div');
          footer.className = 'd-flex justify-content-end mt-2';
          footer.innerHTML = '<a class="btn btn-sm btn-outline-primary" href="/materiel-gestion.html">Voir toutes</a>';
          ordersReceivedDiv.appendChild(footer);
        } catch (e) {
          ordersReceivedDiv.innerHTML = '<p class="text-muted">Impossible de charger les commandes.</p>';
        }
      })();

      // Ouverture modal intervention depuis les commandes reçues
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-intervention-modal');
        if (!btn) return;
        const id = btn.dataset.id;
        const modalEl = document.getElementById('orderInterventionModal');
        const frame = document.getElementById('orderInterventionFrame');
        if (modalEl && frame) {
          frame.src = `/intervention-view.html?id=${id}`;
          const m = bootstrap.Modal.getOrCreateInstance(modalEl);
          m.show();
        }
      });

      // Ouverture du ticket en modal depuis la carte "Tickets ouverts récents"
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.ticket-modal-btn');
        if (!btn) return;
        const id = btn.dataset.id;
        const modalEl = document.getElementById('ticketModal');
        const frame = document.getElementById('ticketFrame');
        if (modalEl && frame) {
          frame.src = `/ticket-view.html?id=${id}`;
          const m = bootstrap.Modal.getOrCreateInstance(modalEl);
          m.show();
        }
      });

      // Tickets (ouvert/total) + graphiques (bar + donut)
      (async () => {
        try {
          const rt = await fetch('/api/tickets', { headers: await buildHeaders(false), credentials:'same-origin' });
          const rows = rt.ok? await rt.json() : [];
          const tickets = Array.isArray(rows)? rows : [];
          const openCount = tickets.filter(t => String(t.etat) !== 'Termine').length;
          const totalCount = tickets.length;
          document.getElementById('activeMaintenances').textContent = `${openCount} / ${totalCount}`;

          const byMonth = new Array(12).fill(0);
          tickets.forEach(t => { const d = t.date_debut ? new Date(t.date_debut) : (t.date_fin ? new Date(t.date_fin) : null); if (!d || isNaN(d)) return; byMonth[d.getMonth()]++; });
          const ctx = document.getElementById('monthlyMaintenanceChart');
          if (ctx && window.Chart) {
            const existing = Chart.getChart('monthlyMaintenanceChart'); if (existing) existing.destroy();
            new Chart(ctx, { type: 'bar', data: { labels: ['Jan','Fev','Mar','Avr','Mai','Juin','Juil','Aout','Sep','Oct','Nov','Dec'], datasets: [{ label:'Tickets par mois', data: byMonth, backgroundColor:'rgba(13,110,253,0.6)', borderColor:'rgba(13,110,253,1)', borderWidth:1 }] }, options:{ responsive:true, scales:{ y:{ beginAtZero:true }}} });
          }


        } catch {}
      })();

      // Compteurs
      (async () => {
        try {
          const r = await fetch('/api/sites', { headers: await buildHeaders(false), credentials:'same-origin' });
          const rows = r.ok? await r.json(): [];
          const sites = Array.isArray(rows)? rows : [];
          const actifs = sites.filter(s => !s.date_fin || new Date(s.date_fin) >= new Date()).length;
          const inactifs = sites.length - actifs;
          const elCount = document.getElementById('sitesUnderContract');
          const elBreakdown = document.getElementById('sitesUnderContractBreakdown');
          if (elCount) elCount.textContent = `${actifs} / ${sites.length}`;
          if (elBreakdown) elBreakdown.textContent = `${actifs} actifs · ${inactifs} non actifs`;
        } catch {
          const elCount = document.getElementById('sitesUnderContract');
          const elBreakdown = document.getElementById('sitesUnderContractBreakdown');
          if (elCount) elCount.textContent = '-';
          if (elBreakdown) elBreakdown.textContent = 'Actifs / non actifs';
        }
      })();
      (async () => {
        const elPending = document.getElementById('demandesPending');
        const elBreakdown = document.getElementById('demandesBreakdown');
        try {
          const r = await fetch('/api/demandes_client', { headers: await buildHeaders(false), credentials:'same-origin' });
          const rows = r.ok ? await r.json() : [];
          let pending = 0, converted = 0;
          (Array.isArray(rows) ? rows : []).forEach(d => {
            if (d.ticket_id) converted++;
            else pending++;
          });
          if (elPending) elPending.textContent = pending;
          if (elBreakdown) elBreakdown.textContent = `${pending} en file · ${converted} converties`;
        } catch {
          if (elPending) elPending.textContent = '-';
          if (elBreakdown) elBreakdown.textContent = 'En file · converties';
        }
      })();
      (async () => { try { const r = await fetch('/api/factures', { headers: await buildHeaders(false), credentials:'same-origin' }); const rows = r.ok? await r.json(): []; document.getElementById('facturesCount').textContent = Array.isArray(rows)? rows.length: 0; } catch {} })();
      (async () => { try { const r = await fetch('/api/reglements', { headers: await buildHeaders(false), credentials:'same-origin' }); const rows = r.ok? await r.json(): []; document.getElementById('reglementsCount').textContent = Array.isArray(rows)? rows.length: 0; } catch {} })();

      // Messagerie: nombre de conversations
      (async () => {
        const elCount = document.getElementById('messagesCount');
        const elBreak = document.getElementById('messagesBreakdown');
        if (!elCount) return;
        try {
          const r = await fetch('/api/conversations', { headers: await buildHeaders(false), credentials:'same-origin' });
          const rows = r.ok ? await r.json() : [];
          const convs = Array.isArray(rows) ? rows : [];
          elCount.textContent = convs.length;
          if (elBreak) elBreak.textContent = 'Conversations';
        } catch {
          elCount.textContent = '-';
          if (elBreak) elBreak.textContent = 'Conversations';
        }
      })();
    });
