document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const list = document.getElementById('clientList');

  async function fetchJSON(url, opts) {
    const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json', 'Authorization': token ? ('Bearer ' + token) : undefined } }, opts || {}));
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await res.json() : null;
    if (!res.ok) throw new Error((body && body.error) || res.statusText);
    return body;
  }

  function clientCard(c) {
    const col = document.createElement('div');
    col.className = 'col';
    const card = document.createElement('div');
    card.className = 'card h-100 shadow-sm';
    card.innerHTML = `
      <div class="card-body">
        <h5 class="card-title"><i class="bi bi-person-badge me-2"></i>${c.nom_client || '(Sans nom)'} </h5>
        <h6 class="card-subtitle mb-2 text-muted">${c.representant_nom || ''} ${c.representant_email ? '('+c.representant_email+')' : ''}</h6>
        <p class="card-text">${c.adresse_libelle || 'Adresse non spécifiée'}</p>
      </div>
      <div class="card-footer bg-transparent border-top-0 d-flex gap-2 justify-content-end">
        <a href="/client-view.html?id=${c.id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> Voir</a>
        <a href="/client-edit.html?id=${c.id}" class="btn btn-sm btn-outline-secondary"><i class="bi bi-pencil"></i> Modifier</a>
        <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${c.id}"><i class="bi bi-trash"></i> Supprimer</button>
      </div>
    `;
    col.appendChild(card);
    return col;
  }

  async function loadClients() {
    try {
      const data = await fetchJSON('/api/clients');
      list.innerHTML = '';
      const row = document.createElement('div');
      row.className = 'row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4';
      data.forEach(c => row.appendChild(clientCard(c)));
      list.appendChild(row);
    } catch (e) {
      console.error('clients load:', e);
      list.innerHTML = '<div class="alert alert-danger">Impossible de charger les clients.</div>';
    }
  }

  if (list) {
    list.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('.btn-delete');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (!confirm('Supprimer ce client ?')) return;
      try {
        await fetchJSON('/api/clients/' + id, { method: 'DELETE' });
        await loadClients();
      } catch (e) { alert((e && e.message) || 'Suppression impossible'); }
    });
    loadClients();
  }
});
