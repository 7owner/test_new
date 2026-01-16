document.addEventListener('DOMContentLoaded', () => {
  const factureListDiv = document.getElementById('factureList');
  const addFactureForm = document.getElementById('addFactureForm');
  const filterSearch = document.getElementById('filter_search');
  const filterClient = document.getElementById('filter_client');
  const filterAffaire = document.getElementById('filter_affaire');

  let cacheFactures = [];
  let cacheClients = [];
  let cacheAffaires = [];

  const token = localStorage.getItem('token');
  const headersAuth = token ? { 'Authorization': `Bearer ${token}` } : {};

  function formatAmount(v) {
    if (v === null || v === undefined || v === '') return '—';
    const num = Number(v);
    if (Number.isNaN(num)) return '—';
    return num.toFixed(2) + ' €';
  }

  function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR');
  }

  function renderFilters() {
    if (filterClient) {
      filterClient.innerHTML = '<option value="">Tous les clients</option>' + cacheClients.map(c => `<option value="${c.id}">${c.nom_client || 'Client #' + c.id}</option>`).join('');
    }
    if (filterAffaire) {
      filterAffaire.innerHTML = '<option value="">Toutes les affaires</option>' + cacheAffaires.map(a => `<option value="${a.id}">${a.nom_affaire || 'Affaire #' + a.id}</option>`).join('');
    }
  }

  function renderFactures() {
    if (!factureListDiv) return;
    if (!cacheFactures.length) {
      factureListDiv.innerHTML = '<div class="text-muted p-3">Aucune facture enregistrée.</div>';
      return;
    }
    const q = (filterSearch?.value || '').toLowerCase();
    const fc = filterClient?.value || '';
    const fa = filterAffaire?.value || '';

    const filtered = cacheFactures.filter(f => {
      const matchSearch =
        !q ||
        (f.reference || '').toLowerCase().includes(q) ||
        (f.nom_client || '').toLowerCase().includes(q) ||
        (f.nom_affaire || '').toLowerCase().includes(q);
      const matchClient = !fc || String(f.client_id) === String(fc);
      const matchAffaire = !fa || String(f.affaire_id) === String(fa);
      return matchSearch && matchClient && matchAffaire;
    });

    let html = `
      <table class="table align-middle">
        <thead>
          <tr>
            <th>Référence</th>
            <th>Client</th>
            <th>Affaire</th>
            <th>Montants</th>
            <th>Dates</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    filtered.forEach(f => {
      const mht = formatAmount(f.montant_ht);
      const tva = f.tva !== undefined && f.tva !== null ? Number(f.tva).toFixed(2) + ' %' : '—';
      const ttc = formatAmount(f.montant_ttc);
      const statut = f.statut || 'N/A';
      html += `
        <tr>
          <td>
            <div class="fw-semibold">${f.reference || 'Sans ref.'}</div>
            <div class="small text-muted">Facture #${f.id}</div>
          </td>
          <td>${f.nom_client || '—'}</td>
          <td>${f.nom_affaire || '—'}</td>
          <td>
            <div class="small">HT: ${mht}</div>
            <div class="small">TVA: ${tva}</div>
            <div class="small fw-semibold">TTC: ${ttc}</div>
          </td>
          <td>
            <div class="small">Émission: ${formatDate(f.date_emission)}</div>
            <div class="small">Échéance: ${formatDate(f.date_echeance)}</div>
            <span class="badge bg-secondary badge-status mt-1">${statut}</span>
          </td>
          <td class="text-end">
            <div class="btn-group">
              <a href="/facture-view.html?id=${f.id}" class="btn btn-sm btn-outline-primary" title="Voir"><i class="bi bi-eye"></i></a>
              <a href="/facture-edit.html?id=${f.id}" class="btn btn-sm btn-outline-warning" title="Modifier"><i class="bi bi-pencil"></i></a>
              <a href="/api/factures/${f.id}/download" class="btn btn-sm btn-outline-success" title="Télécharger" target="_blank"><i class="bi bi-download"></i></a>
              <button class="btn btn-sm btn-outline-danger delete-facture-btn" data-id="${f.id}" title="Supprimer"><i class="bi bi-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    });

    if (!filtered.length) {
      html += `<tr><td colspan="6" class="text-muted text-center py-3">Aucune facture ne correspond aux filtres.</td></tr>`;
    }
    html += '</tbody></table>';
    factureListDiv.innerHTML = html;
  }

  async function loadClientsAffairesForFacture() {
    try {
      const [cls, afs] = await Promise.all([
        fetch('/api/clients', { headers: headersAuth }),
        fetch('/api/affaires', { headers: headersAuth }),
      ]);
      cacheClients = cls.ok ? await cls.json() : [];
      cacheAffaires = afs.ok ? await afs.json() : [];
      // Form selects
      const selC = document.getElementById('f_client');
      const selA = document.getElementById('f_affaire');
      if (selC) selC.innerHTML = '<option value="">(Aucun)</option>' + cacheClients.map(c=>`<option value="${c.id}">${c.nom_client || 'Client #' + c.id}</option>`).join('');
      if (selA) selA.innerHTML = '<option value="">(Aucune)</option>' + cacheAffaires.map(a=>`<option value="${a.id}">${a.nom_affaire || 'Affaire #' + a.id}</option>`).join('');
      renderFilters();
    } catch(e){
      console.warn('Impossible de charger clients/affaires pour factures', e);
    }
  }

  async function fetchFactures() {
    try {
      const r = await fetch('/api/factures', { headers: headersAuth });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      cacheFactures = await r.json() || [];
      renderFactures();
    } catch(e){
      console.error('Error fetching factures:', e);
      if (factureListDiv) factureListDiv.innerHTML = '<div class="text-danger p-3">Erreur de chargement des factures.</div>';
    }
  }

  function bindFilters() {
    [filterSearch, filterClient, filterAffaire].forEach(el => {
      if (el) el.addEventListener('input', renderFactures);
      if (el && el.tagName === 'SELECT') el.addEventListener('change', renderFactures);
    });
  }

  if (addFactureForm) {
    addFactureForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const payload = {
        reference: document.getElementById('f_reference').value || null,
        montant_ht: document.getElementById('f_montant_ht').value || null,
        tva: document.getElementById('f_tva').value || null,
        date_emission: document.getElementById('f_date_emission').value || null,
        date_echeance: document.getElementById('f_date_echeance').value || null,
        client_id: document.getElementById('f_client').value || null,
        affaire_id: document.getElementById('f_affaire').value || null,
      };
      try {
        const r = await fetch('/api/factures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headersAuth },
          body: JSON.stringify(payload)
        });
        if (r.ok) {
          addFactureForm.reset();
          fetchFactures();
          try { showToast("Facture enregistrée", "success"); } catch(_) {}
        } else {
          alert(`Erreur lors de l'enregistrement (HTTP ${r.status})`);
        }
      } catch(e){ console.error('Error creating facture:', e); }
    });

    if (factureListDiv) {
      factureListDiv.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.delete-facture-btn');
        if (btn) {
          const id = btn.dataset.id;
          if (confirm('Supprimer cette facture ?')) {
            try {
              const d = await fetch(`/api/factures/${id}`, { method: 'DELETE', headers: headersAuth });
              if (d.ok) fetchFactures();
              else alert(`Suppression impossible (HTTP ${d.status})`);
            } catch(_){}
          }
        }
      });
    }

    loadClientsAffairesForFacture();
    fetchFactures();
    bindFilters();
  }
});
