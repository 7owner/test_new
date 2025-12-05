document.addEventListener('DOMContentLoaded', async function() {
      const grid = document.getElementById('sites-grid');
      const countBadge = document.getElementById('sites-count');
      const searchInput = document.getElementById('site-search');
    const statusFilter = document.getElementById('site-status-filter');
    const dateStartInput = document.getElementById('site-date-start');
    const dateEndInput = document.getElementById('site-date-end');
    const filtersRow = document.getElementById('filters-row');
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');

      const token = localStorage.getItem('token');
      const isAdmin = (() => { try { const p = token? JSON.parse(atob(token.split('.')[1])):null; return Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch { return false; } })();
    let apiSites = [];
    let apiAgents = [];
    let openDemandSites = new Set(); // sites avec au moins une demande non convertie
    let sortAsc = true;

      function fmt(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d)?'':d.toLocaleDateString(); }
      function getAgentName(m) { const a=(apiAgents||[]).find(x=> String(x.matricule)===String(m)); return a? `${a.nom||''} ${a.prenom||''}`.trim() : 'Non assigné'; }

      async function load() {
        grid.innerHTML = '<div class="col-12 text-muted small">Chargement...</div>';
        const headers = token? { 'Authorization': `Bearer ${token}` } : {};
        try {
          const [sRes, aRes, dRes] = await Promise.all([
            fetch('/api/sites', { headers, credentials:'same-origin' }),
            fetch('/api/agents', { headers, credentials:'same-origin' }),
            fetch('/api/demandes_client?include_deleted=false', { headers, credentials:'same-origin' })
          ]);
          if (sRes.status===401||sRes.status===403){ try{ location.replace('/login.html'); }catch{ location.href='/login.html'; } return; }
          apiSites = sRes.ok ? await sRes.json() : [];
          apiAgents = aRes.ok ? await aRes.json() : [];
          openDemandSites = new Set();
          if (dRes && dRes.ok) {
            const demands = await dRes.json();
            (Array.isArray(demands)?demands:[]).forEach(d => {
              if (!d.ticket_id && d.site_id) openDemandSites.add(String(d.site_id));
            });
          }
          applyFilters();
        } catch (e) {
          grid.innerHTML = '<div class="col-12 text-danger">Erreur de chargement.</div>';
        }
      }

      function render(rows) {
        grid.innerHTML = '';
        if (countBadge) countBadge.textContent = `${rows.length} site(s)`;
        if (!rows.length) { grid.innerHTML = '<div class="col-12 text-center text-muted">Aucun site trouvé.</div>'; return; }
        rows.forEach(site => {
          const col = document.createElement('div');
          col.className = 'col-12 col-md-6 col-lg-4';
          const debut = fmt(site.date_debut); const fin = site.date_fin? fmt(site.date_fin) : 'En cours';
          const hasTicket = !!site.ticket || openDemandSites.has(String(site.id));
        const line1 = site.adresse_ligne1 || site.ligne1 || (site.adresse && (site.adresse.ligne1 || site.adresse.ligne_1)) || site.adresse_libelle || '';
        const line2 = site.adresse_ligne2 || site.ligne2 || (site.adresse && (site.adresse.ligne2 || site.adresse.ligne_2)) || '';
        const cpVille = [site.adresse_code_postal || (site.adresse && site.adresse.code_postal) || '', site.adresse_ville || (site.adresse && site.adresse.ville) || ''].filter(Boolean).join(' ');
        const pays = site.adresse_pays || (site.adresse && site.adresse.pays) || '';
        const addressLines = [line1, line2, cpVille, pays].filter(Boolean);
        const displayAddress = addressLines.length ? addressLines.join('<br>') : 'Adresse non renseignée';

          col.innerHTML = `
            <div class="border rounded p-3 h-100 d-flex flex-column shadow-sm">
              <div class="fw-semibold mb-1">${site.nom_site||'Site'}</div>
              <div class="mb-2"><span class="text-uppercase text-muted small">Adresse</span><br>${displayAddress}</div>
              <div class="mb-2"><span class="text-uppercase text-muted small">Responsable</span><br>${site.responsable_matricule? getAgentName(site.responsable_matricule): 'Non assigné'}</div>
              <div class="mb-2 d-flex gap-2 flex-wrap">
                <span class="badge ${site.statut==='Actif'?'bg-success-subtle text-success':'bg-light text-dark'}">${site.statut || '—'}</span>
                <span class="badge ${hasTicket? 'bg-danger':'bg-success'}">${hasTicket? 'Ticket ouvert':'Ticket fermé'}</span>
              </div>
              <div class="text-muted small mb-2">Début: ${debut||''}<br>Fin: ${fin||''}</div>
              <div class="mt-auto d-flex gap-2">
                <button class="btn btn-sm btn-info" data-bs-toggle="modal" data-bs-target="#viewSiteModal" data-id="${site.id}"><i class="bi bi-eye"></i> Voir</button>
                ${isAdmin ? `<button class="btn btn-sm btn-warning" data-bs-toggle="modal" data-bs-target="#editSiteModal" data-id="${site.id}"><i class="bi bi-pencil"></i> Modifier</button>` : ''}
              </div>
            </div>`;
          grid.appendChild(col);
        });
      }

      function applyFilters(){
        const term = (searchInput.value||'').toLowerCase();
        const status = statusFilter.value;
        const startDate = dateStartInput.value ? new Date(dateStartInput.value) : null;
        const endDate = dateEndInput.value ? new Date(dateEndInput.value) : null;

        if (startDate) startDate.setHours(0, 0, 0, 0);
        if (endDate) endDate.setHours(23, 59, 59, 999);

        let rows = (apiSites||[]).filter(s => {
          const l1 = s.adresse_ligne1 || s.ligne1 || (s.adresse && (s.adresse.ligne1 || s.adresse.ligne_1)) || '';
          const l2 = s.adresse_ligne2 || s.ligne2 || (s.adresse && (s.adresse.ligne2 || s.adresse.ligne_2)) || '';
          const cpv = [s.adresse_code_postal || (s.adresse && s.adresse.code_postal) || '', s.adresse_ville || (s.adresse && s.adresse.ville) || ''].filter(Boolean).join(' ');
          const pays = s.adresse_pays || (s.adresse && s.adresse.pays) || '';
          const addressText = `${l1} ${l2} ${cpv} ${pays}`.toLowerCase();
          const m = String(s.nom_site||'').toLowerCase().includes(term)
            || String(s.id||'').toLowerCase().includes(term)
            || addressText.includes(term);
          const st = status ? s.statut === status : true;

          const siteStart = s.date_debut ? new Date(s.date_debut) : null;
          const siteEnd = s.date_fin ? new Date(s.date_fin) : null;

          if (startDate && siteEnd && siteEnd < startDate) return false;
          if (endDate && siteStart && siteStart > endDate) return false;

          return m && st;
        });

        rows.sort((a,b)=>{
          const da = a.date_debut? new Date(a.date_debut).getTime():0;
          const db = b.date_debut? new Date(b.date_debut).getTime():0;
          return sortAsc? (da-db):(db-da);
        });
        render(rows);
      }

      searchInput.addEventListener('input', applyFilters);
      statusFilter.addEventListener('change', applyFilters);
      dateStartInput.addEventListener('change', applyFilters);
      dateEndInput.addEventListener('change', applyFilters);
      // tri par date désactivé (table remplacée par cartes), on garde l'ordre par date_debut croissante

      // NEW Toggle filters button logic
      if (toggleFiltersBtn && filtersRow) {
        toggleFiltersBtn.innerHTML = '<i class="bi bi-funnel-fill me-1"></i> Masquer les filtres';
        toggleFiltersBtn.addEventListener('click', () => {
          const hidden = filtersRow.classList.toggle('d-none');
          toggleFiltersBtn.innerHTML = hidden
            ? '<i class="bi bi-eye me-1"></i> Afficher les filtres'
            : '<i class="bi bi-funnel-fill me-1"></i> Masquer les filtres';
        });
      }

      load();

      const createSiteModal = document.getElementById('createSiteModal');
      const viewSiteModal = document.getElementById('viewSiteModal');
      const editSiteModal = document.getElementById('editSiteModal');
      const viewSiteFrame = document.getElementById('viewSiteFrame');
      const editSiteFrame = document.getElementById('editSiteFrame');

      if (createSiteModal) {
        createSiteModal.addEventListener('show.bs.modal', function (event) {
          const createSiteFrame = createSiteModal.querySelector('iframe');
          if (createSiteFrame) {
            createSiteFrame.src = '/site-new.html';
          }
        });
        createSiteModal.addEventListener('hidden.bs.modal', load);
      }

      if (viewSiteModal) {
        viewSiteModal.addEventListener('show.bs.modal', function (event) {
          const button = event.relatedTarget;
          const siteId = button.getAttribute('data-id');
          viewSiteFrame.src = `/site-view.html?id=${siteId}`;
        });
      }

      if (editSiteModal) {
        editSiteModal.addEventListener('show.bs.modal', function (event) {
          const button = event.relatedTarget;
          const siteId = button.getAttribute('data-id');
          editSiteFrame.src = `/site-edit.html?id=${siteId}`;
        });
        editSiteModal.addEventListener('hidden.bs.modal', load);
      }
    });
