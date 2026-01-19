document.addEventListener('DOMContentLoaded', async () => {
      const token = localStorage.getItem('token');
      let isAdmin = false;
      try { const p = token ? JSON.parse(atob(token.split('.')[1])) : null; isAdmin = Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch {}

      const form = document.getElementById('site-new-form');
      if (!form) return;
      const saveBtn = document.getElementById('save-site-btn');

      // Association Autocomplete + preview
      const associationSearchInput = document.getElementById('association-search-input');
      const associationIdHidden = document.getElementById('association_id');
      const associationSuggestionsContainer = document.getElementById('association-suggestions');
      const associationCard = document.getElementById('association-card');
      const associationTitle = document.getElementById('association-title');
      const associationEmail = document.getElementById('association-email');
      const associationAdresse = document.getElementById('association-adresse');
      const associationViewLink = document.getElementById('association-view-link');

      // Responsable autocomplete
      const responsableSearchInput = document.getElementById('responsable-search-input');
      const responsableMatriculeHidden = document.getElementById('responsable_matricule');
      const responsableSuggestionsContainer = document.getElementById('responsable-suggestions');

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

      

            // Autocomplete setup function (persist selection)
            function setupAutocomplete(searchInput, hiddenInput, suggestionsContainer, fetchUrlOrFn, displayKey, idKey, options = {}, onSelect=null) {
              let timeout;
              let selectedLabel = '';
              let selectedId = '';
              const minChars = options.minChars ?? 2;
              const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}+/gu,'');
              const getLabel = (item) => (typeof displayKey === 'function') ? displayKey(item) : (item?.[displayKey] || '');
              const getId = (item) => (typeof idKey === 'function') ? idKey(item) : (item?.[idKey] ?? '');

              searchInput.addEventListener('input', () => {
                clearTimeout(timeout);
                const query = searchInput.value.trim();
                if (query.length < minChars) {
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
                    const headers = await buildHeaders(false);
                    const fetchUrl = (typeof fetchUrlOrFn === 'function') ? fetchUrlOrFn() : fetchUrlOrFn;
                    const url = new URL(fetchUrl, window.location.origin);
                    url.searchParams.append('query', query);
                    const response = await fetch(url.toString(), { headers, credentials: 'same-origin', cache: 'no-store' });
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const items = await response.json();
                    displaySuggestions(items, query);
                  } catch (error) {
                    console.error('Autocomplete fetch error:', error);
                    suggestionsContainer.innerHTML = `<div class="list-group-item list-group-item-danger">Erreur de chargement.</div>`;
                  }
                }, 250); // Debounce time

                function displaySuggestions(items, queryStr) {
                  suggestionsContainer.innerHTML = '';
                  const qNorm = norm(queryStr);
                  const filtered = (items || []).filter(it => norm(getLabel(it)).includes(qNorm));
                  if (!filtered.length) {
                    suggestionsContainer.innerHTML = '<div class="list-group-item">Aucun résultat.</div>';
                    return;
                  }
                  filtered.forEach(item => {
                    const label = getLabel(item);
                    const val = getId(item);
                    const itemElement = document.createElement('button');
                    itemElement.type = 'button';
                    itemElement.classList.add('list-group-item', 'list-group-item-action');
                    itemElement.textContent = label;
                    itemElement.addEventListener('mousedown', (ev) => {
                      ev.preventDefault(); // évite le blur avant la sélection
                      selectedLabel = label || '';
                      selectedId = val || '';
                      searchInput.value = selectedLabel;
                      hiddenInput.value = selectedId;
                      suggestionsContainer.innerHTML = '';
                      searchInput.dispatchEvent(new Event('change'));
                      if (typeof onSelect === 'function') {
                        try { onSelect(item); } catch(_) {}
                      }
                    });
                    suggestionsContainer.appendChild(itemElement);
                  });
                }
              });

              searchInput.addEventListener('blur', () => {
                setTimeout(() => { suggestionsContainer.innerHTML = ''; }, 120); // Allow click event to fire
              });

              // Clear hidden input if search input is cleared
              searchInput.addEventListener('change', () => {
                if (!searchInput.value.trim()) {
                  hiddenInput.value = '';
                  selectedLabel = '';
                  selectedId = '';
                } else if (selectedLabel) {
                  searchInput.value = selectedLabel;
                  hiddenInput.value = selectedId;
                }
              });
            }

      

      if (associationSearchInput && associationIdHidden && associationSuggestionsContainer) {
        setupAutocomplete(
          associationSearchInput,
          associationIdHidden,
          associationSuggestionsContainer,
          '/api/associations',
          'titre',
          'id',
          { minChars: 1 },
          (item)=>{ if (item && item.id) renderAssociationPreview(item.id, item); }
        );
        if (associationIdHidden.value) renderAssociationPreview(associationIdHidden.value);
      }

      // Responsable (agents) autocomplete
      if (responsableSearchInput && responsableMatriculeHidden && responsableSuggestionsContainer) {
        setupAutocomplete(
          responsableSearchInput,
          responsableMatriculeHidden,
          responsableSuggestionsContainer,
          '/api/agents',
          (item) => `${item.prenom || ''} ${item.nom || ''} (${item.matricule || ''})`.trim(),
          'matricule',
          { minChars: 1 }
        );
      }

            if (adresseSearchInput && adresseIdHidden && adresseSuggestionsContainer) {
              const buildAdresseLabel = (a) => {
                const parts = [a.libelle, a.ligne1, a.code_postal, a.ville, a.pays].filter(Boolean);
                return parts.join(' • ');
              };
              // This will fetch existing addresses for selection
              setupAutocomplete(
                adresseSearchInput,
                adresseIdHidden,
                adresseSuggestionsContainer,
                '/api/adresses',
                buildAdresseLabel,
                'id',
                { minChars: 1 }
              );

              // Préremplir les champs libres si une adresse est choisie
              adresseSearchInput.addEventListener('change', async () => {
                if (!adresseIdHidden.value) return;
                try {
                  const headers = await buildHeaders(false);
                  const r = await fetch(`/api/adresses/${adresseIdHidden.value}`, { headers, credentials:'same-origin' });
                  if (!r.ok) return;
                  const adr = await r.json();
                  document.getElementById('addr_libelle').value = adr.libelle || '';
                  document.getElementById('addr_ligne1').value = adr.ligne1 || adr.adresse_ligne1 || '';
                  document.getElementById('addr_code_postal').value = adr.code_postal || adr.adresse_code_postal || '';
                  document.getElementById('addr_ville').value = adr.ville || adr.adresse_ville || '';
                  document.getElementById('addr_pays').value = adr.pays || adr.adresse_pays || 'France';
                } catch (_){}
              });
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

      async function renderAssociationPreview(associationId, fallbackData=null) {
        if (!associationId || !associationCard) { if (associationCard) associationCard.classList.add('d-none'); return; }
        if (fallbackData) {
          associationTitle.textContent = fallbackData.titre || `Association #${associationId}`;
          associationEmail.textContent = fallbackData.email_comptabilite || '';
          associationAdresse.textContent = '';
          if (associationViewLink) associationViewLink.href = `/association-view.html?id=${associationId}`;
          associationCard.classList.remove('d-none');
        }
        try {
          const h = await buildHeaders(false);
          const res = await fetch(`/api/associations/${associationId}`, { headers: h, credentials: 'same-origin' });
          if (!res.ok) throw new Error('Association introuvable');
          const a = await res.json();
          associationTitle.textContent = a.titre || `Association #${associationId}`;
          associationEmail.textContent = a.email_comptabilite || '';
          const adr = [a.ligne1, a.code_postal, a.ville].filter(Boolean).join(' ');
          associationAdresse.textContent = adr;
          if (associationViewLink) associationViewLink.href = `/association-view.html?id=${associationId}`;
          associationCard.classList.remove('d-none');
        } catch (e) {
          associationCard.classList.add('d-none');
        }
      }

      // Submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isAdmin) { alert('Action réservée aux administrateurs.'); return; }
        const nom_site = (document.getElementById('nom_site')?.value || '').trim();
        let adresse_id = (adresseIdHidden && !adresseIdHidden.disabled) ? (Number(adresseIdHidden.value) || null) : null;
        const commentaire = (document.getElementById('commentaire')?.value || '').trim() || null;
        if (!nom_site) { alert('Veuillez renseigner le nom du site.'); return; }
        // Le client est facultatif

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
              client_id: null,
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
