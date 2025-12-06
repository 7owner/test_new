document.addEventListener("DOMContentLoaded", () => {
      const token = localStorage.getItem("token");
      if (!token) return location.href = "/login.html";

      const api = (url, opts = {}) =>
        fetch(url, {
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
          },
          credentials: 'same-origin',
          ...opts
        }).then(async r => {
          const body = r.headers.get("content-type")?.includes("json") ? await r.json() : null;
          if (r.status === 401 || r.status === 403) {
            localStorage.removeItem("token");
            location.href = "/login.html";
            throw new Error("Unauthorized");
          }
          if (!r.ok) throw new Error(body?.error || r.status);
          return body;
        });

      document.getElementById("client-logout-btn").addEventListener("click", () => {
        if (confirm("Êtes-vous sûr de vouloir vous déconnecter ?")) {
          localStorage.removeItem("token");
          location.href = "/login.html";
        }
      });

      const notifBtn = document.getElementById("notif-btn");
      const notifBadge = document.getElementById("notif-badge");

      function getStatusClass(status) {
        const s = (status || "En cours de traitement").toLowerCase();
        return {
          "en cours de traitement": "status-en-cours",
          "traité": "status-traite",
          "rejeté": "status-rejete",
          "annulé": "status-annule"
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
                <button class="btn btn-sm btn-primary btn-action" data-modal="viewSiteModal" data-id="${site.id}">
                  <i class="bi bi-eye me-1"></i>Voir
                </button>
                <button class="btn btn-sm btn-warning btn-action" data-modal="editSiteModal" data-id="${site.id}">
                  <i class="bi bi-pencil me-1"></i>Modifier
                </button>
                <a class="btn btn-sm btn-secondary btn-action" href="/client-site-files.html?site_id=${site.id}">
                  <i class="bi bi-paperclip me-1"></i>Fichiers
                </a>
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

      async function loadDemands() {
        const el = document.getElementById("demandesList");
        setLoading(el, "Chargement des demandes...");

        try {
          const demands = await api("/api/demandes_client/mine");

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
              ? `<button class="btn btn-sm btn-warning btn-action" data-modal="editDemandeModal" data-id="${d.id}">
                  <i class="bi bi-pencil me-1"></i>Modifier
                </button>`
              : `<button class="btn btn-sm btn-warning btn-action" disabled title="Convertie en ticket">
                  <i class="bi bi-lock me-1"></i>Verrouillée
                </button>`;

            return `
            <div class="item-card">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div class="flex-grow-1">
                  <h5 class="fw-bold mb-1">Demande #${d.id} — ${d.titre || d.nom_site || "Sans titre"}</h5>
                  <p class="text-muted small mb-2">${d.description || "Pas de description"}</p>
                  <small class="text-muted">
                    <i class="bi bi-calendar me-1"></i>
                    Créée le ${new Date(d.created_at).toLocaleDateString('fr-FR')}
                  </small>
                </div>
                <span class="status-badge ${getStatusClass(d.status)}">${d.status || "En cours"}</span>
              </div>
              <div class="action-buttons">
                <button class="btn btn-sm btn-primary btn-action" data-modal="viewDemandeModal" data-id="${d.id}">
                  <i class="bi bi-eye me-1"></i>Suivre
                </button>
                ${editButton}
                <button class="btn btn-sm btn-secondary btn-action" data-modal="filesDemandeModal" data-id="${d.id}">
                  <i class="bi bi-paperclip me-1"></i>Fichiers
                </button>
                <button class="btn btn-sm btn-outline-primary btn-action" data-modal="messagesModal" data-id="${d.id}">
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
            } catch {} // Ignore errors for individual site relations
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
                if (sat.commentaire != null) t.satisfaction_comment = sat.commentaire;
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
          pendingCount = finishedTickets.length;

          if (pendingCount > 0) {
            notifBadge.textContent = pendingCount;
            notifBadge.style.display = "inline-block";
          }

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
            let feedbackSection = '';
            if (isTermine) {
              if (savedNote != null) {
                const stars = "★★★★★".slice(0, Math.min(5, Math.max(1, Number(savedNote))));
                const empty = "☆☆☆☆☆".slice(0, 5 - stars.length);
                feedbackSection = `
                  <div class="feedback-section feedback-block" data-ticket="${t.id}">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <strong><i class="bi bi-star-fill text-warning me-2"></i>Votre satisfaction</strong>
                      <span class="badge bg-success">Enregistrée</span>
                    </div>
                    <div class="d-flex align-items-center gap-2 mb-2">
                      <span class="text-warning" style="font-size:1.2rem;">${stars}${empty}</span>
                      <span class="small text-muted">${Number(savedNote)}/5</span>
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
        messagesModal: "messagesFrame"
      };

      const modalUrlMap = {
        viewSiteModal: (id) => `/client-site-view.html?id=${id}`,
        editSiteModal: (id) => `/client-site-edit.html?id=${id}`,
        createDemandeModal: () => `/client-new-demand.html`,
        viewDemandeModal: (id) => `/client-demand-view.html?id=${id}`,
        editDemandeModal: (id) => `/client-demand-edit.html?id=${id}`,
        filesDemandeModal: (id) => `/client-demand-files.html?id=${id}`,
        messagesModal: (id) => `/client-demand-view.html?id=${encodeURIComponent(id || '')}&embed=1&modal=1`
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