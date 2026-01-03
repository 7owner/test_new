document.addEventListener('DOMContentLoaded', async function() {
      const msg = document.getElementById('msg');
      function showMsg(text, type) { if (!msg) return; msg.className = `alert alert-${type||'info'}`; msg.textContent = text; msg.classList.remove('d-none'); }

      const token = localStorage.getItem('token');
      let isAdmin = false;
      if (token) { try { const p=JSON.parse(atob(token.split('.')[1])); isAdmin = Array.isArray(p.roles) && p.roles.includes('ROLE_ADMIN'); } catch(_){} }
      if (!isAdmin) { const f=document.getElementById('ticket-new-form'); if (f) f.innerHTML = '<div class="alert alert-danger">Accès refusé. Seuls les administrateurs peuvent créer des tickets.</div>'; return; }

      const headers = token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' };

      // Autocomplete setup function
      function setupAutocomplete(searchInput, hiddenInput, suggestionsContainer, fetchUrl, displayKey, idKey, extraParams = {}) {
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
              const url = new URL(fetchUrl, window.location.origin);
              url.searchParams.append('query', query);
              for (const key in extraParams) {
                if (extraParams[key]) url.searchParams.append(key, extraParams[key]);
              }

              const response = await fetch(url.toString(), { headers, credentials: 'same-origin' });
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
                // Trigger change event for dynamic updates (e.g., site preview)
                searchInput.dispatchEvent(new Event('change'));
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

      // Variable declarations for new inputs
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

      // Setup autocompletes
      setupAutocomplete(siteSearchInput, siteIdHidden, siteSuggestionsContainer, '/api/sites', 'nom_site', 'id'); // Site no longer filtered by client
      setupAutocomplete(doeSearchInput, doeIdHidden, doeSuggestionsContainer, '/api/does', 'titre', 'id', { site_id: siteIdHidden.value }); // DOE can be filtered by site
      setupAutocomplete(affaireSearchInput, affaireIdHidden, affaireSuggestionsContainer, '/api/affaires', 'nom_affaire', 'id');
      setupAutocomplete(responsableSearchInput, responsableIdHidden, responsableSuggestionsContainer, '/api/agents', (item) => `${item.prenom} ${item.nom} (${item.matricule})`, 'matricule');

      // Update filters and preview on change
      siteIdHidden.addEventListener('change', () => {
        // Re-initialize DOE autocomplete with new site_id filter
        setupAutocomplete(doeSearchInput, doeIdHidden, doeSuggestionsContainer, '/api/does', 'titre', 'id', { site_id: siteIdHidden.value });
        // Clear DOE selection
        doeSearchInput.value = '';
        doeIdHidden.value = '';
        doeDetailsDiv.classList.add('d-none'); // Hide DOE details
        updateSitePreview(); // Update site preview based on selected site
      });

      

      doeIdHidden.addEventListener('change', () => {
        const selDoeId = doeIdHidden.value;
        if (selDoeId) {
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
              doeDetailsDiv.classList.remove('d-none');
            });
        } else {
          doeDetailsDiv.classList.add('d-none');
        }
      });

      

            // Function to update the site preview card

            async function updateSitePreview() {

              const currentSiteId = siteIdHidden.value;

              if (currentSiteId) {

                try {

                  const resSite = await fetch(`/api/sites/${currentSiteId}/relations`, { headers, credentials: 'same-origin' });

                  if (resSite.ok) {

                    const siteData = await resSite.json();

                    const { site = {}, adresse = {}, representants = [] } = siteData;

                    if (siteCard) siteCard.classList.remove('d-none');

                    if (siteViewLink) { siteViewLink.href = `site-view.html?id=${site.id || currentSiteId}`; }

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

                  } else {

                    siteCard.classList.add('d-none');

                  }

                } catch (error) {

                  console.error('Error fetching site relations for preview:', error);

                  siteCard.classList.add('d-none');

                }

              } else {

                siteCard.classList.add('d-none');

              }

            }

      

            

      

      

      // Submit
      const form = document.getElementById('ticket-new-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!doeIdHidden.value || !affaireIdHidden.value) {
          alert('DOE et Affaire sont obligatoires pour créer un ticket.');
          return;
        }
        const payload = {
          titre: (document.getElementById('titre')?.value || '').trim() || null,
          description: (document.getElementById('description')?.value || '').trim() || null,
          site_id: Number(siteIdHidden.value) || null,
          doe_id: Number(doeIdHidden.value) || null,
          affaire_id: Number(affaireIdHidden.value) || null,
          etat: (document.getElementById('etat')?.value || null),
          responsable: (responsableIdHidden.value || null),
        };

        // Optional dates: send ISO strings if provided
        try {
          const dd = (document.getElementById('date_debut')?.value || '').trim();
          const df = (document.getElementById('date_fin')?.value || '').trim();
          payload.date_debut = dd ? new Date(dd).toISOString() : null;
          payload.date_fin = df ? new Date(df).toISOString() : null;
        } catch(_) { payload.date_debut = payload.date_debut || null; payload.date_fin = payload.date_fin || null; }

        try {
          const r = await fetch('/api/tickets', { method:'POST', headers, credentials:'same-origin', body: JSON.stringify(payload) });
          if (!r.ok) { const d=await r.json().catch(()=>({})); throw new Error(d && d.error ? d.error : `HTTP ${r.status}`); }
          const created = await r.json();
          if (created && created.id) { alert('Ticket créé avec succès'); location.href = `ticket-view.html?id=${created.id}`; }
          else { throw new Error('Réponse invalide du serveur'); }
        } catch(err) { console.error(err); alert(`Échec de la création: ${err.message}`); }
      });
    });
