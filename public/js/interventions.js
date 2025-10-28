document.addEventListener('DOMContentLoaded', function() {
      const tableBody = document.getElementById('interventions-table-body');
      const searchInput = document.getElementById('intervention-search');
      const statusFilter = document.getElementById('intervention-status-filter');

      const token = localStorage.getItem('token');
      let currentUserIsAdmin = false; let actorEmail = '';
      if (token) {
        try { const p = JSON.parse(atob(token.split('.')[1])); const roles = Array.isArray(p.roles)?p.roles:[]; currentUserIsAdmin = roles.includes('ROLE_ADMIN'); actorEmail = p.email||''; const el = document.getElementById('logged-in-user-email'); if (el && actorEmail) el.textContent = actorEmail; } catch(_){}
      }

      let allInterventions = [];

      function renderInterventions(list) {
        tableBody.innerHTML = '';
        if (!list.length) { const row = tableBody.insertRow(); row.innerHTML = '<td colspan="7" class="text-center text-muted">Aucune intervention trouvée.</td>'; return; }
        list.forEach(intervention => {
          const row = tableBody.insertRow();
          const statusVal = intervention.status || intervention.statut || '';
          let statusBadgeClass = '';
          switch (statusVal) {
            case 'Pas_commence': statusBadgeClass = 'bg-secondary'; break;
            case 'Bloque': statusBadgeClass = 'bg-danger'; break;
            case 'En_attente': statusBadgeClass = 'bg-info'; break;
            case 'En_cours': statusBadgeClass = 'bg-warning'; break;
            case 'Termine': statusBadgeClass = 'bg-success'; break;
            default: statusBadgeClass = 'bg-light text-dark';
          }
          row.innerHTML = `
            <td>${intervention.id}</td>
            <td>${intervention.ticket_id || ''}</td>
            <td>${intervention.description || ''}</td>
            <td>${intervention.date_debut || ''}</td>
            <td>${intervention.date_fin || 'N/A'}</td>
            <td><span class="badge ${statusBadgeClass}">${statusVal}</span></td>
            <td>
              <a href="intervention-view.html?id=${intervention.id}" class="btn btn-sm btn-info me-1"><i class="bi bi-eye"></i> Voir</a>
              ${currentUserIsAdmin ? `
                <a href="intervention-edit.html?id=${intervention.id}" class="btn btn-sm btn-warning me-1"><i class="bi bi-pencil"></i> Modifier</a>
                <button class="btn btn-sm btn-danger" data-action="delete" data-id="${intervention.id}"><i class="bi bi-trash"></i> Supprimer</button>
              ` : ''}
            </td>`;
          if (currentUserIsAdmin) {
            const btn = row.querySelector('button[data-action="delete"]');
            if (btn) btn.addEventListener('click', () => deleteIntervention(intervention.id));
          }
        });
      }

      function applyFilters() {
        const term = (searchInput.value||'').toLowerCase();
        const selected = statusFilter.value;
        const filtered = allInterventions.filter(iv => {
          const statusVal = iv.status || iv.statut || '';
          const matchesSearch = (iv.description||'').toLowerCase().includes(term) || String(iv.id).toLowerCase().includes(term);
          const matchesStatus = !selected || statusVal === selected;
          return matchesSearch && matchesStatus;
        });
        renderInterventions(filtered);
      }

      async function fetchInterventions() {
        if (!token) { renderInterventions([]); return; }
        try {
          const res = await fetch('/api/interventions', { headers: { 'Authorization': `Bearer ${token}`, 'X-Actor-Email': actorEmail }, credentials: 'same-origin' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          allInterventions = (Array.isArray(data)?data:[]).map(i => ({
            id: String(i.id),
            ticket_id: i.ticket_id || '',
            description: i.description || '',
            date_debut: i.date_debut || '',
            date_fin: i.date_fin || '',
            status: i.status || i.statut || ''
          }));
          applyFilters();
        } catch(e) { console.error('Erreur chargement interventions:', e); renderInterventions([]); }
      }

      async function deleteIntervention(id) {
        if (!token || !confirm('Supprimer cette intervention ?')) return;
        try {
          const res = await fetch(`/api/interventions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'X-Actor-Email': actorEmail }, credentials: 'same-origin' });
          if (res.status === 204) { allInterventions = allInterventions.filter(i => String(i.id)!==String(id)); applyFilters(); }
          else if (res.status === 403) alert('Action réservée aux administrateurs.');
          else alert(`Suppression échouée (HTTP ${res.status}).`);
        } catch(e) { console.error('Erreur suppression intervention:', e); alert('Erreur lors de la suppression.'); }
      }

      searchInput.addEventListener('input', applyFilters);
      statusFilter.addEventListener('change', applyFilters);

      if (!currentUserIsAdmin) {
        const link = document.querySelector('a[href="intervention-new.html"]'); if (link) link.classList.add('d-none');
      }

      fetchInterventions();
    });