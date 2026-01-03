document.addEventListener('DOMContentLoaded', async () => {
      const token = localStorage.getItem('token');
      let isAdmin = false;
      try { const p = token ? JSON.parse(atob(token.split('.')[1])) : null; isAdmin = Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch {}

      const form = document.getElementById('site-new-form');
      if (!form) return;
      const saveBtn = document.getElementById('save-site-btn');

      // Client Autocomplete
      const clientSearchInput = document.getElementById('client-search-input');
      const clientIdHidden = document.getElementById('client_id');
      const clientSuggestionsContainer = document.getElementById('client-suggestions');

      // Responsable Autocomplete
      const responsableSearchInput = document.getElementById('responsable-search-input');
      const responsableMatriculeHidden = document.getElementById('responsable_matricule');
      const responsableSuggestionsContainer = document.getElementById('responsable-suggestions');

      // Association Autocomplete
      const associationSearchInput = document.getElementById('association-search-input');
      const associationIdHidden = document.getElementById('association_id');
      const associationSuggestionsContainer = document.getElementById('association-suggestions');

      // Adresse Autocomplete
      const adresseSearchInput = document.getElementById('adresse-search-input');
      const adresseIdHidden = document.getElementById('adresse_id');
      const adresseSuggestionsContainer = document.getElementById('adresse-suggestions');

      const toggleNew = document.getElementById('toggle_new_address');
      const newAddr = document.getElementById('new-address-fields');
      const statutSelect = document.getElementById('site-statut');

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

      

            // Autocomplete setup function

            function setupAutocomplete(searchInput, hiddenInput, suggestionsContainer, fetchUrl, displayKey, idKey) {

              let timeout;

      

              searchInput.addEventListener('input', () => {

                clearTimeout(timeout);

                const query = searchInput.value.trim();

                if (query.length < 2) {

                  suggestionsContainer.innerHTML = '';

                  hiddenInput.value = '';

                  return;

                }

      

                timeout = setTimeout(async () => {

                  try {

                    const headers = await buildHeaders(false);

                    const response = await fetch(`${fetchUrl}?query=${encodeURIComponent(query)}`, { headers, credentials: 'same-origin' });

                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const items = await response.json();

                    displaySuggestions(items);

                  } catch (error) {

                    console.error('Autocomplete fetch error:', error);

                    suggestionsContainer.innerHTML = `<div class="list-group-item list-group-item-danger">Erreur de chargement.</div>`;

                  }

                }, 300); // Debounce time

      

                function displaySuggestions(items) {

                  suggestionsContainer.innerHTML = '';

                  if (items.length === 0) {

                    suggestionsContainer.innerHTML = '<div class="list-group-item">Aucun résultat.</div>';

                    return;

                  }

                  items.forEach(item => {

                    const itemElement = document.createElement('button');

                    itemElement.type = 'button';

                    itemElement.classList.add('list-group-item', 'list-group-item-action');

                    itemElement.textContent = item[displayKey];

                    itemElement.addEventListener('click', () => {

                      searchInput.value = item[displayKey];

                      hiddenInput.value = item[idKey];

                      suggestionsContainer.innerHTML = '';

                    });

                    suggestionsContainer.appendChild(itemElement);

                  });

                }

              });

      

              searchInput.addEventListener('blur', () => {

                setTimeout(() => { suggestionsContainer.innerHTML = ''; }, 100); // Allow click event to fire

              });

      

              // Clear hidden input if search input is cleared

              searchInput.addEventListener('change', () => {

                  if (!searchInput.value) {

                      hiddenInput.value = '';

                  }

              });

            }

      

            // Initialize autocompletes

            if (clientSearchInput && clientIdHidden && clientSuggestionsContainer) {

              setupAutocomplete(clientSearchInput, clientIdHidden, clientSuggestionsContainer, '/api/clients', 'nom_client', 'id');

            }

                  if (responsableSearchInput && responsableMatriculeHidden && responsableSuggestionsContainer) {

                    setupAutocomplete(responsableSearchInput, responsableMatriculeHidden, responsableSuggestionsContainer, '/api/agents', 'nom_complet', 'matricule');

                  }

                  if (associationSearchInput && associationIdHidden && associationSuggestionsContainer) {

                    setupAutocomplete(associationSearchInput, associationIdHidden, associationSuggestionsContainer, '/api/associations', 'titre', 'id');

                  }

            if (adresseSearchInput && adresseIdHidden && adresseSuggestionsContainer) {

              // This will fetch existing addresses for selection

              setupAutocomplete(adresseSearchInput, adresseIdHidden, adresseSuggestionsContainer, '/api/adresses', 'libelle_complete', 'id');

            }

      

      

            // Role guard

            if (!isAdmin) { form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => el.setAttribute('disabled','true')); saveBtn?.classList.add('d-none'); }

      // Toggle behavior
      const req = (el, on) => { try { if (on) el?.setAttribute('required','true'); else el?.removeAttribute('required'); } catch{} };
      const addrL1 = document.getElementById('addr_ligne1');
      const addrCP = document.getElementById('addr_code_postal');
      const addrVille = document.getElementById('addr_ville');
      const syncRequired = (on) => {
        req(addrL1,on); req(addrCP,on); req(addrVille,on);
        if (on) {
          adresseIdHidden?.removeAttribute('required');
          adresseSearchInput?.removeAttribute('required');
        } else {
          adresseIdHidden?.setAttribute('required','true');
          adresseSearchInput?.setAttribute('required','true');
        }
      };
      if (toggleNew) {
        toggleNew.addEventListener('change', () => {
          if (toggleNew.checked) {
            newAddr?.classList.remove('d-none');
            adresseSearchInput?.setAttribute('disabled','true');
            adresseIdHidden?.setAttribute('disabled','true');
            syncRequired(true);
          }
          else {
            newAddr?.classList.add('d-none');
            adresseSearchInput?.removeAttribute('disabled');
            adresseIdHidden?.removeAttribute('disabled');
            syncRequired(false);
          }
        });
        // Apply initial state
        toggleNew.dispatchEvent(new Event('change'));
      }

      // Submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isAdmin) { alert('Action réservée aux administrateurs.'); return; }
        const nom_site = (document.getElementById('nom_site')?.value || '').trim();
        let adresse_id = (adresseIdHidden && !adresseIdHidden.disabled) ? (Number(adresseIdHidden.value) || null) : null;
        const commentaire = (document.getElementById('commentaire')?.value || '').trim() || null;
        if (!nom_site) { alert('Veuillez renseigner le nom du site.'); return; }
        if (!clientIdHidden.value) { alert('Veuillez sélectionner un client.'); return; }

        if (toggleNew && toggleNew.checked) {
          const libelle = (document.getElementById('addr_libelle')?.value || '').trim() || null;
          const ligne1 = (addrL1?.value || '').trim();
          const code_postal = (addrCP?.value || '').trim();
          const ville = (addrVille?.value || '').trim();
          const pays = (document.getElementById('addr_pays')?.value || '').trim() || null;
          if (!ligne1 || !code_postal || !ville) { alert('Veuillez renseigner Adresse, Code postal et Ville.'); return; }
          try {
            const rAddr = await fetch('/api/adresses', { method: 'POST', headers: await buildHeaders(true), credentials: 'same-origin', body: JSON.stringify({ libelle, ligne1, code_postal, ville, pays }) });
            const dAddr = await rAddr.json().catch(()=>null);
            if (!rAddr.ok) throw new Error((dAddr && dAddr.error) || `HTTP ${rAddr.status}`);
            adresse_id = dAddr?.id || null;
            if (!adresse_id) throw new Error('Création adresse: id manquant');
          } catch (err) { console.error('Erreur création adresse:', err); alert(`Échec de la création de l'adresse: ${err.message}`); return; }
        }

        if (!adresse_id) { alert('Veuillez sélectionner ou créer une adresse.'); return; }
        try {
          const payload = {
            nom_site,
            adresse_id,
            commentaire,
            client_id: Number(clientIdHidden.value) || null,
            responsable_matricule: responsableMatriculeHidden.value || null,
            association_id: Number(associationIdHidden.value) || null,
            statut: statutSelect ? (statutSelect.value || 'Actif') : 'Actif'
          };
          const r = await fetch('/api/sites', { method: 'POST', headers: await buildHeaders(true), credentials: 'same-origin', body: JSON.stringify(payload) });
          const data = await r.json().catch(()=>null);
          if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
          const siteId = data?.id;



          if (siteId) {
            alert('Site créé avec succès');
            try { window.parent.location.reload(); } catch {}
            try { location.href = `site-view.html?id=${siteId}`; } catch {}
          } else { location.href = 'sites.html'; }
        } catch (err) { console.error('Erreur création site:', err); alert(`Échec de la création: ${err.message}`); }
      });
    });
