
    document.addEventListener('DOMContentLoaded', async () => {
      const params = new URLSearchParams(location.search);
      const id = params.get('id');
      const feedback = document.getElementById('feedback');
      if (!id) { feedback.className='text-danger'; feedback.textContent='ID manquant'; return; }
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': token? `Bearer ${token}` : '' };
      async function api(url) {
        const r = await fetch(url, { headers });
        const b = await r.json().catch(()=>({}));
        if (!r.ok) throw new Error(b.error || r.statusText);
        return b;
      }
      try {
        const contrat = await api(`/api/contrats/${id}`);
        const sites = await api(`/api/contrats/${id}/sites`);
        const agents = await api('/api/agents').catch(() => []);

        // cache agents par matricule pour éviter les undefined
        const agentMap = new Map();
        (Array.isArray(agents) ? agents : []).forEach(a => {
          const full = `${a.nom || ''} ${a.prenom || ''}`.trim();
          agentMap.set(String(a.matricule), full || a.matricule || 'Non assigné');
        });
        const agentName = (matricule) => agentMap.get(String(matricule)) || 'Non assigné';
        document.getElementById('titre').textContent = contrat.titre || 'Contrat';
        document.getElementById('date-debut').textContent = contrat.date_debut ? new Date(contrat.date_debut).toLocaleDateString() : '—';
        document.getElementById('date-fin').textContent = contrat.date_fin ? new Date(contrat.date_fin).toLocaleDateString() : '—';

        const grid = document.getElementById('sites-grid');
        const count = document.getElementById('sites-count');
        grid.innerHTML = '';
        count.textContent = `${sites.length} site(s)`;
        if (!sites.length) {
          grid.innerHTML = '<div class="col-12 text-muted small">Aucun site lié.</div>';
        } else {
          sites.forEach(s => {
            const col = document.createElement('div');
            col.className = 'col-12 col-md-6';
            const line1 = s.adresse_ligne1 || s.ligne1 || (s.adresse && (s.adresse.ligne1 || s.adresse.ligne_1)) || s.adresse_libelle || s.adresse_id || '';
            const lineFull = [
              line1,
              s.adresse_ligne2 || '',
              [s.adresse_code_postal || '', s.adresse_ville || ''].filter(Boolean).join(' '),
              s.adresse_pays || ''
            ].filter(Boolean).join(' ');
            const query = encodeURIComponent(lineFull || line1 || '');
            const addressLink = query ? `<a href="https://www.google.com/maps/search/?api=1&query=${query}" target="_blank" rel="noopener noreferrer">${lineFull || 'Adresse non renseignée'}</a>` : (lineFull || 'Adresse non renseignée');
            col.innerHTML = `
              <div class="border rounded p-3 h-100 d-flex flex-column shadow-sm">
                <div class="fw-semibold mb-1">${s.nom_site || 'Site'}</div>
                <div class="mb-2">
                  <div class="text-uppercase text-muted small">Adresse</div>
                  <div>${addressLink}</div>
                </div>
                <div class="mb-2">
                  <div class="text-uppercase text-muted small">Responsable</div>
                  <div>${s.responsable_matricule ? `${agentName(s.responsable_matricule)} (${s.responsable_matricule})` : 'Non assigné'}</div>
                </div>
                <div class="mt-auto d-flex justify-content-between align-items-center">
                  <span class="badge bg-light text-dark">${s.statut || 'N/A'}</span>
                  <button class="btn btn-sm btn-outline-primary" data-bs-toggle="modal" data-bs-target="#siteModal" data-site-id="${s.site_id}">
                    Voir le site
                  </button>
                </div>
              </div>`;
            grid.appendChild(col);
          });
        }
      } catch (err) {
        feedback.className = 'text-danger';
        feedback.textContent = err.message || 'Erreur de chargement';
      }

      const siteModal = document.getElementById('siteModal');
      if (siteModal) {
        siteModal.addEventListener('show.bs.modal', function (event) {
          const button = event.relatedTarget;
          const siteId = button.getAttribute('data-site-id');
          const iframe = document.getElementById('siteModalFrame');
          if (siteId && iframe) {
            iframe.src = `site-view.html?id=${siteId}`;
          }
        });
      }
    });
  