document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('new-association-form');
  const feedback = document.getElementById('feedback');
  const token = localStorage.getItem('token');
  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const contratCard = document.getElementById('contrat-card');
  const contratTitle = document.getElementById('contrat-title');
  const contratDates = document.getElementById('contrat-dates');

  function showMsg(text, type) { if (!feedback) return; feedback.className = `alert alert-${type||'info'}`; feedback.textContent = text; feedback.classList.remove('d-none'); } 

      // Autocomplete setup function (copied from contrat-new.js for consistency)
      function setupAutocomplete(searchInput, hiddenInput, suggestionsContainer, fetchUrl, displayKey, idKey, extraParams = {}) {
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

              const response = await fetch(url.toString(), {
                headers: { ...headers, 'Cache-Control': 'no-cache' },
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

      // Variable declarations for contract autocomplete
      const contratSearchInput = document.getElementById('contrat-search-input');
      const contratIdHidden = document.getElementById('contrat_id');
      const contratSuggestionsContainer = document.getElementById('contrat-suggestions');

      // Initialize autocomplete for contract
      if (contratSearchInput && contratIdHidden && contratSuggestionsContainer) {
        setupAutocomplete(contratSearchInput, contratIdHidden, contratSuggestionsContainer, '/api/contrats', 'titre', 'id');
      }

      async function renderContratPreview(cid) {
        if (!cid || !contratCard) { if (contratCard) contratCard.classList.add('d-none'); return; }
        try {
          const res = await fetch(`/api/contrats/${cid}`, { headers });
          if (!res.ok) throw new Error('Contrat introuvable');
          const c = await res.json();
          contratTitle.textContent = c.titre || `Contrat #${cid}`;
          const dd = c.date_debut ? new Date(c.date_debut).toLocaleDateString() : '';
          const df = c.date_fin ? new Date(c.date_fin).toLocaleDateString() : '';
          contratDates.textContent = dd ? `Début: ${dd}${df ? ' — Fin: ' + df : ''}` : '';
          contratCard.classList.remove('d-none');
        } catch (e) {
          contratCard.classList.add('d-none');
        }
      }

      contratIdHidden?.addEventListener('change', ()=> renderContratPreview(contratIdHidden.value));
      contratSearchInput?.addEventListener('change', ()=> renderContratPreview(contratIdHidden.value));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        feedback.innerHTML = '';
        feedback.classList.remove('alert', 'alert-danger', 'alert-success');

        let adresseId = null;

        // Check if address fields are filled
        const ligne1 = document.getElementById('adresse-ligne1').value.trim();
        const codePostal = document.getElementById('adresse-codepostal').value.trim();
        const ville = document.getElementById('adresse-ville').value.trim();

        if (ligne1 && codePostal && ville) {
          try {
            const adressePayload = {
              ligne1: ligne1,
              ligne2: document.getElementById('adresse-ligne2').value.trim(),
              code_postal: codePostal,
              ville: ville
            };
            const addrRes = await fetch('/api/adresses', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(adressePayload)
            });
            if (!addrRes.ok) throw new Error('Erreur lors de la création de l\'adresse.');
            const newAdresse = await addrRes.json();
            adresseId = newAdresse.id;
          } catch (error) {
            showMsg(error.message, 'danger');
            return;
          }
        }

        // Create the association
        try {
          const assocPayload = {
            titre: document.getElementById('titre').value,
            email_comptabilite: document.getElementById('email_comptabilite').value,
            adresse_id: adresseId,
            contrat_id: Number(contratIdHidden.value) || null // Add contrat_id to payload
          };
          const assocRes = await fetch('/api/associations', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(assocPayload)
          });
          if (!assocRes.ok) throw new Error('Erreur lors de la création de l\'association.');
          
          showMsg('Association créée avec succès ! Cette fenêtre va se fermer.', 'success');
          
          // Close the modal after a short delay
          setTimeout(() => {
            // This is running inside an iframe, so we ask the parent window to close the modal
            if (window.parent) {
                const modal = window.parent.document.getElementById('createAssociationModal');
                if (modal) {
                    const bsModal = window.parent.bootstrap.Modal.getInstance(modal);
                    if (bsModal) bsModal.hide();
                }
                try {
                  if (typeof window.parent.loadAssociations === 'function') {
                    window.parent.loadAssociations();
                  }
                } catch (err) {
                  console.warn('Unable to refresh parent associations:', err);
                }
            }
          }, 500);

        } catch (error) {
          showMsg(error.message, 'danger');
        }
      });
    });
