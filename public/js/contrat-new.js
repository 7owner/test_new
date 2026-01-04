document.addEventListener('DOMContentLoaded', async () => {
      const msg = document.getElementById('msg');
      function showMsg(text, type) { if (!msg) return; msg.className = `alert alert-${type||'info'}`; msg.textContent = text; msg.classList.remove('d-none'); }

      const token = localStorage.getItem('token');
      let isAdmin = false;
      try { const p = token ? JSON.parse(atob(token.split('.')[1])) : null; isAdmin = Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch {}
      if (!isAdmin) { const f = document.getElementById('contrat-new-form'); if (f) f.innerHTML = '<div class="alert alert-danger">Accès refusé. Seuls les administrateurs peuvent créer des contrats.</div>'; return; }

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

      // Autocomplete setup function (copied from ticket-new.js for consistency)
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
              itemElement.addEventListener('click', () => {
                const label = getLabel(item) || '';
                const val = getId(item) || '';
                console.log('[autocomplete select]', fetchUrl, { label, val });
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
                  try { onSelect(item); } catch (_) {}
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
          }, 100); // Allow click event to fire
        });

        // Clear hidden input if search input is cleared
        searchInput.addEventListener('change', () => {
            if (!hasSelection && !searchInput.value) {
              hiddenInput.value = '';
              delete searchInput.dataset.selectedLabel;
              delete searchInput.dataset.selectedId;
            }
        });
      }

      // Variable declarations
      const clientSearchInput = document.getElementById('client-search-input');
      const clientIdHidden = document.getElementById('client_id');
      const clientSuggestionsContainer = document.getElementById('client-suggestions');
      const clientCard = document.getElementById('client-card');
      const clientName = document.getElementById('client-name');
      const clientEmail = document.getElementById('client-email');
      const clientContact = document.getElementById('client-contact');
      const clientViewLink = document.getElementById('client-view-link');

      const form = document.getElementById('contrat-new-form');
      const titreInput = document.getElementById('titre');
      const dateDebutInput = document.getElementById('date_debut');
      const dateFinInput = document.getElementById('date_fin');
      const commentaireTextarea = document.getElementById('commentaire');

      // Initialize autocomplete for client
      if (clientSearchInput && clientIdHidden && clientSuggestionsContainer) {
        setupAutocomplete(clientSearchInput, clientIdHidden, clientSuggestionsContainer, '/api/clients', 'nom_client', 'id', {}, (item)=> {
          if (item && item.id) {
            // Affiche instantanément avec les infos disponibles, puis rafraîchit via fetch
            renderClientPreview(item.id, item);
          }
        });
      }

      async function renderClientPreview(clientId, fallbackData = null) {
        if (!clientId || !clientCard) { if (clientCard) clientCard.classList.add('d-none'); return; }
        // Premier affichage avec les données déjà disponibles
        if (fallbackData) {
          clientName.textContent = fallbackData.nom_client || `Client #${clientId}`;
          clientEmail.textContent = fallbackData.email || '';
          clientContact.textContent = fallbackData.telephone || '';
          if (clientViewLink) clientViewLink.href = `/client-view.html?id=${clientId}`;
          clientCard.classList.remove('d-none');
        }
        try {
          const h = await buildHeaders(false);
          const res = await fetch(`/api/clients/${clientId}/relations`, { headers: h, credentials: 'same-origin' });
          if (!res.ok) throw new Error('Client introuvable');
          const data = await res.json();
          const c = data.client || data || {};
          clientName.textContent = c.nom_client || `Client #${clientId}`;
          clientEmail.textContent = c.email || '';
          clientContact.textContent = c.telephone || '';
          if (clientViewLink) clientViewLink.href = `/client-view.html?id=${clientId}`;
          clientCard.classList.remove('d-none');
        } catch (e) {
          clientCard.classList.add('d-none');
        }
      }

      clientIdHidden?.addEventListener('change', () => renderClientPreview(clientIdHidden.value));
      clientSearchInput?.addEventListener('change', () => renderClientPreview(clientIdHidden.value));
      // Si la valeur est déjà préremplie (ex: depuis une redirection), afficher la carte immédiatement
      if (clientIdHidden?.value) renderClientPreview(clientIdHidden.value);

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
          const r = await fetch('/api/contrats', {
            method: 'POST',
            headers: await buildHeaders(true),
            credentials: 'same-origin',
            body: JSON.stringify(payload)
          });

          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d && d.error ? d.error : `HTTP ${r.status}`);
          }

          showMsg('Contrat créé avec succès!', 'success');
          // Optionally close modal and refresh parent
          try {
            if (window.parent && window.parent.bootstrap && window.parent.document.getElementById('createContratModal')) {
              window.parent.bootstrap.Modal.getInstance(window.parent.document.getElementById('createContratModal')).hide();
              // Trigger a reload or update in the parent window if needed
              if (typeof window.parent.loadContrats === 'function') { // Assuming parent has a loadContrats function
                window.parent.loadContrats();
              } else if (window.parent.location) {
                window.parent.location.reload();
              }
            }
          } catch (err) {
            console.warn('Could not interact with parent window:', err);
            // Fallback for direct page access or unexpected iframe context
            location.href = '/contrats.html'; // Assuming there's a contracts list page
          }
        } catch (err) {
          showMsg(`Échec de la création: ${err.message}`, 'danger');
          console.error('Erreur création contrat:', err);
        }
      });
    });
