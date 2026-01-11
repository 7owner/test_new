document.addEventListener('DOMContentLoaded', async function() {
  const msg = document.getElementById('msg');
  const showMsg = (text, type) => {
    if (!msg) return;
    msg.className = `alert alert-${type || 'info'}`;
    msg.textContent = text;
    msg.classList.remove('d-none');
  };

  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get('id');
  if (!ticketId) {
    alert('ID du ticket manquant.');
    location.href = 'tickets.html';
    return;
  }

  const token = localStorage.getItem('token');
  let isAdmin = false;
  if (token) {
    try {
      const p = JSON.parse(atob(token.split('.')[1]));
      isAdmin = Array.isArray(p.roles) && p.roles.includes('ROLE_ADMIN');
    } catch (_) {}
  }
  if (!isAdmin) {
    const f = document.getElementById('ticket-new-form');
    if (f) f.innerHTML = '<div class="alert alert-danger">Accès refusé. Seuls les administrateurs peuvent modifier des tickets.</div>';
    return;
  }

  const headers = token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' };

  // Autocomplete générique
  function setupAutocomplete(searchInput, hiddenInput, suggestionsContainer, fetchUrl, displayKey, idKey, extraParams = {}) {
    let timeout;
    let selectedLabel = '';
    let selectedId = '';
    const getLabel = (item) => (typeof displayKey === 'function') ? displayKey(item) : (item?.[displayKey] || '');
    const getId = (item) => (typeof idKey === 'function') ? idKey(item) : (item?.[idKey] ?? '');
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}+/gu,'');

    searchInput.addEventListener('input', () => {
      clearTimeout(timeout);
      const query = searchInput.value.trim();
      if (query.length < 2) {
        suggestionsContainer.innerHTML = '';
        if (query.length === 0) {
          hiddenInput.value = '';
          selectedLabel = '';
          selectedId = '';
        }
        return;
      }

      timeout = setTimeout(async () => {
        try {
          const url = new URL(fetchUrl, window.location.origin);
          url.searchParams.append('query', query);
          const params = typeof extraParams === 'function' ? extraParams() : extraParams;
          for (const key in params) {
            if (params[key]) url.searchParams.append(key, params[key]);
          }

          const response = await fetch(url.toString(), {
            headers: { ...headers, 'Cache-Control': 'no-cache' },
            credentials: 'same-origin',
            cache: 'no-store'
          });
          if (response.status === 304) {
            suggestionsContainer.innerHTML = '';
            return;
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const text = await response.text();
          const items = text ? JSON.parse(text) : [];
          displaySuggestions(items, query);
        } catch (error) {
          console.error('Autocomplete fetch error:', error);
          suggestionsContainer.innerHTML = `<div class="list-group-item list-group-item-danger">Erreur de chargement.</div>`;
        }
      }, 300);

      function displaySuggestions(items, queryStr) {
        suggestionsContainer.innerHTML = '';
        const qNorm = norm(queryStr);
        const filtered = (items || []).filter(it => norm(getLabel(it)).includes(qNorm));
        if (!filtered.length) {
          suggestionsContainer.innerHTML = '<div class="list-group-item">Aucun résultat.</div>';
          return;
        }
        filtered.forEach(item => {
          const itemElement = document.createElement('button');
          itemElement.type = 'button';
          itemElement.classList.add('list-group-item', 'list-group-item-action');
          itemElement.textContent = getLabel(item);
          itemElement.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            const label = getLabel(item) || '';
            const val = getId(item) || '';
            searchInput.value = label;
            hiddenInput.value = val;
            selectedLabel = label;
            selectedId = val;
            suggestionsContainer.innerHTML = '';
            searchInput.blur();
            setTimeout(() => searchInput.value = label, 0);
            searchInput.dispatchEvent(new Event('change'));
            hiddenInput.dispatchEvent(new Event('change'));
          });
          suggestionsContainer.appendChild(itemElement);
        });
      }
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        suggestionsContainer.innerHTML = '';
        if (selectedLabel && searchInput.value.trim().length < 2) {
          searchInput.value = selectedLabel;
          hiddenInput.value = selectedId;
        }
      }, 100);
    });

    searchInput.addEventListener('change', () => {
      if (!searchInput.value) {
        hiddenInput.value = '';
        selectedLabel = '';
        selectedId = '';
      }
    });
  }

  // Références aux champs
  const siteSearchInput = document.getElementById('site-search-input');
  const siteIdHidden = document.getElementById('site_id');
  const siteSuggestionsContainer = document.getElementById('site-suggestions');

  const doeSearchInput = document.getElementById('doe-search-input');
  const doeIdHidden = document.getElementById('doe_id');
  const doeSuggestionsContainer = document.getElementById('doe-suggestions');

  const affaireSearchInput = document.getElementById('affaire-search-input');
  const affaireIdHidden = document.getElementById('affaire_id');
  const affaireSuggestionsContainer = document.getElementById('affaire-suggestions');

  const responsableSearchInput = document.getElementById('responsable-search-input');
  const responsableIdHidden = document.getElementById('responsable');
  const responsableSuggestionsContainer = document.getElementById('responsable-suggestions');

  const doeDetailsDiv = document.getElementById('doe-details');
  const doeTitleSpan = document.getElementById('doe-title');
  const doeDescriptionSpan = document.getElementById('doe-description');
  const viewDoeBtn = document.getElementById('view-doe-btn');
  const siteCard = document.getElementById('site-card');
  const siteViewLink = document.getElementById('site-view-link');

  // Prévisualisation site
  async function updateSitePreview() {
    const currentSiteId = siteIdHidden.value;
    if (!currentSiteId) {
      siteCard?.classList.add('d-none');
      return;
    }
    try {
      const resSite = await fetch(`/api/sites/${currentSiteId}/relations`, { headers, credentials: 'same-origin' });
      if (!resSite.ok) throw new Error();
      const siteData = await resSite.json();
      const { site = {}, adresse = {}, representants = [] } = siteData;
      siteCard?.classList.remove('d-none');
      if (siteViewLink) siteViewLink.href = `site-view.html?id=${site.id || currentSiteId}`;
      document.getElementById('site-name').textContent = site.nom_site || `Site #${site.id || currentSiteId}`;
      document.getElementById('site-client').textContent = site.nom_client || 'Non assigné';
      const contactStr = `${site.representant_nom || ''} ${site.representant_tel || ''}`.trim();
      document.getElementById('site-contact').textContent = contactStr || 'Non spécifié';
      const adrHtml = [
        adresse.ligne1,
        adresse.ligne2,
        [adresse.code_postal, adresse.ville].filter(Boolean).join(' '),
        adresse.pays
      ].filter(Boolean).join('<br>');
      document.getElementById('site-adresse').innerHTML = adrHtml || 'Non renseignée';
      document.getElementById('site-commentaire').textContent = site.commentaire || 'Aucun commentaire';
      const repsEl = document.getElementById('site-representants');
      if (repsEl) {
        repsEl.innerHTML = '';
        if (!representants.length) {
          repsEl.innerHTML = '<div class="text-muted small">Aucun représentant.</div>';
        } else {
          representants.forEach(rep => {
            const badge = (rep.nom || rep.email || 'N')[0].toUpperCase();
            const tel = rep.tel ? `<span class="ms-2"><i class="bi bi-phone me-1"></i>${rep.tel}</span>` : '';
            repsEl.innerHTML += `
              <div class="d-flex align-items-start p-2 border rounded">
                <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;">${badge}</div>
                <div class="ms-2">
                  <div class="fw-semibold">${rep.nom || 'Inconnu'}</div>
                  <div class="small text-muted">${rep.fonction || ''}</div>
                  <div class="small text-muted"><i class="bi bi-envelope me-1"></i>${rep.email || 'N/A'} ${tel}</div>
                </div>
              </div>`;
          });
        }
      }
    } catch (error) {
      console.error('Erreur chargement site preview', error);
      siteCard?.classList.add('d-none');
    }
  }

  // Autocomplétion
  setupAutocomplete(siteSearchInput, siteIdHidden, siteSuggestionsContainer, '/api/sites', 'nom_site', 'id');
  setupAutocomplete(doeSearchInput, doeIdHidden, doeSuggestionsContainer, '/api/does', 'titre', 'id', () => ({ site_id: siteIdHidden.value }));
  setupAutocomplete(affaireSearchInput, affaireIdHidden, affaireSuggestionsContainer, '/api/affaires', 'nom_affaire', 'id');
  setupAutocomplete(responsableSearchInput, responsableIdHidden, responsableSuggestionsContainer, '/api/agents', (item) => `${item.prenom} ${item.nom} (${item.matricule})`, 'matricule');

  siteIdHidden.addEventListener('change', () => {
    // Reset DOE/preview on site change manuel
    doeSearchInput.value = '';
    doeIdHidden.value = '';
    doeDetailsDiv?.classList.add('d-none');
    updateSitePreview();
  });

  doeIdHidden.addEventListener('change', () => {
    const selDoeId = doeIdHidden.value;
    if (!selDoeId) { doeDetailsDiv?.classList.add('d-none'); return; }
    fetch(`/api/does/${selDoeId}/relations`, { headers, credentials: 'same-origin' })
      .then(res => res.json())
      .then(data => {
        const doe = data?.doe || data || {};
        if (doe.affaire_id) {
          fetch(`/api/affaires/${doe.affaire_id}`, { headers, credentials: 'same-origin' })
            .then(res => res.json())
            .then(affaire => {
              if (affaire) {
                affaireSearchInput.value = affaire.nom_affaire;
                affaireIdHidden.value = affaire.id;
              }
            });
        }
        if (doe.site_id) {
          siteIdHidden.value = doe.site_id;
          updateSitePreview();
        }
        doeTitleSpan.textContent = doe.titre || '';
        doeDescriptionSpan.textContent = doe.description || '';
        viewDoeBtn.href = `doe-view.html?id=${selDoeId}`;
        doeDetailsDiv?.classList.remove('d-none');
      });
  });

  // Pré-remplissage avec le ticket existant
  function toLocal(dt) {
    if (!dt) return '';
    try { return new Date(dt).toISOString().slice(0,16); } catch(_) { return ''; }
  }

  async function prefillTicket() {
    try {
      const rel = await fetch(`/api/tickets/${ticketId}/relations`, { headers, credentials: 'same-origin' });
      if (!rel.ok) throw new Error('Ticket introuvable');
      const data = await rel.json();
      const t = data.ticket || {};

      document.getElementById('titre').value = t.titre || '';
      document.getElementById('description').value = t.description || '';
      document.getElementById('date_debut').value = toLocal(t.date_debut);
      document.getElementById('date_fin').value = toLocal(t.date_fin);

      if (t.site_id && t.nom_site) {
        siteIdHidden.value = t.site_id;
        siteSearchInput.value = t.nom_site;
        updateSitePreview();
      }
      if (t.doe_id && t.nom_doe) {
        doeIdHidden.value = t.doe_id;
        doeSearchInput.value = t.nom_doe;
        doeDetailsDiv?.classList.remove('d-none');
        doeTitleSpan.textContent = t.nom_doe;
        viewDoeBtn.href = `doe-view.html?id=${t.doe_id}`;
      }
      if (t.affaire_id && t.nom_affaire) {
        affaireIdHidden.value = t.affaire_id;
        affaireSearchInput.value = t.nom_affaire;
      }
      if (t.responsable) {
        responsableIdHidden.value = t.responsable;
        responsableSearchInput.value = t.responsable;
      }
      const cancelBtn = document.getElementById('cancel-button');
      if (cancelBtn) cancelBtn.href = `ticket-view.html?id=${ticketId}`;
    } catch (err) {
      console.error(err);
      showMsg('Erreur de chargement du ticket.', 'danger');
    }
  }

  await prefillTicket();

  // Submit (PUT)
  const form = document.getElementById('ticket-new-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!doeIdHidden.value || !affaireIdHidden.value) {
      alert('DOE et Affaire sont obligatoires pour modifier ce ticket.');
      return;
    }
    const payload = {
      titre: (document.getElementById('titre')?.value || '').trim() || null,
      description: (document.getElementById('description')?.value || '').trim() || null,
      site_id: Number(siteIdHidden.value) || null,
      doe_id: Number(doeIdHidden.value) || null,
      affaire_id: Number(affaireIdHidden.value) || null,
      responsable: (responsableIdHidden.value || null),
    };
    try {
      const dd = (document.getElementById('date_debut')?.value || '').trim();
      const df = (document.getElementById('date_fin')?.value || '').trim();
      payload.date_debut = dd ? new Date(dd).toISOString() : null;
      payload.date_fin = df ? new Date(df).toISOString() : null;
    } catch(_) {}

    try {
      const r = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PUT',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const d = await r.json().catch(()=>({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      alert('Ticket mis à jour avec succès');
      location.href = `ticket-view.html?id=${ticketId}`;
    } catch(err) {
      console.error(err);
      alert(`Échec de la mise à jour: ${err.message}`);
    }
  });
});
