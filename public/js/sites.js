document.addEventListener('DOMContentLoaded', async function() {
  const tableBody = document.getElementById('sites-tbody');
  const countBadge = document.getElementById('sites-count');
  const searchInput = document.getElementById('site-search');
  const associationFilter = document.getElementById('association-filter'); // New filter
  const dateStartInput = document.getElementById('site-date-start');
  const dateEndInput = document.getElementById('site-date-end');
  const filtersRow = document.getElementById('filters-row');
  const toggleFiltersBtn = document.getElementById('toggle-filters-btn');

  const token = localStorage.getItem('token');
  const isAdmin = (() => { try { const p = token? JSON.parse(atob(token.split('.')[1])):null; return Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch { return false; } })();
  let apiSites = [];
  let apiAgents = [];
  let openDemandSites = new Set();
  let sortAsc = true;

  function fmt(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d)?'':d.toLocaleDateString(); }
  function getAgentName(m) { const a=(apiAgents||[]).find(x=> String(x.matricule)===String(m)); return a? `${a.nom||''} ${a.prenom||''}`.trim() : 'Non assigné'; }

  async function load() {
    tableBody.innerHTML = '<tr><td colspan="8" class="text-muted text-center py-3">Chargement...</td></tr>';
    const headers = token? { 'Authorization': `Bearer ${token}` } : {};
    try {
      const [sRes, aRes, dRes] = await Promise.all([
        fetch('/api/sites', { headers, credentials:'same-origin' }),
        fetch('/api/agents', { headers, credentials:'same-origin' }),
        fetch('/api/demandes_client?include_deleted=false', { headers, credentials:'same-origin' })
      ]);
      if (sRes.status===401||sRes.status===403){ try{ location.replace('/login.html'); }catch{ location.href='/login.html'; } return; }
      apiSites = sRes.ok ? await sRes.json() : [];
      apiAgents = aRes && aRes.ok ? await aRes.json() : [];
      openDemandSites = new Set();
      if (dRes && dRes.ok) {
        const demands = await dRes.json();
        (Array.isArray(demands)?demands:[]).forEach(d => {
          if (!d.ticket_id && d.site_id) openDemandSites.add(String(d.site_id));
        });
      }
      applyFilters();
    } catch (e) {
      console.error(e);
      tableBody.innerHTML = '<tr><td colspan="8" class="text-danger text-center py-3">Erreur de chargement.</td></tr>';
    }
  }

  function render(rows) {
    tableBody.innerHTML = '';
    if (countBadge) countBadge.textContent = `${rows.length} site(s)`;
    if (!rows.length) { tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Aucun site trouvé.</td></tr>'; return; }
    rows.forEach(site => {
      const tr = document.createElement('tr');
      const debut = fmt(site.date_debut); const fin = site.date_fin? fmt(site.date_fin) : 'En cours';
      const hasTicket = !!site.ticket || openDemandSites.has(String(site.id));

      const displayAddressParts = [site.ligne1, `${site.code_postal} ${site.ville}`.trim(), site.pays].filter(Boolean);
      const displayAddress = displayAddressParts.length ? displayAddressParts.join('<br>') : 'Adresse non renseignée';
      const searchQuery = [site.ligne1, site.code_postal, site.ville, site.pays].filter(Boolean).join(', ');
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;

      const associatedAssociations = (site.associations || []).map(asso => `<span class="badge bg-secondary me-1">${asso.titre}</span>`).join('');

      tr.innerHTML = `
        <td><strong>${site.nom_site||'Site'}</strong><br><small class="text-muted">ID: ${site.id}</small></td>
        <td><a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="link-primary">${displayAddress}</a></td>
        <td><span class="badge ${site.statut==='Actif'?'bg-success-subtle text-success':'bg-light text-dark'}">${site.statut || '—'}</span></td>
        <td>${associatedAssociations || '<span class="text-muted">—</span>'}</td> <!-- New column for associations -->
        <td><span class="badge ${hasTicket? 'bg-danger':'bg-success'}">${hasTicket? 'Oui':'Non'}</span></td>
        <td>${site.responsable_matricule? getAgentName(site.responsable_matricule): 'Non assigné'}</td>
        <td><small>Début: ${debut||''}<br>Fin: ${fin||''}</small></td>
        <td class="d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-info view-site" data-id="${site.id}"><i class="bi bi-eye"></i></button>
          ${isAdmin ? `<button class="btn btn-sm btn-warning edit-site" data-id="${site.id}"><i class="bi bi-pencil"></i></button>` : ''}
        </td>`;
      tableBody.appendChild(tr);
    });
  }

      function applyFilters(){
        const term = (searchInput.value||'').toLowerCase();
        const associationSearchTerm = (associationFilter.value || '').toLowerCase(); // Get text input value
        const startDate = dateStartInput.value ? new Date(dateStartInput.value) : null;
        const endDate = dateEndInput.value ? new Date(dateEndInput.value) : null;

        if (startDate) startDate.setHours(0, 0, 0, 0);
        if (endDate) endDate.setHours(23, 59, 59, 999);

        let rows = (apiSites||[]).filter(s => {
          const l1 = s.ligne1 || s.adresse_ligne1 || (s.adresse && (s.adresse.ligne1 || s.adresse.ligne_1)) || '';
          const l2 = s.ligne2 || s.adresse_ligne2 || (s.adresse && (s.adresse.ligne2 || s.adresse.ligne_2)) || '';
          const cpv = [s.code_postal || s.adresse_code_postal || (s.adresse && s.adresse.code_postal) || '', s.ville || s.adresse_ville || (s.adresse && s.adresse.ville) || ''].filter(Boolean).join(' ');
          const pays = s.pays || s.adresse_pays || (s.adresse && s.adresse.pays) || '';
          const addressText = `${l1} ${l2} ${cpv} ${pays}`.toLowerCase();
          const m = String(s.nom_site||'').toLowerCase().includes(term)
            || String(s.id||'').toLowerCase().includes(term)
            || addressText.includes(term);
          
          // Filter by association title
          const matchesAssociation = !associationSearchTerm || (s.associations && s.associations.some(asso => asso.titre.toLowerCase().includes(associationSearchTerm)));
          
          const siteStart = s.date_debut ? new Date(s.date_debut) : null;
          const siteEnd = s.date_fin ? new Date(s.date_fin) : null;

          if (startDate && siteEnd && siteEnd < startDate) return false;
          if (endDate && siteStart && siteStart > endDate) return false;

          return m && matchesAssociation;
        });

        rows.sort((a,b)=>{
          const da = a.date_debut? new Date(a.date_debut).getTime():0;
          const db = b.date_debut? new Date(b.date_debut).getTime():0;
          return sortAsc? (da-db):(db-da);
        });
        render(rows);
      }

      searchInput.addEventListener('input', applyFilters);
      associationFilter.addEventListener('input', applyFilters); // Change to 'input' event listener
      dateStartInput.addEventListener('change', applyFilters);
      dateEndInput.addEventListener('change', applyFilters);
      
      tableBody.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.view-site');
        const editBtn = e.target.closest('.edit-site');
        if (viewBtn) {
          const siteId = viewBtn.getAttribute('data-id');
          const viewSiteModal = document.getElementById('viewSiteModal');
          const viewSiteFrame = document.getElementById('viewSiteFrame');
          if (viewSiteModal && viewSiteFrame) {
            viewSiteFrame.src = `/site-view.html?id=${siteId}`;
            const m = bootstrap.Modal.getOrCreateInstance(viewSiteModal);
            m.show();
          }
        }
        if (editBtn) {
          const siteId = editBtn.getAttribute('data-id');
          const editSiteModal = document.getElementById('editSiteModal');
          const editSiteFrame = document.getElementById('editSiteFrame');
          if (editSiteModal && editSiteFrame) {
            editSiteFrame.src = `/site-edit.html?id=${siteId}`;
            const m = bootstrap.Modal.getOrCreateInstance(editSiteModal);
            m.show();
          }
        }
      });

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
