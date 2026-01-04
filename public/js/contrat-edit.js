document.addEventListener('DOMContentLoaded', async () => {
      const msg = document.getElementById('msg');
      function showMsg(text, type) { if (!msg) return; msg.className = `alert alert-${type||'info'}`; msg.textContent = text; msg.classList.remove('d-none'); }

      const params = new URLSearchParams(location.search);
      const contratId = params.get('id');
      if (!contratId) { showMsg('ID de contrat manquant.', 'danger'); return; }

      const token = localStorage.getItem('token');
      let isAdmin = false;
      try { const p = token ? JSON.parse(atob(token.split('.')[1])) : null; isAdmin = Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch {}
      if (!isAdmin) { const f = document.getElementById('contrat-edit-form'); if (f) f.innerHTML = '<div class="alert alert-danger">Accès refusé. Seuls les administrateurs peuvent modifier des contrats.</div>'; return; }

      // Helper to build auth headers (JWT or CSRF for session)
      async function buildHeaders(json = false) {
        const h = json ? { 'Content-Type': 'application/json' } : {};
        if (token) {
          h['Authorization'] = `Bearer ${token}`;
          return h;
        }
        try {
          const rTok = await fetch('/api/csrf-token', { credentials: 'same-origin' });
          const dTok = await rTok.json().catch(() => ({}));
          if (dTok && dTok.csrfToken) h['CSRF-Token'] = dTok.csrfToken;
        } catch {}
        return h;
      }

      // Autocomplete setup function (identique à contrat-new)
      function setupAutocomplete(searchInput, hiddenInput, suggestionsContainer, fetchUrl, displayKey, idKey, extraParams = {}, onSelect = null) {
        let timeout;
        let hasSelection = false;
        const getLabel = (item) => (typeof displayKey === 'function') ? displayKey(item) : (item?.[displayKey] || '');
        const getId = (item) => (typeof idKey === 'function') ? idKey(item) : (item?.[idKey] ?? '');
        const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}+/gu,'');

        searchInput.addEventListener('input', () => {
          hasSelection = false;
          clearTimeout(timeout);
          const query = searchInput.value.trim();
          if (query.length < 2) {
            suggestionsContainer.innerHTML = '';
            if (!searchInput.dataset.selectedLabel) {
              hiddenInput.value = '';
            } else {
              searchInput.value = searchInput.dataset.selectedLabel;
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

              const hdrs = await buildHeaders(false);
              const response = await fetch(url.toString(), {
                headers: { ...hdrs, 'Cache-Control': 'no-cache' },
                credentials: 'same-origin',
                cache: 'no-store'
              });
              if (response.status === 304) {
                displaySuggestions([], query);
                return;
              }
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              const text = await response.text();
              const items = text ? JSON.parse(text) : [];
              displaySuggestions(items, query);
            } catch (error) {
              console.error('Autocomplete fetch error:', error);
              suggestionsContainer.innerHTML = `<div class="list-group-item list-group-item-danger">Erreur de chargement.</div>`;
            }
          }, 300); // Debounce time

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
                searchInput.dataset.selectedLabel = label;
                searchInput.dataset.selectedId = val;
                suggestionsContainer.innerHTML = '';
                hasSelection = true;
                // Trigger change event for dynamic updates
                searchInput.dispatchEvent(new Event('change'));
                hiddenInput.dispatchEvent(new Event('change'));
                if (typeof onSelect === 'function') {
                  try { onSelect(item); } catch(_) {}
                }
                // Force blur/focusout to keep value
                searchInput.blur();
                setTimeout(() => searchInput.value = label, 0);
              });
              suggestionsContainer.appendChild(itemElement);
            });
          }
        });

        searchInput.addEventListener('blur', () => {
          setTimeout(() => {
            suggestionsContainer.innerHTML = '';
            if (searchInput.dataset.selectedLabel && searchInput.value.trim().length < 2) {
              searchInput.value = searchInput.dataset.selectedLabel;
            }
          }, 100); // Allow click event to fire
        });

        // Clear hidden input if search input is cleared, otherwise persist selection
        searchInput.addEventListener('change', () => {
            if (!hasSelection && !searchInput.value) {
              hiddenInput.value = '';
              delete searchInput.dataset.selectedLabel;
              delete searchInput.dataset.selectedId;
            } else if (searchInput.dataset.selectedLabel) {
              searchInput.value = searchInput.dataset.selectedLabel;
              hiddenInput.value = searchInput.dataset.selectedId || hiddenInput.value;
            }
        });
      }

      // Variable declarations
      const clientSearchInput = document.getElementById('client-search-input');
      const clientIdHidden = document.getElementById('client_id');
      const clientSuggestionsContainer = document.getElementById('client-suggestions');

      const form = document.getElementById('contrat-edit-form');
      const titreInput = document.getElementById('titre');
      const dateDebutInput = document.getElementById('date_debut');
      const dateFinInput = document.getElementById('date_fin');
      const commentaireTextarea = document.getElementById('commentaire');

      // Initialize autocomplete for client
      if (clientSearchInput && clientIdHidden && clientSuggestionsContainer) {
        setupAutocomplete(clientSearchInput, clientIdHidden, clientSuggestionsContainer, '/api/clients', 'nom_client', 'id');
      }

      // Load existing contract data
      try {
        const contrat = await fetch(`/api/contrats/${contratId}`, { headers: await buildHeaders(false), credentials: 'same-origin' });
        if (!contrat.ok) throw new Error('Failed to fetch contract data');
        const data = await contrat.json();

        titreInput.value = data.titre || '';
        dateDebutInput.value = data.date_debut ? data.date_debut.split('T')[0] : '';
        dateFinInput.value = data.date_fin ? data.date_fin.split('T')[0] : '';
        commentaireTextarea.value = data.commentaire || '';

        if (data.client_id) {
          const clientRes = await fetch(`/api/clients/${data.client_id}`, { headers: await buildHeaders(false), credentials: 'same-origin' });
          if (clientRes.ok) {
            const clientData = await clientRes.json();
            clientSearchInput.value = clientData.nom_client || `Client #${clientData.id}`;
            clientIdHidden.value = clientData.id;
            clientSearchInput.dataset.selectedLabel = clientSearchInput.value;
            clientSearchInput.dataset.selectedId = clientData.id;
          }
        }
      } catch (error) {
        showMsg(`Erreur de chargement du contrat: ${error.message}`, 'danger');
        console.error('Erreur chargement contrat:', error);
      }

      // Submit form
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
          titre: titreInput.value.trim(),
          date_debut: dateDebutInput.value || null,
          date_fin: dateFinInput.value || null,
          commentaire: commentaireTextarea.value.trim() || null,
          client_id: Number(clientIdHidden.value) || null
        };

        if (!payload.titre || !payload.date_debut) {
          showMsg('Le titre et la date de début sont obligatoires.', 'danger');
          return;
        }

        try {
          const r = await fetch(`/api/contrats/${contratId}`, {
            method: 'PUT',
            headers: await buildHeaders(true),
            credentials: 'same-origin',
            body: JSON.stringify(payload)
          });

          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d && d.error ? d.error : `HTTP ${r.status}`);
          }

          showMsg('Contrat mis à jour avec succès!', 'success');
          // Optionally close modal and refresh parent
          try {
            if (window.parent && window.parent.bootstrap && window.parent.document.getElementById('editContratModal')) {
              window.parent.bootstrap.Modal.getInstance(window.parent.document.getElementById('editContratModal')).hide();
              if (typeof window.parent.loadContrats === 'function') { // Assuming parent has a loadContrats function
                window.parent.loadContrats();
              } else if (window.parent.location) {
                window.parent.location.reload();
              }
            }
          } catch (err) {
            console.warn('Could not interact with parent window:', err);
            location.href = `/contrat-view.html?id=${contratId}`; // Fallback
          }
        } catch (err) {
          showMsg(`Échec de la mise à jour: ${err.message}`, 'danger');
          console.error('Erreur mise à jour contrat:', err);
        }
      });
    });
