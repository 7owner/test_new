document.addEventListener("DOMContentLoaded", () => {
      const App = window.AppCore || {
        getToken: () => localStorage.getItem("token") || "",
        clearAuth: () => {
          localStorage.removeItem("token");
          localStorage.removeItem("userRole");
        },
        apiJson: async (url, opts = {}) => {
          const res = await fetch(url, { credentials: "same-origin", ...opts });
          const isJson = (res.headers.get("content-type") || "").includes("json");
          const payload = isJson ? await res.json().catch(() => null) : null;
          if (!res.ok) {
            const err = new Error((payload && payload.error) || `HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          return payload;
        }
      };
      const token = App.getToken();
      if (!token) return location.href = "/login.html";

      const api = async (url, opts = {}) => {
        try {
          return await App.apiJson(url, {
            ...opts,
            headers: {
              "Authorization": "Bearer " + token,
              "Content-Type": "application/json",
              ...(opts.headers || {})
            },
            credentials: "same-origin"
          });
        } catch (e) {
          if (e?.status === 401 || e?.status === 403) {
            App.clearAuth();
            location.href = "/login.html";
            throw new Error("Unauthorized");
          }
          throw e;
        }
      };

      document.getElementById("client-logout-btn").addEventListener("click", () => {
        if (confirm("Êtes-vous sûr de vouloir vous déconnecter ?")) {
          App.clearAuth();
          location.href = "/login.html";
        }
      });

      const notifBtn = document.getElementById("notif-btn");
      const notifBadge = document.getElementById("notif-badge");

      function getStatusClass(status) {
        const s = String(status || "En_cours")
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, '_');
        return {
          "en_cours_de_traitement": "status-en-cours",
          "en_cours": "status-en-cours",
          "en_attente": "status-en-cours",
          "traitee": "status-traite",
          "traite": "status-traite",
          "rejetee": "status-rejete",
          "rejete": "status-rejete",
          "annule": "status-annule",
          "annulee": "status-annule"
        }[s] || "status-en-cours";
      }

      function setLoading(el, msg = "Chargement...") {
        el.innerHTML = `
          <div class="text-center py-5">
            <div class="spinner-border text-primary mb-3" role="status">
              <span class="visually-hidden">${msg}</span>
            </div>
            <p class="text-muted">${msg}</p>
          </div>
        `;
      }

      async function loadProfile() {
        try {
          const p = await api("/api/client/profile");
          document.getElementById("profileNomClient").textContent = p.nom_client || "Non renseigné";
          document.getElementById("profileRepresentantEmail").textContent = p.representant_email || "Non renseigné";
          document.getElementById("profileRepresentantTel").textContent = p.representant_tel || "Non renseigné";
          document.getElementById("header-client-name").textContent = p.nom_client || "Client";
          
          if (p.commentaire) {
            document.getElementById("profileCommentaire").textContent = p.commentaire;
            document.getElementById("profileCommentaireContainer").style.display = "block";
          }
        } catch (e) {
          console.error("profile error:", e);
        }
      }

      async function loadSites() {
        const el = document.getElementById("sitesList");
        setLoading(el, "Chargement des sites...");

        try {
          const sites = await api("/api/client/sites");
          
          if (!sites.length) {
            el.innerHTML = `
              <div class="empty-state">
                <i class="bi bi-building"></i>
                <p class="mb-0">Aucun site enregistré</p>
              </div>
            `;
            return;
          }

          el.innerHTML = sites.map(site => `
            <div class="item-card">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h5 class="fw-bold mb-0">${site.nom_site || "Site sans nom"}</h5>
                <span class="badge bg-primary">ID: ${site.id}</span>
              </div>
              <p class="text-muted mb-0">${site.commentaire || "Pas de commentaire"}</p>
              <div class="action-buttons">
                <button class="btn btn-sm btn-warning btn-action" data-modal="editSiteModal" data-id="${site.id}">
                  <i class="bi bi-pencil me-1"></i>Modifier
                </button>
                <button class="btn btn-sm btn-secondary btn-action" data-modal="siteFilesModal" data-id="${site.id}">
                  <i class="bi bi-paperclip me-1"></i>Fichiers
                </button>
              </div>
            </div>
          `).join("");
        } catch (e) {
          el.innerHTML = `
            <div class="alert alert-danger">
              <i class="bi bi-exclamation-triangle me-2"></i>
              Erreur de chargement des sites
            </div>
          `;
          console.error("sites error:", e);
        }
      }

      function updateTravauxCard(demands) {
        const card = document.getElementById("travauxCard");
        if (!card) return;
        const body = card.querySelector(".travaux-body");
        if (!demands || !demands.length) {
          body.innerHTML = `
            <div class="empty-state">
              <i class="bi bi-inbox"></i>
              <p class="mb-0">Aucune demande enregistrée pour le moment.</p>
            </div>
          `;
          return;
        }
        const total = demands.length;
        const enCours = demands.filter(d => (d.status || "").toLowerCase().includes("cours")).length;
        const verrouillees = demands.filter(d => d.ticket_id).length;
        const last = demands[0];
        const siteLabel = last.nom_site || last.site_nom || "";
        body.innerHTML = `
          <div class="row g-3">
            <div class="col-md-4">
              <div class="item-card">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-semibold">Total</span>
                  <span class="badge bg-primary">${total}</span>
                </div>
                <p class="text-muted small mb-0">Toutes vos demandes enregistrées.</p>
              </div>
            </div>
            <div class="col-md-4">
              <div class="item-card">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-semibold">En cours</span>
                  <span class="badge bg-warning text-dark">${enCours}</span>
                </div>
                <p class="text-muted small mb-0">Demandes encore en traitement.</p>
              </div>
            </div>
            <div class="col-md-4">
              <div class="item-card">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-semibold">Converties en ticket</span>
                  <span class="badge bg-success">${verrouillees}</span>
                </div>
                <p class="text-muted small mb-0">Déjà transmises au support.</p>
              </div>
            </div>
          </div>
          <div class="item-card mt-3">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div>
                <div class="demand-chip"><i class="bi bi-hash"></i>Dernière demande</div>
                <h5 class="demand-title mb-1">${last.titre || siteLabel || "Sans titre"}</h5>
                <div class="demand-meta d-flex flex-wrap gap-3">
                  <span><i class="bi bi-calendar-event me-1"></i>${new Date(last.created_at).toLocaleDateString('fr-FR')}</span>
                  ${siteLabel ? `<span><i class="bi bi-geo-alt me-1"></i>${siteLabel}</span>` : ""}
                </div>
              </div>
              <div class="d-flex gap-2 flex-wrap">
                <button class="btn btn-action-ghost btn-sm" data-modal="viewDemandeModal" data-id="${last.id}">
                  <i class="bi bi-eye me-1"></i>Suivre
                </button>
                <button class="btn btn-action-ghost btn-sm" data-modal="messagesModal" data-id="${last.id}">
                  <i class="bi bi-chat-dots me-1"></i>Messages
                </button>
                <button class="btn btn-action-ghost btn-sm" data-modal="filesDemandeModal" data-id="${last.id}">
                  <i class="bi bi-paperclip me-1"></i>Fichiers
                </button>
              </div>
            </div>
          </div>
        `;
      }

      async function loadDemands() {
        const el = document.getElementById("demandesList");
        setLoading(el, "Chargement des demandes...");

        try {
          const demands = await api("/api/demandes_client/mine");
          updateTravauxCard(demands);

          if (!demands.length) {
            el.innerHTML = `
              <div class="empty-state">
                <i class="bi bi-clipboard-check"></i>
                <p class="mb-0">Aucune demande pour le moment</p>
              </div>
            `;
            return;
          }

          el.innerHTML = demands.map(d => {
            const editButton = !d.ticket_id 
              ? `<button class="btn btn-action-ghost btn-sm" data-modal="editDemandeModal" data-id="${d.id}">
                  <i class="bi bi-pencil me-1"></i>Modifier
                </button>`
              : `<button class="btn btn-action-ghost btn-sm" disabled title="Convertie en ticket">
                  <i class="bi bi-lock me-1"></i>Verrouillée
                </button>`;
            const siteLabel = d.nom_site || d.site_nom;
            const linkedTravaux = Array.isArray(d.travaux_associes) ? d.travaux_associes : [];
            const travauxHtml = linkedTravaux.length
              ? linkedTravaux.map(t => {
                  const lbl = t.travaux_titre || (t.travaux_id ? `Travaux #${t.travaux_id}` : 'Travaux');
                  const etat = t.travaux_etat || '—';
                  const priorite = t.travaux_priorite || '—';
                  return `
                    <div class="small border rounded p-2 mb-1 bg-light">
                      <div class="fw-semibold"><i class="bi bi-hammer me-1"></i>${lbl}</div>
                      <div class="text-muted">Statut: ${etat} • Priorité: ${priorite}</div>
                    </div>
                  `;
                }).join('')
              : `<div class="small text-muted border rounded p-2 bg-light">Aucun travaux lié à cette demande.</div>`;

            return `
            <div class="demand-card animate-in">
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div class="flex-grow-1">
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="demand-chip"><i class="bi bi-hash"></i>Demande #${d.id}</span>
                    <span class="status-badge ${getStatusClass(d.status)}">${d.status || "En cours"}</span>
                  </div>
                  <h5 class="demand-title"> ${d.titre || siteLabel || "Sans titre"} </h5>
                  <p class="text-muted mb-2">${d.description || "Pas de description"}</p>
                  <div class="d-flex flex-wrap demand-meta">
                    <span><i class="bi bi-calendar-event me-1"></i>Créée le ${new Date(d.created_at).toLocaleDateString('fr-FR')}</span>
                    ${siteLabel ? `<span><i class="bi bi-geo-alt me-1"></i>${siteLabel}</span>` : ''}
                  </div>
                  <div class="mt-2">
                    <div class="small fw-semibold mb-1"><i class="bi bi-link-45deg me-1"></i>Travaux liés (${linkedTravaux.length})</div>
                    ${travauxHtml}
                  </div>
                </div>
              </div>
              <div class="d-flex flex-wrap gap-2 justify-content-end mt-3">
                <button class="btn btn-action-ghost btn-sm" data-modal="viewDemandeModal" data-id="${d.id}">
                  <i class="bi bi-eye me-1"></i>Suivre
                </button>
                ${editButton}
                <button class="btn btn-action-ghost btn-sm" data-modal="filesDemandeModal" data-id="${d.id}">
                  <i class="bi bi-paperclip me-1"></i>Fichiers
                </button>
                <button class="btn btn-action-ghost btn-sm" data-modal="messagesModal" data-id="${d.id}">
                  <i class="bi bi-chat-dots me-1"></i>Messages / Suivi
                </button>
              </div>
            </div>`;
          }).join("");
        } catch (e) {
          el.innerHTML = `
            <div class="alert alert-danger">
              <i class="bi bi-exclamation-triangle me-2"></i>
              Erreur de chargement des demandes
            </div>
          `;
          console.error("demands error:", e);
        }
      }

      async function loadHistory() {
        const el = document.getElementById("historiqueInterventions");
        setLoading(el, "Chargement de l'historique...");
        let pendingCount = 0;

        try {
          const sites = await api("/api/client/sites");
          let tickets = [];

          for (const s of sites) {
            try {
              const r = await api(`/api/client/sites/${s.id}/relations`);
              if (r.tickets) {
                tickets.push(...r.tickets.map(t => ({ ...t, site_nom: s.nom_site })));
              }
            } catch {}
          }

          // Enrichir avec satisfaction si absente
          async function enrichSatisfaction(arr) {
            const finished = arr.filter(t => (t.etat || "").toLowerCase() === "termine");
            await Promise.all(finished.map(async t => {
              if (t.satisfaction_note != null || t.note_satisfaction != null || (t.satisfaction && t.satisfaction.note != null)) return;
              try {
                const rel = await api(`/api/tickets/${t.id}/relations`);
                const sat = rel.satisfaction || rel.ticket_satisfaction || rel.satisfaction_ticket || {};
                if (sat.note != null) t.satisfaction_note = sat.note;
                if (sat.rating != null) t.satisfaction_note = sat.rating;
                if (sat.commentaire != null) t.satisfaction_comment = sat.commentaire;
                if (sat.comment != null) t.satisfaction_comment = sat.comment;
                if (sat.envoieok != null) t.envoieok = sat.envoieok;
                else if (sat.envoye != null) t.envoieok = sat.envoye;
                else if (sat.envoie_ok != null) t.envoieok = sat.envoie_ok;
              } catch (e) {
                console.warn(`Impossible de charger la satisfaction du ticket ${t.id}`, e);
              }
            }));
          }

          await enrichSatisfaction(tickets);

          if (!tickets.length) {
            el.innerHTML = `
              <div class="empty-state">
                <i class="bi bi-clock-history"></i>
                <p class="mb-0">Aucun historique disponible</p>
              </div>
            `;
            return;
          }

          tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          const finishedTickets = tickets.filter(t => (t.etat || "").toLowerCase() === "termine");

          const hasFeedback = (t) => {
            const numericNote = Number(
              t.satisfaction_note ??
              t.note_satisfaction ??
              t.rating ??
              (t.satisfaction && (t.satisfaction.note ?? t.satisfaction.rating))
            );
            const validNote = Number.isFinite(numericNote) ? Math.max(1, Math.min(5, Math.round(numericNote))) : null;
            const savedComment = (
              t.satisfaction_comment ??
              t.commentaire_satisfaction ??
              t.comment ??
              (t.satisfaction && (t.satisfaction.commentaire ?? t.satisfaction.comment))
            );
            return (t.envoieok === true) || (validNote !== null) || !!savedComment;
          };

          pendingCount = finishedTickets.filter(t => !hasFeedback(t)).length;
          notifBadge.textContent = pendingCount;
          notifBadge.style.display = pendingCount > 0 ? "inline-block" : "none";

          el.innerHTML = tickets.map(t => {
            const isTermine = (t.etat || "").toLowerCase() === "termine";
            const savedNote = (
              t.satisfaction_note ??
              t.note_satisfaction ??
              t.rating ??
              (t.satisfaction && (t.satisfaction.note ?? t.satisfaction.rating))
            );
            const savedComment = (
              t.satisfaction_comment ??
              t.commentaire_satisfaction ??
              t.comment ??
              (t.satisfaction && (t.satisfaction.commentaire ?? t.satisfaction.comment))
            ) || "";
            const numericNote = Number(savedNote);
            const validNote = Number.isFinite(numericNote) ? Math.max(1, Math.min(5, Math.round(numericNote))) : null;
            const feedbackSent = (t.envoieok === true) || (validNote !== null) || !!savedComment;
            let feedbackSection = '';
            if (isTermine) {
              if (feedbackSent) {
                const stars = validNote ? "★★★★★".slice(0, validNote) : '';
                const empty = validNote ? "☆☆☆☆☆".slice(0, 5 - validNote) : '☆☆☆☆☆';
                feedbackSection = `
                  <div class="feedback-section feedback-block" data-ticket="${t.id}">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <strong><i class="bi bi-star-fill text-warning me-2"></i>Votre satisfaction</strong>
                      <span class="badge bg-success">Enregistrée</span>
                    </div>
                    <div class="d-flex align-items-center gap-2 mb-2">
                      <span class="text-warning" style="font-size:1.2rem;">${stars}${empty}</span>
                      <span class="small text-muted">${validNote !== null ? validNote : '—'}/5</span>
                    </div>
                    <div class="text-muted small mb-0">${savedComment ? savedComment.replace(/\n/g,'<br>') : 'Aucun commentaire.'}</div>
                  </div>
                `;
              } else {
                feedbackSection = `
                <div class="feedback-section" data-ticket="${t.id}">
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <strong><i class="bi bi-star me-2"></i>Donnez votre avis</strong>
                    <span class="badge bg-info">Visible par le support</span>
                  </div>
                  <div class="row g-3">
                    <div class="col-md-4">
                      <label class="form-label small fw-bold">Note</label>
                      <select class="form-select feedback-note" data-ticket="${t.id}">
                        <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
                        <option value="4">⭐⭐⭐⭐ Très bien</option>
                        <option value="3">⭐⭐⭐ Bien</option>
                        <option value="2">⭐⭐ Moyen</option>
                        <option value="1">⭐ Mauvais</option>
                      </select>
                    </div>
                    <div class="col-md-8">
                      <label class="form-label small fw-bold">Commentaire</label>
                      <textarea class="form-control feedback-comment" data-ticket="${t.id}" rows="2" placeholder="Partagez votre expérience..."></textarea>
                    </div>
                  </div>

                  <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-sm btn-outline-secondary clear-feedback" data-ticket="${t.id}">
                      <i class="bi bi-x-circle me-1"></i>Effacer
                    </button>
                    <button class="btn btn-sm btn-gradient send-feedback" data-ticket="${t.id}">
                      <i class="bi bi-send me-1"></i>Envoyer
                    </button>
                  </div>
                </div>
              `;
              }
            }

            return `
              <div class="item-card">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <div class="flex-grow-1">
                    <h5 class="fw-bold mb-1">Ticket #${t.id} — ${t.titre || "Sans titre"}</h5>
                    <p class="text-muted small mb-1">
                      <i class="bi bi-building me-1"></i>Site: ${t.site_nom || "N/A"}
                    </p>
                    <small class="text-muted">
                      <i class="bi bi-calendar me-1"></i>
                      Créé le ${new Date(t.created_at).toLocaleDateString('fr-FR')}
                    </small>
                  </div>
                  <span class="status-badge ${isTermine ? 'status-traite' : 'status-en-cours'}">${t.etat || "En cours"}</span>
                </div>
                ${feedbackSection}
              </div>
            `;
          }).join("");

        } catch (e) {
          el.innerHTML = `
            <div class="alert alert-danger">
              <i class="bi bi-exclamation-triangle me-2"></i>
              Erreur de chargement de l'historique
            </div>
          `;
          console.error("history error:", e);
        }
      }

      // Feedback management
      document.body.addEventListener("click", async (e) => {
        const sendBtn = e.target.closest(".send-feedback");
        const clearBtn = e.target.closest(".clear-feedback");

        if (!sendBtn && !clearBtn) return;
        const ticketId = sendBtn?.dataset.ticket || clearBtn.dataset.ticket;
        const noteEl = document.querySelector(`.feedback-note[data-ticket="${ticketId}"]`);
        const commentEl = document.querySelector(`.feedback-comment[data-ticket="${ticketId}"]`);
        if (!noteEl || !commentEl) return;

        if (clearBtn) {
          noteEl.value = "5";
          commentEl.value = "";
          return;
        }

        const note = noteEl.value;
        const commentaire = commentEl.value.trim();

        try {
          sendBtn.disabled = true;
          sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Envoi...';

          await api(`/api/tickets/${ticketId}/satisfaction`, {
            method: "POST",
            body: JSON.stringify({ note: Number(note), commentaire })
          });

          const block = sendBtn.closest(".feedback-section");
          block.innerHTML = `
            <div class="text-center py-4">
              <i class="bi bi-check-circle-fill text-success" style="font-size: 3rem;"></i>
              <h5 class="fw-bold mt-3 mb-2">Merci pour votre retour !</h5>
              <div class="star-rating mb-2">${"★".repeat(Number(note))}${"☆".repeat(5 - Number(note))}</div>
              <p class="text-muted">${commentaire || "Aucun commentaire"}</p>
            </div>
          `;

        } catch (err) {
          alert("❌ Erreur lors de l'enregistrement de votre avis.");
          console.error("feedback error:", err);
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<i class="bi bi-send me-1"></i>Envoyer';
        }
      });

      /* ------------ Gestion modales (logique oldclient) ------------ */
      const frameMap = {
        viewSiteModal: "viewSiteFrame",
        editSiteModal: "editSiteFrame",
        createDemandeModal: "createDemandeFrame",
        viewDemandeModal: "viewDemandeFrame",
        editDemandeModal: "editDemandeFrame",
        filesDemandeModal: "filesDemandeFrame",
        siteFilesModal: "siteFilesFrame",
        messagesModal: "messagesFrame"
      };

      const modalUrlMap = {
        viewSiteModal: (id) => `/client-site-view.html?id=${id}`,
        editSiteModal: (id) => `/client-site-edit.html?id=${id}`,
        createDemandeModal: () => `/client-new-demand.html`,
        viewDemandeModal: (id) => `/client-demand-view.html?id=${id}`,
        editDemandeModal: (id) => `/client-demand-edit.html?id=${id}`,
        filesDemandeModal: (id) => `/client-demand-files.html?id=${id}`,
        siteFilesModal: (id) => `/client-site-files.html?site_id=${id}`,
        messagesModal: (id) => {
          const qs = new URLSearchParams();
          qs.set("conversation", `demande-${id || ""}`);
          qs.set("embed", "1");
          qs.set("modal", "1");
          return `/messagerie.html?${qs.toString()}`;
        }
      };

      document.body.addEventListener("click", e => {
        const btn = e.target.closest("[data-modal]");
        if (!btn) {
          const msgBtn = e.target.closest(".btn-message");
          if (msgBtn) {
            const did = msgBtn.getAttribute("data-demande-id");
            if (did) {
              const qs = new URLSearchParams();
              qs.set("conversation", `demande-${did}`);
              qs.set("embed", "1");
              window.location.href = `/messagerie.html?${qs.toString()}`;
            }
          }
          return;
        }

        const modalId = btn.dataset.modal;
        const itemId = btn.dataset.id;
        const conversation = btn.dataset.conversation;
        const urlBuilder = modalUrlMap[modalId];

        if (!urlBuilder) {
          console.error("No URL builder found for modal:", modalId);
          return;
        }

        const modalEl = document.getElementById(modalId);
        const frame = document.getElementById(frameMap[modalId]);

        if (modalEl && frame) {
          const url = urlBuilder(itemId || '');
          if (frame.getAttribute('src') !== url) {
            frame.src = url;
          }
          new bootstrap.Modal(modalEl).show();
        } else {
          console.error("Modal or frame not found for:", modalId);
        }
      });

      // Initial load
      loadProfile();
      loadSites();
      loadDemands();
      loadHistory();

    });
