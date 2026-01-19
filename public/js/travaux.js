document.addEventListener('DOMContentLoaded', () => {
  const travauxListDiv = document.getElementById('travauxList');
  const travauxForm = document.getElementById('travauxForm');
  const createTravauxModalEl = document.getElementById('createTravauxModal');
  const createTravauxModal = createTravauxModalEl ? new bootstrap.Modal(createTravauxModalEl) : null;

  const filterSearch = document.getElementById('filter_search');
  const filterEtat = document.getElementById('filter_etat');
  const filterPriorite = document.getElementById('filter_priorite');

  let cacheTravaux = [];
  let cacheDoes = [];
  let cacheAffaires = [];
  let cacheSites = [];
  let cacheDemandes = [];

  const token = localStorage.getItem('token');
  const headersAuth = token ? { 'Authorization': `Bearer ${token}` } : {};

  function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR');
  }

  function renderFilters() {
    // Populate filter dropdowns if needed
    // Currently, state and priority are hardcoded in HTML, but could be dynamic
  }

  function renderTravaux() {
    if (!travauxListDiv) return;
    if (!cacheTravaux.length) {
      travauxListDiv.innerHTML = '<div class="text-muted p-3">Aucun travail enregistré.</div>';
      return;
    }

    const q = (filterSearch?.value || '').toLowerCase();
    const fe = filterEtat?.value || '';
    const fp = filterPriorite?.value || '';

    const filtered = cacheTravaux.filter(t => {
      const matchSearch = 
        !q || 
        (t.titre || '').toLowerCase().includes(q) || 
        (t.description || '').toLowerCase().includes(q) || 
        (t.doe_titre || '').toLowerCase().includes(q) ||
        (t.affaire_nom || '').toLowerCase().includes(q) ||
        (t.site_nom || '').toLowerCase().includes(q) ||
        (t.demande_titre || '').toLowerCase().includes(q);
      const matchEtat = !fe || String(t.etat) === String(fe);
      const matchPriorite = !fp || String(t.priorite) === String(fp);
      return matchSearch && matchEtat && matchPriorite;
    });

    let html = `
      <table class="table align-middle">
        <thead>
          <tr>
            <th>Titre</th>
            <th>DOE</th>
            <th>Affaire</th>
            <th>Site</th>
            <th>Demande Client</th>
            <th>État</th>
            <th>Priorité</th>
            <th>Échéance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    filtered.forEach(t => {
      const etatClass = {
        'A_faire': 'bg-secondary',
        'En_cours': 'bg-primary',
        'Termine': 'bg-success',
        'En_attente': 'bg-warning text-dark',
        'Annule': 'bg-danger',
      }[t.etat] || 'bg-secondary';

      html += `
        <tr>
          <td>
            <div class="fw-semibold">${t.titre || 'Sans titre'}</div>
            <div class="small text-muted">${t.description || '—'}</div>
          </td>
          <td>${t.doe_titre || '—'}</td>
          <td>${t.affaire_nom || '—'}</td>
          <td>${t.site_nom || '—'}</td>
          <td>${t.demande_titre || '—'}</td>
          <td><span class="badge ${etatClass}">${t.etat || 'N/A'}</span></td>
          <td>${t.priorite || 'N/A'}</td>
          <td>${formatDate(t.date_echeance)}</td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary edit-travaux-btn" data-id="${t.id}" title="Modifier"><i class="bi bi-pencil-square"></i></button>
              <button class="btn btn-sm btn-outline-danger delete-travaux-btn" data-id="${t.id}" title="Supprimer"><i class="bi bi-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    });

    if (!filtered.length) {
      html += `<tr><td colspan="9" class="text-muted text-center py-3">Aucun travail ne correspond aux filtres.</td></tr>`;
    }
    html += '</tbody></table>';
    travauxListDiv.innerHTML = html;
  }

  async function loadRelationsData() {
    try {
      const [doesRes, affairesRes, sitesRes, demandesRes] = await Promise.all([
        fetch('/api/does', { headers: headersAuth }),
        fetch('/api/affaires', { headers: headersAuth }),
        fetch('/api/sites', { headers: headersAuth }),
        fetch('/api/demandes_client', { headers: headersAuth }),
      ]);
      cacheDoes = doesRes.ok ? await doesRes.json() : [];
      cacheAffaires = affairesRes.ok ? await affairesRes.json() : [];
      cacheSites = sitesRes.ok ? await sitesRes.json() : [];
      cacheDemandes = demandesRes.ok ? await demandesRes.json() : [];

      const selectDoe = document.getElementById('travaux-doe');
      const selectAffaire = document.getElementById('travaux-affaire');
      const selectSite = document.getElementById('travaux-site');
      const selectDemande = document.getElementById('travaux-demande');

      if (selectDoe) {
        selectDoe.innerHTML = '<option value="">(Aucun)</option>' + cacheDoes.map(d => `<option value="${d.id}">${d.titre || 'DOE #' + d.id}</option>`).join('');
      }
      if (selectAffaire) {
        selectAffaire.innerHTML = '<option value="">(Aucun)</option>' + cacheAffaires.map(a => `<option value="${a.id}">${a.nom_affaire || 'Affaire #' + a.id}</option>`).join('');
      }
      if (selectSite) {
        selectSite.innerHTML = '<option value="">(Aucun)</option>' + cacheSites.map(s => `<option value="${s.id}">${s.nom_site || 'Site #' + s.id}</option>`).join('');
      }
      if (selectDemande) {
        selectDemande.innerHTML = '<option value="">(Aucun)</option>' + cacheDemandes.map(d => `<option value="${d.id}">${d.titre || 'Demande #' + d.id}</option>`).join('');
      }
    } catch (e) {
      console.warn('Impossible de charger les données liées pour travaux', e);
    }
  }

  async function fetchTravaux() {
    try {
      const r = await fetch('/api/travaux', { headers: headersAuth });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      cacheTravaux = await r.json() || [];
      renderTravaux();
    } catch (e) {
      console.error('Error fetching travaux:', e);
      if (travauxListDiv) travauxListDiv.innerHTML = '<div class="text-danger p-3">Erreur de chargement des travaux.</div>';
    }
  }

  function bindFilters() {
    [filterSearch, filterEtat, filterPriorite].forEach(el => {
      if (el) el.addEventListener('input', renderTravaux);
      if (el && el.tagName === 'SELECT') el.addEventListener('change', renderTravaux);
    });
  }

  if (travauxForm) {
    travauxForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const id = document.getElementById('travaux-id').value;
      const payload = {
        doe_id: document.getElementById('travaux-doe').value || null,
        affaire_id: document.getElementById('travaux-affaire').value || null,
        site_id: document.getElementById('travaux-site').value || null,
        demande_id: document.getElementById('travaux-demande').value || null,
        titre: document.getElementById('travaux-titre').value.trim(),
        description: document.getElementById('travaux-description').value.trim() || null,
        etat: document.getElementById('travaux-etat').value,
        priorite: document.getElementById('travaux-priorite').value,
        date_echeance: document.getElementById('travaux-date-echeance').value || null,
        date_debut: null, // Set by backend
        date_fin: null,   // Set by backend
      };

      try {
        const url = id ? `/api/travaux/${id}` : '/api/travaux';
        const method = id ? 'PUT' : 'POST';

        const r = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json', ...headersAuth },
          body: JSON.stringify(payload)
        });

        if (r.ok) {
          travauxForm.reset();
          if (createTravauxModal) createTravauxModal.hide();
          fetchTravaux();
          alert('Travail enregistré avec succès!');
        } else {
          const errorData = await r.json();
          alert(`Erreur lors de l'enregistrement: ${errorData.error || r.statusText}`);
        }
      } catch (e) {
        console.error('Error saving travaux:', e);
        alert('Erreur lors de l\'enregistrement du travail.');
      }
    });

    if (travauxListDiv) {
      travauxListDiv.addEventListener('click', async (ev) => {
        const editBtn = ev.target.closest('.edit-travaux-btn');
        if (editBtn) {
          const id = editBtn.dataset.id;
          const travaux = cacheTravaux.find(t => String(t.id) === String(id));
          if (travaux) {
            document.getElementById('travaux-id').value = travaux.id;
            document.getElementById('travaux-titre').value = travaux.titre || '';
            document.getElementById('travaux-description').value = travaux.description || '';
            document.getElementById('travaux-doe').value = travaux.doe_id || '';
            document.getElementById('travaux-affaire').value = travaux.affaire_id || '';
            document.getElementById('travaux-site').value = travaux.site_id || '';
            document.getElementById('travaux-demande').value = travaux.demande_id || '';
            document.getElementById('travaux-etat').value = travaux.etat || 'A_faire';
            document.getElementById('travaux-priorite').value = travaux.priorite || 'Moyenne';
            document.getElementById('travaux-date-echeance').value = travaux.date_echeance ? travaux.date_echeance.split('T')[0] : '';

            if (createTravauxModal) {
              createTravauxModalEl.querySelector('.modal-title').textContent = 'Modifier le Travail';
              createTravauxModal.show();
            }
          }
        }

        const deleteBtn = ev.target.closest('.delete-travaux-btn');
        if (deleteBtn) {
          const id = deleteBtn.dataset.id;
          if (confirm('Supprimer ce travail ?')) {
            try {
              const d = await fetch(`/api/travaux/${id}`, { method: 'DELETE', headers: headersAuth });
              if (d.ok) fetchTravaux();
              else {
                const errorData = await d.json();
                alert(`Suppression impossible: ${errorData.error || d.statusText}`);
              }
            } catch (e) {
              console.error('Error deleting travaux:', e);
              alert('Erreur lors de la suppression du travail.');
            }
          }
        }
      });
    }

    createTravauxModalEl.addEventListener('hidden.bs.modal', () => {
      travauxForm.reset();
      document.getElementById('travaux-id').value = ''; // Clear hidden ID
      createTravauxModalEl.querySelector('.modal-title').textContent = 'Nouveau Travail';
    });

    loadRelationsData(); // Call the new function to load data
    fetchTravaux();
    bindFilters();
  }
});
