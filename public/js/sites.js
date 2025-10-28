document.addEventListener('DOMContentLoaded', async function() {
      const tableBody = document.getElementById('sites-table-body');
      const searchInput = document.getElementById('site-search');
      const statusFilter = document.getElementById('site-status-filter');
      const dateStartInput = document.getElementById('site-date-start');
      const dateEndInput = document.getElementById('site-date-end');
      const thDates = document.getElementById('th-dates');

      const token = localStorage.getItem('token');
      const isAdmin = (() => { try { const p = token? JSON.parse(atob(token.split('.')[1])):null; return Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch { return false; } })();
      let apiSites = [];
      let apiAgents = [];
      let sortAsc = true;

      function fmt(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d)?'':d.toLocaleDateString(); }
      function getAgentName(m) { const a=(apiAgents||[]).find(x=> String(x.matricule)===String(m)); return a? `${a.nom||''} ${a.prenom||''}`.trim() : 'Non assigné'; }

      async function load() {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-muted">Chargement...</td></tr>';
        const headers = token? { 'Authorization': `Bearer ${token}` } : {};
        try {
          const [sRes, aRes] = await Promise.all([
            fetch('/api/sites', { headers, credentials:'same-origin' }),
            fetch('/api/agents', { headers, credentials:'same-origin' })
          ]);
          if (sRes.status===401||sRes.status===403){ try{ location.replace('/login.html'); }catch{ location.href='/login.html'; } return; }
          apiSites = sRes.ok ? await sRes.json() : [];
          apiAgents = aRes.ok ? await aRes.json() : [];
          applyFilters();
        } catch (e) {
          tableBody.innerHTML = '<tr><td colspan="8" class="text-danger">Erreur de chargement.</td></tr>';
        }
      }

      function render(rows) {
        tableBody.innerHTML = '';
        if (!rows.length) { const tr = tableBody.insertRow(); tr.innerHTML = '<td colspan="8" class="text-center text-muted">Aucun site trouvé.</td>'; return; }
        rows.forEach(site => {
          const tr = tableBody.insertRow();
          const sclass = ({'en attente':'bg-secondary','prise en charge':'bg-info','en cour':'bg-warning','fini':'bg-success','sous devis':'bg-primary'})[site.statut] || 'bg-light text-dark';
          const debut = fmt(site.date_debut); const fin = site.date_fin? fmt(site.date_fin) : 'En cours';
          tr.innerHTML = `
            <td>${site.id}</td>
            <td>${site.nom_site||''}</td>
            <td>${site.adresse_id||''}</td>
            <td><span class="badge ${sclass}">${site.statut||''}</span></td>
            <td><span class="badge ${site.ticket? 'bg-danger':'bg-success'}">${site.ticket? 'Oui':'Non'}</span></td>
            <td>${site.responsable_matricule? getAgentName(site.responsable_matricule): 'Non assigné'}</td>
            <td><small>Début: ${debut||''}<br>Fin: ${fin||''}</small></td>
            <td>
              <a href="site-view.html?id=${site.id}" class="btn btn-sm btn-info me-1"><i class="bi bi-eye"></i> Voir</a>
              ${isAdmin ? `<a href="site-edit.html?id=${site.id}" class="btn btn-sm btn-warning me-1"><i class="bi bi-pencil"></i> Modifier</a>` : ''}
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
          const m = String(s.nom_site||'').toLowerCase().includes(term) || String(s.id||'').toLowerCase().includes(term);
          const st = status ? s.statut===status : true;

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
      load();
    });