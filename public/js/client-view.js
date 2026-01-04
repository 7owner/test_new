document.addEventListener('DOMContentLoaded', async () => {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams(location.search);
      const id = params.get('id');

      if (!id) {
        document.body.innerHTML = `
          <div class="container mt-5">
            <div class="alert alert-danger">
              <i class="bi bi-exclamation-triangle me-2"></i>
              Client ID manquant dans l'URL
            </div>
          </div>`;
        return;
      }

      async function fetchJSON(url, opts) {
        const base = { headers: { 'Content-Type': 'application/json' } };
        if (token) base.headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(url, Object.assign(base, opts || {}));
        const ct = r.headers.get('content-type') || '';
        const b = ct.includes('application/json') ? await r.json() : null;
        if (!r.ok) throw new Error((b && b.error) || r.statusText);
        return b;
      }

      async function fetchBinaryURL(url) {
        const r = await fetch(url, {
          headers: token ? { 'Authorization': 'Bearer ' + token } : {},
          credentials: 'same-origin'
        });
        if (!r.ok) return null;
        const blob = await r.blob();
        return URL.createObjectURL(blob);
      }

      function getStatusBadge(status) {
        const map = {
          'En cours de traitement': 'status-progress',
          'Terminé': 'status-completed',
          'Complété': 'status-completed',
          'En attente': 'status-pending'
        };
        return `<span class="status-badge ${map[status] || 'status-pending'}">${status || 'En cours'}</span>`;
      }

      const docList = document.getElementById('repo-docs');
      const imgList = document.getElementById('repo-imgs');
      const msgsInfo = document.getElementById('repo-msgs-info');
      const addRepBtn = document.getElementById('add-rep-btn');
      const repModalEl = document.getElementById('repModal');
      const repModal = repModalEl ? new bootstrap.Modal(repModalEl) : null;
      const repFeedback = document.getElementById('rep-feedback');
      const saveNewRepBtn = document.getElementById('save-rep-btn');
      const editRepModalEl = document.getElementById('editRepModal');
      const editRepModal = editRepModalEl ? new bootstrap.Modal(editRepModalEl) : null;
      const editRepFeedback = document.getElementById('edit-rep-feedback');
      const openContratModalBtn = document.getElementById('openContratModal');
      //const contratModalEl = document.getElementById('contratModal'); // Old modal for direct contract creation
      //const contratModal = contratModalEl ? new bootstrap.Modal(contratModalEl) : null; // Old modal for direct contract creation
      //const contratFeedback = document.getElementById('contrat-feedback'); // Old feedback for direct contract creation
      //const saveContratBtn = document.getElementById('save-contrat-btn'); // Old save button for direct contract creation
      const saveEditRepBtn = document.getElementById('save-rep-btn');
      let currentRepEditing = null;

      try {
        const data = await fetchJSON('/api/clients/' + id + '/relations');
        const { client: c, sites, demandes, representants, contrats } = data; // Added 'contrats'
        let isAdmin = false;
        try {
          const payload = token ? JSON.parse(atob(token.split('.')[1])) : {};
          isAdmin = payload?.roles?.includes('ROLE_ADMIN');
        } catch {}

        // Affichage des informations du client
        document.getElementById('client-nom').textContent = c.nom_client || 'Non spécifié';
        const adresse = c.adresse_libelle || c.adresse_id;
        document.getElementById('client-adresse-id').textContent = adresse || 'Non spécifié';
        document.getElementById('client-commentaire').textContent = c.commentaire || 'Aucun commentaire';

        const editLink = document.getElementById('editLink');
        if (editLink) {
          editLink.href = `/client-edit.html?id=${encodeURIComponent(id)}`;
          editLink.style.display = 'inline-block';
        }

        // Représentants
        const representantsList = document.getElementById('representants-list');
        representantsList.innerHTML = '';
        if (representants?.length) {
          representants.forEach(rep => {
            const badge = (rep.nom || rep.email || 'N')[0].toUpperCase();
            const nomAff = rep.nom || rep.email || 'Inconnu';
            representantsList.innerHTML += `
              <div class="rep-card">
                <div class="d-flex align-items-start justify-content-between">
                  <div class="d-flex align-items-start">
                    <div style="width:50px;height:50px;border-radius:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:bold;">
                      ${badge}
                    </div>
                    <div class="ms-3">
                      <h6 class="fw-bold mb-1">${nomAff}</h6>
                      <small class="text-muted">${rep.fonction || ''}</small><br>
                      <small><i class="bi bi-envelope me-1"></i>${rep.email || 'N/A'}</small>
                      <small class="ms-2"><i class="bi bi-phone me-1"></i>${rep.tel || 'N/A'}</small>
                    </div>
                  </div>
                  ${isAdmin ? `
                  <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary rep-edit-btn" data-id="${rep.client_representant_id}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger rep-del-btn" data-id="${rep.client_representant_id}"><i class="bi bi-trash"></i></button>
                  </div>` : ''}
                </div>
              </div>`;
          });
        } else {
          representantsList.innerHTML = `<div class="empty-state"><i class="bi bi-people"></i><p>Aucun représentant</p></div>`;
        }

        // Contrats (New Card)
        const contratsContainer = document.getElementById('contrats-container');
        if (contratsContainer) {
          contratsContainer.innerHTML = ''; // Clear loading spinner
          if (contrats?.length) {
            contrats.forEach(contrat => {
              contratsContainer.innerHTML += `
                <div class="list-item-custom">
                  <strong>${contrat.titre || `Contrat #${contrat.id}`}</strong><br>
                  <small class="text-muted">${contrat.date_debut ? new Date(contrat.date_debut).toLocaleDateString() : ''} - ${contrat.date_fin ? new Date(contrat.date_fin).toLocaleDateString() : 'En cours'}</small>
                  <a href="#" class="btn btn-sm btn-outline-primary mt-2 view-contrat-btn" data-id="${contrat.id}">
                    <i class="bi bi-eye"></i> Voir
                  </a>
                </div>
              `;
            });
          } else {
            contratsContainer.innerHTML = `
              <div class="empty-state">
                <i class="bi bi-file-earmark-spreadsheet"></i><p>Aucun contrat</p>
              </div>`;
          }
        }

        // Sites
        const sitesContainer = document.getElementById('sites-container');
        sitesContainer.innerHTML = sites?.length ? '' : `
          <div class="empty-state">
            <i class="bi bi-building"></i><p>Aucun site</p>
          </div>`;
        sites?.forEach(s =>
          sitesContainer.innerHTML += `
            <div class="list-item-custom">
              <strong>${s.nom_site || 'Site #' + s.id}</strong><br>
              <a href="/site-view.html?id=${s.id}" class="btn btn-sm btn-outline-primary mt-2">
                <i class="bi bi-eye"></i> Voir
              </a>
            </div>`);

        // Demandes
        const demandesContainer = document.getElementById('demandes-container');
        demandesContainer.innerHTML = demandes?.length ? '' : `
          <div class="empty-state">
            <i class="bi bi-clipboard-check"></i><p>Aucune demande</p>
          </div>`;
        demandes?.forEach(d =>
          demandesContainer.innerHTML += `
            <div class="list-item-custom">
              <strong>#${d.id}</strong> ${getStatusBadge(d.status)}
              <div class="text-muted small">
                <i class="bi bi-building me-1"></i>${d.nom_site || 'Aucun site'}
              </div>
              <small>${d.description || '(sans description)'}</small>
            </div>`);

        if (isAdmin) {
          document.getElementById('adminActions').style.display = '';
          if (addRepBtn && repModal) addRepBtn.classList.remove('d-none');
        }

        // Actions reps (admin)
        if (isAdmin) {
          representantsList.querySelectorAll('.rep-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const repId = btn.getAttribute('data-id');
              if (!repId) return;
              if (!confirm('Supprimer ce représentant ?')) return;
              try {
                await fetchJSON(`/api/client_representant/${repId}`, { method: 'DELETE' });
                location.reload();
              } catch (err) {
                alert(err.message || 'Suppression impossible');
              }
            });
          });

          representantsList.querySelectorAll('.rep-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const repId = btn.getAttribute('data-id');
              const rep = (representants || []).find(r => String(r.client_representant_id) === String(repId));
              if (!rep || !editRepModal) return;
              currentRepEditing = rep.client_representant_id;
              editRepFeedback.textContent = '';
              document.getElementById('edit-rep-id').value = rep.client_representant_id;
              document.getElementById('edit-rep-nom').value = rep.nom || '';
              document.getElementById('edit-rep-email').value = rep.email || '';
              document.getElementById('edit-rep-tel').value = rep.tel || '';
              document.getElementById('edit-rep-fonction').value = rep.fonction || '';
              editRepModal.show();
            });
          });

          // Ajouter représentant
          if (addRepBtn && repModal && saveNewRepBtn && repFeedback) {
            addRepBtn.addEventListener('click', () => {
              repFeedback.classList.add('d-none');
              repFeedback.textContent = '';
              document.getElementById('rep-nom').value = '';
              document.getElementById('rep-email').value = '';
              document.getElementById('rep-tel').value = '';
              document.getElementById('rep-fonction').value = '';
              repModal.show();
            });

            saveNewRepBtn.addEventListener('click', async () => {
              repFeedback.classList.add('d-none');
              const nom = document.getElementById('rep-nom').value.trim();
              const email = document.getElementById('rep-email').value.trim();
              const tel = document.getElementById('rep-tel').value.trim();
              const fonction = document.getElementById('rep-fonction').value.trim();
              if (!email && !nom) {
                repFeedback.className = 'small text-danger';
                repFeedback.textContent = 'Email ou nom requis.';
                repFeedback.classList.remove('d-none');
                return;
              }
              try {
                await fetchJSON(`/api/clients/${id}/representants`, {
                  method:'POST',
                  body: JSON.stringify({ email, nom, tel, fonction })
                });
                repFeedback.className = 'small text-success';
                repFeedback.textContent = 'Représentant ajouté.';
                repFeedback.classList.remove('d-none');
                setTimeout(()=>{ repModal.hide(); location.reload(); }, 600);
              } catch(err) {
                repFeedback.className = 'small text-danger';
                repFeedback.textContent = err.message || 'Ajout impossible';
                repFeedback.classList.remove('d-none');
              }
            });
          }
        }

        if (saveEditRepBtn) {
          saveEditRepBtn.addEventListener('click', async () => {
            if (!currentRepEditing) return;
            editRepFeedback.textContent = '';
            const payload = {
              nom: document.getElementById('edit-rep-nom').value,
              email: document.getElementById('edit-rep-email').value,
              tel: document.getElementById('edit-rep-tel').value,
              fonction: document.getElementById('edit-rep-fonction').value
            };
            try {
              await fetchJSON(`/api/client_representant/${currentRepEditing}`, { method: 'PUT', body: JSON.stringify(payload) });
              editRepFeedback.className = 'small text-success';
              editRepFeedback.textContent = 'Représentant mis à jour';
              setTimeout(() => { editRepModal.hide(); location.reload(); }, 600);
            } catch (err) {
              editRepFeedback.className = 'small text-danger';
              editRepFeedback.textContent = err.message || 'Erreur lors de la mise à jour';
            }
          });
        }

        /* 🔽 RÉPERTOIRE DOCUMENTS + IMAGES 🔽 */
        const allDocs = [];
        const allImages = [];
        const allMsgAttachments = [];

        const loadDocs = async (type, cibleId) => {
          if (!cibleId) return;
          try {
            const docs = await fetchJSON(`/api/documents?cible_type=${type}&cible_id=${cibleId}`);
            const imgs = await fetchJSON(`/api/images?cible_type=${type}&cible_id=${cibleId}`);
            if (docs) allDocs.push(...docs);
            if (imgs) allImages.push(...imgs);
          } catch {}
        };

        const loadMessages = async demandeId => {
          if (!demandeId) return;
          try {
            const msgs = await fetchJSON(`/api/conversations/demande-${demandeId}`);
            msgs?.forEach(m => allMsgAttachments.push(...m.attachments || []));
          } catch {}
        };

        for (const s of sites || []) {
          await loadDocs('Site', s.id);
          try {
            const rel = await fetchJSON(`/api/sites/${s.id}/relations`);
            rel.tickets?.forEach(async t => {
              await loadDocs('Ticket', t.id);
              if (t.demande_id) await loadMessages(t.demande_id);
            });
          } catch {}
        }

        for (const d of demandes || []) {
          await loadDocs('DemandeClient', d.id);
          await loadMessages(d.id);
        }

        /* 🔹 Affichage des documents */
        docList.innerHTML = '';
        if (!allDocs.length && !allMsgAttachments.length) {
          docList.innerHTML = `<div class="empty-state"><i class="bi bi-file-earmark-text"></i><p>Aucun document</p></div>`;
        } else {
          allDocs.forEach(doc => {
            docList.innerHTML += `
              <div class="doc-item">
                <div class="d-flex align-items-center">
                  <div class="doc-icon"><i class="bi bi-file-earmark-text"></i></div>
                  <div><strong>${doc.nom_fichier}</strong><br><small class="text-muted">Document</small></div>
                </div>
                <a href="/api/documents/${doc.id}/download" class="btn btn-sm btn-outline-primary">
                  Télécharger
                </a>
              </div>`;
          });

          allMsgAttachments.forEach(att => {
            docList.innerHTML += `
              <div class="doc-item">
                <div class="d-flex align-items-center">
                  <div class="doc-icon"><i class="bi bi-paperclip"></i></div>
                  <div><strong>${att.file_name}</strong><br><small class="text-muted">Depuis message</small></div>
                </div>
                <a href="/api/attachments/${att.id}/view" class="btn btn-sm btn-outline-primary">
                  Télécharger
                </a>
              </div>`;
          });
        }

        /* 🔹 Affichage images */
        imgList.innerHTML = '';
        imgList.classList.add('image-gallery');
        if (!allImages.length) {
          imgList.innerHTML = `<div class="empty-state"><i class="bi bi-image"></i><p>Aucune image</p></div>`;
        } else {
          for (const img of allImages) {
            const url = await fetchBinaryURL(`/api/images/${img.id}/view`);
            if (!url) continue;
            imgList.innerHTML += `
              <a href="${url}" class="image-thumbnail" target="_blank">
                <img src="${url}" alt="">
              </a>`;
          }
        }

        if (msgsInfo && allMsgAttachments.length) {
          msgsInfo.innerHTML = `<i class="bi bi-info-circle me-1"></i>${allMsgAttachments.length} pièce(s) jointe(s) issue(s) des messages`;
        }

      } catch (err) {
        console.error(err);
        alert('Erreur de chargement: ' + err.message);
      }

      // --- Contrat creation modal logic ---
      // This part will be refactored to use contrat-new.html in an iframe
      const openContratModalActualBtn = document.getElementById('openContratModal');
      const createContratModalEl = document.getElementById('createContratModal'); // Reference to the new modal
      if (openContratModalActualBtn && createContratModalEl) {
        const createContratModal = new bootstrap.Modal(createContratModalEl);
        openContratModalActualBtn.addEventListener('click', () => {
          createContratModal.show();
        });
        createContratModalEl.addEventListener('hidden.bs.modal', () => {
            location.reload(); // Reload to reflect newly created contract
        });
      }
      
      // Also ensure to remove or repurpose the old contratModal, contratFeedback and saveContratBtn logic if they are still present.
      // They are commented out in the variable declarations, but if the HTML elements exist, they might still interfere.

    });
