document.addEventListener('DOMContentLoaded', () => {
  const adresseListDiv = document.getElementById('adresseList');
  const adresseEmpty = document.getElementById('adresse-empty');
  const searchInput = document.getElementById('search-adresse');
  const form = document.getElementById('addAdresseForm');
  const modalEl = document.getElementById('adresseModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const saveBtn = document.getElementById('submitButtonAdresse');
  const modalTitle = document.getElementById('adresseModalLabel');

  // Champs
  const idField = document.getElementById('adresseId');
  const libelleField = document.getElementById('libelle');
  const ligne1Field = document.getElementById('ligne1');
  const cpField = document.getElementById('code_postal');
  const villeField = document.getElementById('ville');
  const paysField = document.getElementById('pays');
  const suggestions = document.getElementById('adresse-suggestions');

  let allAdresses = [];
  let geocodeCache = [];
  let currentPage = 1;
  const pageSize = 9;
  const token = localStorage.getItem('token');

  const buildHeaders = () => token ? { 'Authorization': `Bearer ${token}` } : {};

  const renderPagination = (totalItems) => {
    const pag = document.getElementById('adresse-pagination');
    if (!pag) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    pag.innerHTML = '';
    const addItem = (label, page, disabled = false, active = false) => {
      const li = document.createElement('li');
      li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
      const a = document.createElement('a');
      a.className = 'page-link';
      a.href = '#';
      a.textContent = label;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (disabled || active) return;
        currentPage = page;
        applyFilters(); // rerender
      });
      li.appendChild(a);
      pag.appendChild(li);
    };
    addItem('«', Math.max(1, currentPage - 1), currentPage === 1);
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
        addItem(String(p), p, false, p === currentPage);
      } else if (p === currentPage - 2 || p === currentPage + 2) {
        const li = document.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = '<span class="page-link">…</span>';
        pag.appendChild(li);
      }
    }
    addItem('»', Math.min(totalPages, currentPage + 1), currentPage === totalPages);
  };

  const renderList = (list) => {
    if (!adresseListDiv) return;
    adresseListDiv.innerHTML = '';
    if (!list.length) {
      adresseEmpty?.classList.remove('d-none');
      return;
    }
    adresseEmpty?.classList.add('d-none');
    const start = (currentPage - 1) * pageSize;
    const pageItems = list.slice(start, start + pageSize);
    pageItems.forEach(a => {
      const label = a.libelle || [a.ligne1, a.ligne2, `${a.code_postal||''} ${a.ville||''}`, a.pays].filter(Boolean).join(' ').trim() || `Adresse #${a.id}`;
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6 col-lg-4';
      col.innerHTML = `
        <div class="adresse-card h-100 d-flex flex-column">
          <div class="fw-semibold mb-1">${label}</div>
          <div class="text-muted small mb-2">${a.ligne1 || ''} ${a.code_postal || ''} ${a.ville || ''} ${a.pays || ''}</div>
          <div class="d-flex gap-2 mt-auto">
            <button class="btn btn-sm btn-outline-success w-100 select-adresse-btn" data-id="${a.id}"><i class="bi bi-check-circle"></i></button>
            <button class="btn btn-sm btn-outline-primary w-100 edit-adresse-btn" data-id="${a.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger w-100 delete-adresse-btn" data-id="${a.id}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      `;
      adresseListDiv.appendChild(col);
    });
    renderPagination(list.length);
  };

  const fetchAdresses = async () => {
    try {
      const response = await fetch('/api/adresses', { headers: buildHeaders(), credentials: 'same-origin' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) window.location.href = '/login.html';
        return;
      }
      const adresses = await response.json();
      allAdresses = Array.isArray(adresses) ? adresses : [];
      renderList(allAdresses);
    } catch (error) {
      console.error('Error fetching adresses:', error);
    }
  };

  const resetForm = () => {
    form?.reset();
    if (idField) idField.value = '';
    if (modalTitle) modalTitle.textContent = 'Ajouter une adresse';
    if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Enregistrer';
    geocodeCache = [];
    if (suggestions) suggestions.innerHTML = '';
  };

  const saveAdresse = async () => {
    if (!form) return;
    const payload = {
      libelle: libelleField?.value || '',
      ligne1: ligne1Field?.value || '',
      code_postal: cpField?.value || '',
      ville: villeField?.value || '',
      pays: paysField?.value || '',
    };
    const id = idField?.value || '';
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/adresses/${id}` : '/api/adresses';

    try {
      saveBtn && (saveBtn.disabled = true);
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...buildHeaders() },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAdresses();
      modal?.hide();
      resetForm();
    } catch (e) {
      console.error('Error saving adresse:', e);
      alert('Erreur lors de l’enregistrement.');
    } finally {
      saveBtn && (saveBtn.disabled = false);
    }
  };

  const geocode = async (query) => {
    if (!query || query.length < 3) return [];
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`, {
        headers: { 'Accept-Language': 'fr' }
      });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  };

  let geocodeTimer = null;
  const updateSuggestions = (query) => {
    if (!suggestions) return;
    clearTimeout(geocodeTimer);
    geocodeTimer = setTimeout(async () => {
      geocodeCache = await geocode(query);
      suggestions.innerHTML = '';
      geocodeCache.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.display_name;
        suggestions.appendChild(opt);
      });
    }, 300);
  };

  const applySelectedSuggestion = (value) => {
    const found = geocodeCache.find(i => i.display_name === value);
    if (!found || !found.address) return;
    if (ligne1Field) ligne1Field.value = found.address.road || found.address.pedestrian || found.address.house_number || value;
    if (cpField) cpField.value = found.address.postcode || '';
    if (villeField) villeField.value = found.address.city || found.address.town || found.address.village || '';
    if (paysField) paysField.value = found.address.country || '';
    if (libelleField && !libelleField.value) libelleField.value = value;
  };

  if (libelleField) {
    libelleField.addEventListener('input', (e) => updateSuggestions(e.target.value));
    libelleField.addEventListener('change', (e) => applySelectedSuggestion(e.target.value));
  }
  if (ligne1Field) {
    ligne1Field.addEventListener('input', (e) => updateSuggestions(e.target.value));
    ligne1Field.addEventListener('change', (e) => applySelectedSuggestion(e.target.value));
  }

  if (modalEl) {
    modalEl.addEventListener('show.bs.modal', () => {
      if (!idField?.value) resetForm();
    });
  }

  if (saveBtn) saveBtn.addEventListener('click', saveAdresse);

  if (adresseListDiv) {
    adresseListDiv.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (btn.classList.contains('select-adresse-btn')) {
        const addr = allAdresses.find(a => String(a.id) === String(id));
        if (addr) {
          const label = addr.libelle || [addr.ligne1, addr.ligne2, `${addr.code_postal||''} ${addr.ville||''}`, addr.pays].filter(Boolean).join(' ').trim() || `Adresse #${addr.id}`;
          window.parent?.postMessage({ type: 'adresse-select', adresse: { id: addr.id, label, ...addr } }, '*');
        }
      } else if (btn.classList.contains('delete-adresse-btn')) {
        if (!confirm('Voulez-vous vraiment supprimer cette adresse ?')) return;
        try {
          const response = await fetch(`/api/adresses/${id}`, { method: 'DELETE', headers: buildHeaders(), credentials: 'same-origin' });
          if (response.ok) fetchAdresses();
        } catch (error) {
          console.error('Error deleting adresse:', error);
        }
      } else if (btn.classList.contains('edit-adresse-btn')) {
        try {
          const response = await fetch(`/api/adresses/${id}`, { headers: buildHeaders(), credentials: 'same-origin' });
          const adresse = await response.json();
          idField.value = adresse.id;
          libelleField.value = adresse.libelle || '';
          ligne1Field.value = adresse.ligne1 || '';
          cpField.value = adresse.code_postal || '';
          villeField.value = adresse.ville || '';
          paysField.value = adresse.pays || '';
          if (modalTitle) modalTitle.textContent = 'Modifier une adresse';
          if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Mettre à jour';
          modal?.show();
        } catch (error) {
          console.error('Error fetching adresse for edit:', error);
        }
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.toLowerCase();
      const filtered = allAdresses.filter(a => (`${a.libelle} ${a.ligne1} ${a.code_postal} ${a.ville} ${a.pays}`).toLowerCase().includes(term));
      currentPage = 1;
      renderList(filtered);
    });
  }

  fetchAdresses();
});
