document.addEventListener('DOMContentLoaded', async function() {
      const tableBody = document.getElementById('sites-table-body');
      const searchInput = document.getElementById('site-search');
    const statusFilter = document.getElementById('site-status-filter');
    const dateStartInput = document.getElementById('site-date-start');
    const dateEndInput = document.getElementById('site-date-end');
    const thDates = document.getElementById('th-dates');
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
        tableBody.innerHTML = '<tr><td colspan="7" class="text-muted">Chargement...</td></tr>';
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
          tableBody.innerHTML = '<tr><td colspan="7" class="text-danger">Erreur de chargement.</td></tr>';
        }
      }

      function render(rows) {
        tableBody.innerHTML = '';
        if (!rows.length) { const tr = tableBody.insertRow(); tr.innerHTML = '<td colspan="7" class="text-center text-muted">Aucun site trouvé.</td>'; return; }
        rows.forEach(site => {
          const tr = tableBody.insertRow();
          const debut = fmt(site.date_debut); const fin = site.date_fin? fmt(site.date_fin) : 'En cours';
          const hasTicket = !!site.ticket || openDemandSites.has(String(site.id));
        const addressQuery = encodeURIComponent(site.adresse_ligne1 || site.adresse_libelle || '');
        const addressLink = addressQuery ? `<a href="https://www.google.com/maps/search/?api=1&query=${addressQuery}" target="_blank" rel="noopener noreferrer">${site.adresse_libelle || site.adresse_ligne1 || site.adresse_id || 'N/A'}</a>` : (site.adresse_libelle || site.adresse_ligne1 || site.adresse_id || 'N/A');

          tr.innerHTML = `
            <td>${site.nom_site||''}</td>
            <td>${addressLink}</td>
            <td>${site.statut || '—'}</td>
            <td><span class="badge ${hasTicket? 'bg-danger':'bg-success'}">${hasTicket? 'Oui':'Non'}</span></td>
            <td>${site.responsable_matricule? getAgentName(site.responsable_matricule): 'Non assigné'}</td>
            <td><small>Début: ${debut||''}<br>Fin: ${fin||''}</small></td>
            <td>
              <button class="btn btn-sm btn-info me-1" data-bs-toggle="modal" data-bs-target="#viewSiteModal" data-id="${site.id}"><i class="bi bi-eye"></i> Voir</button>
              ${isAdmin ? `<button class="btn btn-sm btn-warning me-1" data-bs-toggle="modal" data-bs-target="#editSiteModal" data-id="${site.id}"><i class="bi bi-pencil"></i> Modifier</button>` : ''}
            </td>`;
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
          const addressText = `${s.adresse_ligne1 || ''}`.toLowerCase();
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
      thDates.addEventListener('click', ()=>{ sortAsc=!sortAsc; applyFilters(); });

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
