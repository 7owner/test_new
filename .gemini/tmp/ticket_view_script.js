
document.addEventListener('DOMContentLoaded', async function() {
      const qp = new URLSearchParams(location.search);
      const ticketId = qp.get('id');
      const token = localStorage.getItem('token');
      const userPayload = (()=>{ try{ return token? JSON.parse(atob(token.split('.')[1])):null; } catch { return null; } })();
      const userId = userPayload ? userPayload.id : null;
      const headers = token? { 'Authorization': `Bearer ${token}` } : {};
      const isAdmin = (()=>{ try{ const p = token? JSON.parse(atob(token.split('.')[1])):null; return Array.isArray(p?.roles)&&p.roles.includes('ROLE_ADMIN'); } catch { return false; } })();
      function set(id, val){ const el=document.getElementById(id); if(el) el.textContent = val||''; }
      function fmt(iso){ if(!iso) return ''; const d=new Date(iso); return isNaN(d)? '' : d.toLocaleString(); }
      let elapsedTimer = null;
      const elapsedEl = document.getElementById('view_elapsed');
      function formatElapsed(ms){
        if (!ms || ms<0) return '';
        const totalMin = Math.floor(ms/60000);
        const days = Math.floor((totalMin%(60*24))/60);
        const hours = Math.floor((totalMin%(60*24))/60);
        const mins = totalMin%60;
        return `${days}j ${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`;
      }
      function startElapsed(startIso, endIso){
        if (!elapsedEl || !startIso) return;
        if (elapsedTimer) clearInterval(elapsedTimer);
        const startMs = new Date(startIso).getTime();
        if (!startMs || isNaN(startMs)) return;
        const endMs = endIso ? new Date(endIso).getTime() : null;
        const update = () => {
          const now = endMs && !isNaN(endMs) ? endMs : Date.now();
          elapsedEl.textContent = formatElapsed(now - startMs);
        };
        update();
        if (!endMs || isNaN(endMs)) {
          elapsedTimer = setInterval(update, 1000);
        }
      }

      async function fetchJSON(url, opts) {
        const init = Object.assign(
          { credentials: 'same-origin', headers: Object.assign({}, headers) },
          opts || {} 
        );
        // Merge headers if provided in opts
        if (opts && opts.headers) {
          init.headers = Object.assign({}, headers, opts.headers);
        }
        const r = await fetch(url, init);
        const ct = r.headers.get('content-type') || '';
        const b = ct.includes('application/json') ? await r.json().catch(() => null) : null;
        if (!r.ok) throw new Error((b && b.error) || r.statusText);
        return b;
      }
      try {
        const res = await fetch(`/api/tickets/${ticketId}/relations`, { headers, credentials: 'same-origin' });
        if (res.status===401||res.status===403){ location.href='/login.html'; return; }
        const data = await res.json();
        if (!res.ok) throw new Error(data && data.error || `HTTP ${res.status}`);
        const t = data.ticket; if (!t) throw new Error('Not found');
        let demandeId = t.demande_id || null;
        if (!demandeId && Array.isArray(data.demandes) && data.demandes.length) {
          demandeId = data.demandes.reduce((acc, d) => acc && acc > d.id ? acc : d.id, null);
        }
        // Si au moins une intervention, forcer état affiché à En cours
        if (Array.isArray(data.interventions) && data.interventions.length > 0 && t.etat !== 'Termine') {
          t.etat = 'En_cours';
        }
        set('ticket-title', t.titre || '(Sans titre)');
        const title = t.titre || '(Sans titre)';
        const headerTitle = document.getElementById('header-title');
        if (headerTitle) headerTitle.textContent = title;
        set('view_titre', title); set('view_description', t.description||''); set('view_etat', t.etat||'');
        set('view_date_debut', fmt(t.date_debut)); set('view_date_fin', t.date_fin? fmt(t.date_fin) : 'En cours');
        const endIso = (t.etat === 'Termine')
          ? (t.date_fin || new Date().toISOString())
          : t.date_fin;
        startElapsed(t.date_debut, endIso);
        const headerStatusText = document.getElementById('header-status-text');
        if (headerStatusText) headerStatusText.textContent = t.etat || '';
        const doe = data.doe;
        const doeEl=document.getElementById('view_doe');
        if (doeEl) doeEl.innerHTML = (doe && doe.id) ? `<a href="doe-view.html?id=${doe.id}">${doe.titre || 'DOE'}</a>` : 'N/A';
        
        const affaire = data.affaire;
        const affaireEl = document.getElementById('view_affaire');
        if (affaireEl) {
          if (affaire && affaire.id) {
            affaireEl.innerHTML = `<a href="affaire-view.html?id=${affaire.id}">${affaire.nom_affaire || 'Affaire #' + affaire.id} (${affaire.numero_affaire || 'N/A'})</a>`;
          } else {
            affaireEl.textContent = 'N/A';
          }
        }
        
        const siteEl = document.getElementById('view_site');
        if (siteEl) {
          const s = data.site; if (s && s.id) { const name = s.nom_site? ` — ${s.nom_site}` : ''; siteEl.innerHTML = `<a href="site-view.html?id=${s.id}">Site #${s.id}${name}</a>`; }
          else if (t.site_id) siteEl.innerHTML = `<a href="site-view.html?id=${t.site_id}">Site #${t.site_id}</a>`; else siteEl.textContent='N/A';
        }

        // Carte Site associé
        const siteData = data.site || {};
        let clientId = siteData.client_id || data.client?.id || t.client_id;
        const siteNom = siteData.nom_site || `Site #${siteData.id || t.site_id || ''}` || 'N/A';
        let siteClient = siteData.client_nom || data.client?.nom_client || 'N/A';
        let siteStatut = siteData.status || siteData.statut || 'N/A';
        const siteLink = document.getElementById('site-view-link');
        if (siteLink && siteData.id) {
          siteLink.classList.remove('d-none');
          siteLink.href = `site-view.html?id=${siteData.id}`;
        }
        document.getElementById('site-name').textContent = siteNom;
        document.getElementById('view_client').textContent = siteClient;
        document.getElementById('site-statut').textContent = siteStatut;
        const contactStr = `${siteData.representant_nom || ''} ${siteData.representant_tel || ''}`.trim();
        const contactEl = document.getElementById('view_contact');
        if (contactEl) contactEl.textContent = contactStr || 'Non spécifié';

        // Chargement complet des infos du site (adresse + représentants), comme dans site-view
        const fillSiteDetails = (rel) => {
          const adresse = rel?.adresse;
          if (adresse) {
            const adrHtml = [
              adresse.ligne1,
              adresse.ligne2,
              `${adresse.code_postal || ''} ${adresse.ville || ''}`.trim(),
              adresse.pays
            ].filter(Boolean).join('<br>');
            document.getElementById('view_adresse').innerHTML = adrHtml || '—';
          } else {
            document.getElementById('view_adresse').textContent = siteData.adresse_libelle || siteData.adresse || 'N/A';
          }
          if (rel?.site?.client_id) clientId = rel.site.client_id;
          if (rel?.site?.nom_client) {
            siteClient = rel.site.nom_client;
            document.getElementById('view_client').textContent = siteClient;
          }
          if (rel?.site?.status || rel?.site?.statut) {
            siteStatut = rel.site.status || rel.site.statut;
            document.getElementById('site-statut').textContent = siteStatut;
          }
          const contactStr2 = `${rel?.site?.representant_nom || rel?.site?.contact_nom || ''} ${rel?.site?.representant_tel || rel?.site?.contact_tel || ''}`.trim();
          if (contactStr2 && contactEl) contactEl.textContent = contactStr2;
          const commEl = document.getElementById('view_commentaire');
          if (commEl) commEl.textContent = rel?.site?.commentaire || siteData.commentaire || 'Aucun commentaire';

          const repsList = document.getElementById('representants-list');
          if (repsList) {
            repsList.innerHTML = '';
            const reps = rel?.representants || data.representants || [];
            if (!reps.length) {
              repsList.innerHTML = '<div class="text-muted">Aucun représentant.</div>';
            } else {
              reps.forEach(rep => {
                const badge = (rep.nom || rep.email || 'N')[0].toUpperCase();
                repsList.innerHTML += `
                  <div class="d-flex align-items-start mb-2">
                    <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;">
                      ${badge}
                    </div>
                    <div class="ms-3">
                      <div class="fw-semibold">${rep.nom || 'Inconnu'}</div>
                      <div class="small text-muted">${rep.fonction || ''}</div>
                      <div class="small text-muted"><i class="bi bi-envelope me-1"></i>${rep.email || 'N/A'} ${rep.tel ? `<span class="ms-2"><i class="bi bi-phone me-1"></i>${rep.tel}</span>` : ''}</div>
                    </div>
                  </div>`;
              });
            }
          }
        };

        if (siteData.id) {
          try {
            const relRes = await fetch(`/api/sites/${siteData.id}/relations`, { headers, credentials: 'same-origin' });
            if (relRes.ok) {
              const rel = await relRes.json();
              if (rel?.site?.client_id) clientId = rel.site.client_id;
              fillSiteDetails(rel);
            } else {
              fillSiteDetails({ site: siteData });
            }
          } catch (e) {
            console.warn('Erreur chargement relations site', e);
            fillSiteDetails({ site: siteData });
          }
        } else {
          fillSiteDetails({ site: siteData });
        }

        // Modal client (ouvre client-view dans une iframe)
        const clientLink = document.getElementById('view_client');
        if (clientId && clientLink) {
          clientLink.classList.add('link-button');
          clientLink.addEventListener('click', () => {
            const frame = document.getElementById('clientModalFrame');
            if (frame) frame.src = `client-view.html?id=${clientId}`;
            const modalEl = document.getElementById('clientModal');
            if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
          });
        }

        const messagesBtn = document.getElementById('view-messages-btn');
        if (messagesBtn && ticketId) {
          messagesBtn.classList.remove('d-none');
          messagesBtn.addEventListener('click', async () => {
            let conversationId = null;
            // priorité : demande liée
            if (demandeId) {
              conversationId = `demande-${demandeId}`;
            } else {
              // tentative de récupérer une demande depuis les relations à la volée
              try {
                const fresh = await fetchJSON(`/api/tickets/${ticketId}/relations`);
                if (Array.isArray(fresh?.demandes) && fresh.demandes.length) {
                  const dId = fresh.demandes.reduce((acc, d) => acc && acc > d.id ? acc : d.id, null);
                  if (dId) conversationId = `demande-${dId}`;
                }
              } catch (e) {
                console.warn('Impossible de récupérer les demandes pour le ticket', e);
              }
              // fallback ticket
              if (!conversationId) conversationId = `ticket-${ticketId}`;
            }
            // redirection messagerie avec double paramètre pour compatibilité
            window.location.href = `/messagerie.html?conversation_id=${conversationId}&conversation=${conversationId}`;
          });
        }
        set('view_responsable', t.responsable || 'Non assigné');

        const list = document.getElementById('ticket-interventions-list'); list.innerHTML = '';
        const items = Array.isArray(data.interventions)? data.interventions : [];
        if (!items.length) list.innerHTML = '<p class="text-muted">Aucune intervention associée.</p>';
        items.forEach(inter => {
          const el = document.createElement('div'); el.className='card card-body mb-2';
          const interElapsed = inter.date_debut ? formatElapsed((inter.date_fin ? new Date(inter.date_fin).getTime() : Date.now()) - new Date(inter.date_debut).getTime()) : '';
          el.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h6 class="mb-1">${inter.titre || '(Sans titre)'}</h6>
                <div class="text-muted small">${inter.description || ''}</div>
                <small class="text-muted">Du ${fmt(inter.date_debut)||''} au ${fmt(inter.date_fin)||'N/A'}</small>
              </div>
              <div class="text-end">
                <div class="small text-muted mb-1">Temps écoulé: ${interElapsed || '—'}</div>
                <a href="intervention-view.html?id=${inter.id}" class="btn btn-sm btn-info me-1"><i class="bi bi-eye"></i> Voir</a>
              </div>
            </div>`;
          list.appendChild(el);
        });

        // Responsables et agents assignés
        const responsablesList = document.getElementById('responsables-list');
        const agentsList = document.getElementById('agents-list');

        function renderResponsables(arr) {
          if (!responsablesList) return;
          responsablesList.innerHTML = '';
          if (!arr || !arr.length) {
            responsablesList.innerHTML = '<li class="list-group-item text-muted">Aucun responsable.</li>';
            return;
          }
          arr.forEach(r => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            const label = (r.actor_email || r.actor_name || r.agent_matricule || 'Responsable')
              + (r.role ? ` (${r.role})` : '');
            li.textContent = label;
            responsablesList.appendChild(li);
          });
        }

        function renderAgents(arr) {
          const container = document.getElementById('agents-list');
          if (!container) return;
          container.innerHTML = '';
          
          if (!arr || !arr.length) {
            agentsList.innerHTML = '<li class="list-group-item text-muted">Aucun agent assigné.</li>';
            return;
          }
          arr.forEach(a => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.textContent = a.agent_matricule || a.matricule || 'Agent';
            agentsList.appendChild(li);
          });
        }

        const responsables = data.responsables || data.responsables_secondaires || [];
        const agentsAssignes = data.agents_assignes || [];
        renderResponsables(responsables);
        renderAgents(agentsAssignes);

        // Admin features
        if (isAdmin) {
          const addInt = document.getElementById('add-intervention-btn');
          if (addInt) addInt.classList.remove('d-none');
          const addResp = document.getElementById('add-responsable-btn');
          if (addResp) addResp.classList.remove('d-none');
          const addAgent = document.getElementById('add-agent-btn');
          if (addAgent) addAgent.classList.remove('d-none');
          const editBtn = document.getElementById('edit-ticket-btn');
          if (editBtn) editBtn.classList.remove('d-none');
          const adminActions = document.getElementById('admin-actions-card');
          if (adminActions) adminActions.classList.remove('d-none');

          // Chargement des agents pour les sélecteurs
          let allAgents = [];
          try {
            const agentsRes = await fetch('/api/agents', { headers, credentials: 'same-origin' });
            if (agentsRes.ok) {
              allAgents = await agentsRes.json();
            }
          } catch (e) { console.warn('Erreur chargement agents', e); }

          const responsableSelect = document.getElementById('responsable-select');
          const agentSelect = document.getElementById('agent-select');

          function populateSelect(selectEl, filterFn) {
            if (!selectEl) return;
            selectEl.innerHTML = '<option value="">-- Sélectionner --</option>';
            (allAgents || [])
              .filter(filterFn || (() => true))
              .forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.matricule;
                opt.textContent = `${a.matricule} - ${a.nom} ${a.prenom}`;
                selectEl.appendChild(opt);
              });
          }

          // Responsable : admin + Chef
          populateSelect(responsableSelect, a =>
            Array.isArray(a.roles) && a.roles.includes('ROLE_ADMIN')
          );
          // Agents : tous
          populateSelect(agentSelect);

          const saveResponsableBtn = document.getElementById('save-responsable-btn');
          if (saveResponsableBtn && responsableSelect) {
            saveResponsableBtn.addEventListener('click', async () => {
              const matricule = responsableSelect.value;
              if (!matricule) return alert('Veuillez sélectionner un responsable.');
              try {
                const resPost = await fetch(`/api/tickets/${ticketId}/responsables`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  credentials: 'same-origin',
                  body:  JSON.stringify({
                          agent_matricule: matricule,
                          matricule        : matricule
                        })
                });
                const body = await resPost.json().catch(() => ({}));
                if (!resPost.ok) throw new Error(body.error || 'Erreur lors de l\'ajout du responsable');
                alert('Responsable ajouté avec succès.');
                location.reload();
              } catch (err) {
                alert(`Erreur: ${err.message}`);
              }
            });
          }

          const saveAgentBtn = document.getElementById('save-agent-btn');
          if (saveAgentBtn && agentSelect) {
            saveAgentBtn.addEventListener('click', async () => {
              const matricule = agentSelect.value;
              if (!matricule) return alert('Veuillez sélectionner un agent.');
              try {
                const resPost = await fetch(`/api/tickets/${ticketId}/agents`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  credentials: 'same-origin',
                  body:  JSON.stringify({
                          agent_matricule: matricule,
                          matricule        : matricule
                        })
                });
                const body = await resPost.json().catch(() => ({}));
                if (!resPost.ok) throw new Error(body.error || 'Erreur lors de l\'assignation de l\'agent');
                alert('Agent assigné avec succès.');
                location.reload();
              } catch (err) {
                alert(`Erreur: ${err.message}`);
              }
            });
          }

          // Logic for creating Affaire
          const affaireForm = document.getElementById('create-affaire-form');
          if (affaireForm) {
            affaireForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const nomAffaire = document.getElementById('affaire-nom').value.trim();
              const numeroAffaire = document.getElementById('affaire-numero').value.trim();
              const descriptionAffaire = document.getElementById('affaire-description').value.trim();
              if (!nomAffaire) return alert('Le nom de l\'affaire est requis.');

              const clientId = data.site?.client_id;
              if (!clientId) return alert('Impossible de trouver le client associé à ce ticket pour créer une affaire.');

              try {
                const affaireRes = await fetch('/api/affaires', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  body: JSON.stringify({ nom_affaire: nomAffaire, numero_affaire: numeroAffaire, client_id: clientId, description: descriptionAffaire })
                });
                const newAffaire = await affaireRes.json();
                if (!affaireRes.ok) throw new Error(newAffaire.error || 'Erreur lors de la création de l\'affaire');

                const ticketUpdateRes = await fetch(`/api/tickets/${ticketId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  body: JSON.stringify({ ...t, affaire_id: newAffaire.id })
                });
                if (!ticketUpdateRes.ok) throw new Error('Erreur lors de la liaison de l\'affaire au ticket');

                alert('Affaire créée et liée avec succès!');
                location.reload();
              } catch (err) {
                alert(`Erreur: ${err.message}`);
              }
            });
          }

          // Logic for creating Intervention
          const interventionForm = document.getElementById('create-intervention-form');
          if (interventionForm) {
            interventionForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const payload = {
                titre: document.getElementById('intervention-titre').value,
                description: document.getElementById('intervention-description').value,
                date_debut: document.getElementById('intervention-date-debut').value,
                date_fin: document.getElementById('intervention-date-fin').value || null,
                ticket_id: ticketId,
                status: document.getElementById('intervention-status').value
              };

              try {
                const res = await fetch('/api/interventions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  body: JSON.stringify(payload)
                });
                if (!res.ok) {
                  const errorData = await res.json();
                  throw new Error(errorData.error || `HTTP ${res.status}`);
                }
                alert('Intervention créée avec succès!');
                location.reload();
              } catch (err) {
                alert(`Échec de la création: ${err.message}`);
              }
            });
          }

          // Logic for creating DOE
          const doeForm = document.getElementById('create-doe-form');
          if (doeForm) {
            doeForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const titreDoe = document.getElementById('doe-titre').value.trim();
              const descriptionDoe = document.getElementById('doe-description').value.trim();
              if (!titreDoe) return alert('Le titre du DOE est requis.');

              const siteId = data.ticket?.site_id;
              const affaireId = data.ticket?.affaire_id;
              if (!siteId || !affaireId) return alert('Le site et l\'affaire doivent être liés au ticket pour créer un DOE.');

              try {
                const doeRes = await fetch('/api/does', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  body: JSON.stringify({ titre: titreDoe, site_id: siteId, affaire_id: affaireId, description: descriptionDoe })
                });
                const newDoe = await doeRes.json();
                if (!doeRes.ok) throw new Error(newDoe.error || 'Erreur lors de la création du DOE');

                const ticketUpdateRes = await fetch(`/api/tickets/${ticketId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  body: JSON.stringify({ ...t, doe_id: newDoe.id })
                });
                if (!ticketUpdateRes.ok) throw new Error('Erreur lors de la liaison du DOE au ticket');

                alert('DOE créé et lié avec succès!');
                location.reload();
              } catch (err) {
                alert(`Erreur: ${err.message}`);
              }
            });
          }

        }
      } catch(e) {
        set('ticket-title', 'Ticket introuvable');
        console.error('Error loading ticket data:', e);
      }
    });
  
