// Guard against double-loading and unregister any leftover Service Workers on this origin
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    } catch (_) {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.__APP_INIT__) return; // prevent duplicate initialization if script is included twice
    window.__APP_INIT__ = true;
    const loginForm = document.getElementById('loginForm');
    function badgeClassForMaintenance(etat) {
      const e = String(etat||"").toLowerCase();
      if (e === 'bloque' || e.includes('bloq')) return 'badge badge-danger';
      if (e === 'en_cours' || e.includes('cours')) return 'badge badge-info';
      if (e === 'termine' || e.includes('term')) return 'badge badge-success';
      if (e === 'pas_commence' || e.includes('pas') || e.includes('non')) return 'badge badge-warning';
      return 'badge badge-info';
    }
    function showToast(message, type) {
      const root = document.getElementById('toast-root');
      if (!root) return; const div = document.createElement('div');
      div.className = 'toast' + (type ? ' ' + type : '');
      div.textContent = message; root.appendChild(div);
      setTimeout(() => { div.style.opacity = '0'; setTimeout(()=> div.remove(), 300); }, 2800);
    }
    const registerForm = document.getElementById('registerForm');
    const errorMessageDiv = document.getElementById('error-message');
    function makeCardsClickable(container) {
      try {
        if (!container) return;
        container.addEventListener('click', (ev) => {
          if (ev.defaultPrevented) return;
          if (ev.target.closest('button, .btn')) return; // ignore button clicks
          const card = ev.target.closest('.card');
          if (!card || !container.contains(card)) return;
          const link = card.querySelector('a[href]');
          if (link && link.getAttribute('href')) {
            ev.preventDefault();
            window.location.href = link.getAttribute('href');
          }
        });
      } catch(_) {}
    }

    // Function to display error messages
        function badgeClassFor(type, statut) {
      if (!statut) return "badge badge-info";
      const s = String(statut).toLowerCase();
      const map = {
        achat: {
          brouillon: "badge badge-warning",
          valide: "badge badge-info",
          commande: "badge badge-info",
          recu_partiel: "badge badge-success",
          recu: "badge badge-success",
          annule: "badge badge-danger"
        },
        facture: {
          brouillon: "badge badge-warning",
          emise: "badge badge-info",
          envoyee: "badge badge-info",
          payee_partielle: "badge badge-warning",
          payee: "badge badge-success",
          annulee: "badge badge-danger"
        }
      };
      const group = map[type] || {};
      return group[s] || "badge badge-info";
    }
const showError = (message) => { if (errorMessageDiv) { errorMessageDiv.textContent = message; errorMessageDiv.classList.remove("hidden"); } showToast(message, "error"); };

    // Function to handle login
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('inputEmail').value;
            const password = document.getElementById('inputPassword').value;

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                const data = await response.json();

                if (!response.ok) {
                    showError(data.error || 'La connexion a �chou�'); try{ showToast(data.error || 'La connexion a �chou�', "error"); }catch(_){};
                    return;
                }

                if (data.token) {
                    localStorage.setItem('token', data.token);
                    window.location.href = '/dashboard.html';
                } else {
                    showError('La connexion a �chou� : jeton manquant'); try{ showToast('La connexion a �chou� : jeton manquant', "error"); }catch(_){};
                }
            } catch (error) {
                console.error('Erreur de connexion:', error);
                showError('Une erreur inattendue est survenue.'); try{ showToast('Une erreur inattendue est survenue.', "error"); }catch(_){};
            }
        });
    }

    // Function to handle registration
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('inputEmail').value;
            const password = document.getElementById('inputPassword').value;

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                const data = await response.json();

                if (!response.ok) {
                    showError(data.error || 'Inscription �chou�e'); try{ showToast(data.error || 'Inscription �chou�e', "error"); }catch(_){};
                    return;
                }

                // Automatically log in the user after successful registration
                const loginResponse = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                const loginData = await loginResponse.json();
                if (loginData.token) {
                    localStorage.setItem('token', loginData.token);
                    window.location.href = '/'; // Redirect to homepage
                } else {
                    window.location.href = '/login.html'; // Redirect to login page on failure
                }
            } catch (error) {
                console.error("Erreur lors de l'inscription:", error);
                showError('Une erreur inattendue est survenue.'); try{ showToast('Une erreur inattendue est survenue.', "error"); }catch(_){};
            }
        });
    }

    // Function to load dashboard data
    const loadDashboard = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        try {
            const response = await fetch('/api/dashboard', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();

            document.getElementById('activeMaintenances').textContent = data.activeMaintenances;
            document.getElementById('ongoingInterventions').textContent = data.ongoingInterventions;
            document.getElementById('activeAgents').textContent = data.activeAgents;
            document.getElementById('sitesUnderContract').textContent = data.sitesUnderContract;
            try { const el = document.getElementById('achatsCount'); if (el) el.textContent = (data.achatsCount != null ? data.achatsCount : '-'); } catch(_){}
            try { const el = document.getElementById('facturesCount'); if (el) el.textContent = (data.facturesCount != null ? data.facturesCount : '-'); } catch(_){}
            try { const el = document.getElementById('reglementsCount'); if (el) el.textContent = (data.reglementsCount != null ? data.reglementsCount : '-'); } catch(_){}
            try { const fc = document.getElementById('financeCounters'); if (fc) makeCardsClickable(fc); } catch(_){}

            const urgentMaintenancesDiv = document.getElementById('urgentMaintenances');
            urgentMaintenancesDiv.innerHTML = '';
            if (data.urgentMaintenances.length > 0) {
                data.urgentMaintenances.forEach(m => {
                    const maintenanceEl = document.createElement('div');
                    maintenanceEl.className = 'flex justify-between items-center p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400';
                    maintenanceEl.innerHTML = `<div><h4 class="text-gray-800 font-semibold">${m.titre}</h4></div><span class="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">Bloqué</span>`;
                    urgentMaintenancesDiv.appendChild(maintenanceEl);
                });
            } else {
                urgentMaintenancesDiv.innerHTML = '<p class="text-gray-500 text-sm">Aucune maintenance urgente.</p>';
            }

            // Compact and badge-ify urgent maintenances
            try {
                const umc = urgentMaintenancesDiv ? Array.from(urgentMaintenancesDiv.children) : [];
                umc.forEach(el => {
                    let title = '';
                    try { title = (el.querySelector('h4')?.textContent || '').trim(); } catch(_) {}
                    if (!title) { title = (el.textContent || '').trim(); }
                    el.className = 'card card-body';
                    el.innerHTML = `<div class="card-row"><div class="min-w-0"><div class="font-semibold truncate">${title}</div></div><div class="shrink-0"><span class="badge badge-danger">Bloqu�</span></div></div>`;
                });
            } catch(_) {}

            // Ensure urgent maintenances are rendered as clickable compact cards with proper badges
            try {
                if (urgentMaintenancesDiv && Array.isArray(data.urgentMaintenances)) {
                    urgentMaintenancesDiv.innerHTML = '';
                    data.urgentMaintenances.forEach(m => {
                        const el = document.createElement('div');
                        el.className = 'card card-body';
                        const badge = `<span class="${badgeClassForMaintenance(m.etat)}">${m.etat||''}</span>`;
                        const title = (m.titre||('Maintenance #'+m.id));
                        el.innerHTML = `<div class="card-row"><div class="min-w-0"><div class="font-semibold truncate"><a class="text-indigo-600 hover:underline" href="/maintenance.html#${m.id}">${title}</a></div></div><div class="shrink-0">${badge}</div></div>`;
                        urgentMaintenancesDiv.appendChild(el);
                    });
                    makeCardsClickable(urgentMaintenancesDiv);
                }
            } catch(_) {}

            const ctx = document.getElementById('monthlyMaintenanceChart');
            new Chart(ctx, {
                type: 'bar',
                data: data.chartData,
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
            // Load recent Achats / Factures / R�glements for dashboard
            try {
                const token2 = localStorage.getItem('token');
                const [ra, rf, rg] = await Promise.all([
                    fetch('/api/achats', { headers: { 'Authorization': `Bearer ${token2}` } }),
                    fetch('/api/factures', { headers: { 'Authorization': `Bearer ${token2}` } }),
                    fetch('/api/reglements', { headers: { 'Authorization': `Bearer ${token2}` } }),
                ]);
                const recentAchatsDiv = document.getElementById('recentAchats');
                if (recentAchatsDiv && ra.ok) {
                    const achats = (await ra.json()).slice(0,5);
                    recentAchatsDiv.innerHTML = achats.map(a=>
                        `<li class="flex items-center justify-between"><span>${a.reference||'Sans ref.'} � ${a.objet||''}</span><span class="text-xs text-slate-500">${a.montant_ttc!=null? Number(a.montant_ttc).toFixed(2):'-'}</span></li>`
                    ).join('') || '<li class="text-slate-500">Aucun achat</li>';
                }
                const recentFacturesDiv = document.getElementById('recentFactures');
                if (recentFacturesDiv && rf.ok) {
                    const factures = (await rf.json()).slice(0,5);
                    recentFacturesDiv.innerHTML = factures.map(f=>
                        `<li class="flex items-center justify-between"><span>${f.reference||'Sans ref.'}</span><span class="text-xs text-slate-500">${f.montant_ttc!=null? Number(f.montant_ttc).toFixed(2):'-'}</span></li>`
                    ).join('') || '<li class="text-slate-500">Aucune facture</li>';
                }
                const recentRegDiv = document.getElementById('recentReglements');
                if (recentRegDiv && rg.ok) {
                    const regs = (await rg.json()).slice(0,5);
                    recentRegDiv.innerHTML = regs.map(g=>
                        `<li class="flex items-center justify-between"><span>#${g.id} � ${g.mode||''}</span><span class="text-xs text-slate-500">${g.montant!=null? Number(g.montant).toFixed(2):'-'}</span></li>`
                    ).join('') || '<li class="text-slate-500">Aucun r�glement</li>';
                }
            } catch(_) {}

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    };

    // Check if we are on the dashboard page and load data
    if (window.location.pathname.endsWith('dashboard.html')) {
        loadDashboard();
    }

    // Site details page loader
    const loadSiteDetail = async () => {
        const token = localStorage.getItem('token');
        if (!token) { window.location.href = '/login.html'; return; }
        const raw = (location.hash || '').replace('#','').trim();
        const siteId = raw || null;
        if (!siteId) {
            const t = document.getElementById('siteTitle');
            if (t) t.textContent = 'Site introuvable';
            return;
        }
        try {
            const [siteResp, relResp] = await Promise.all([
                fetch(`/api/sites/${siteId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`/api/sites/${siteId}/relations`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            if (!siteResp.ok) { window.location.href = '/sites.html'; return; }
            const site = await siteResp.json();
            const rel = relResp.ok ? await relResp.json() : { affaires: [], does: [], maintenances: [] };

            const titleEl = document.getElementById('siteTitle');
            if (titleEl) titleEl.textContent = site.nom_site || ('Site #' + site.id);
            const metaEl = document.getElementById('siteMeta');
            if (metaEl) metaEl.textContent = site.adresse_id ? ('Adresse #' + site.adresse_id) : 'Adresse non définie';

            const cAff = document.getElementById('countAffaires'); if (cAff) cAff.textContent = (rel.affaires||[]).length || '0';
            const cDoe = document.getElementById('countDoes'); if (cDoe) cDoe.textContent = (rel.does||[]).length || '0';
            const cM = document.getElementById('countMaintenances'); if (cM) cM.textContent = (rel.maintenances||[]).length || '0';

            // Adresse detail
            const addr = rel.adresse || null;
            const addrDiv = document.getElementById('siteAddress');
            if (addrDiv) {
                if (addr) {
                    const parts = [addr.libelle, addr.ligne1, addr.ligne2].filter(Boolean).join('<br>');
                    const city = [addr.code_postal, addr.ville].filter(Boolean).join(' ');
                    const tail = [city, addr.region, addr.pays].filter(Boolean).join(' · ');
                    addrDiv.innerHTML = `${parts || ''}${parts ? '<br>' : ''}<span class="text-slate-600">${tail || ''}</span>` || '<span class="text-slate-500">Aucune</span>';
                } else {
                    addrDiv.innerHTML = '<span class="text-slate-500">Aucune</span>';
                }
            }

            const bc = document.getElementById('breadcrumb');
            try { if (bc) bc.innerHTML = `<a class=\"hover:underline\" href=\"/dashboard.html\">Dashboard</a> <span class=\"mx-1\">/</span> <a class=\"hover:underline\" href=\"/sites.html\">Sites</a> <span class=\"mx-1\">/</span> <span>${site.nom_site || ('Site #'+site.id)}</span>`; } catch(_) {}
            const affUl = document.getElementById('siteAffairesList');
            if (affUl) {
                affUl.innerHTML = (rel.affaires||[]).map(a => `
                  <li class="flex items-center justify-between">
                    <a class="text-indigo-600 hover:underline" href="/affaires.html#${a.id}">${a.nom_affaire}</a>
                    <span class="text-xs text-slate-500">#${a.id}</span>
                  </li>`).join('') || '<li class="text-slate-500">Aucune</li>';
            }
            const doeUl = document.getElementById('siteDoesList');
            if (doeUl) {
                doeUl.innerHTML = (rel.does||[]).map(d => `
                  <li class="flex items-center justify-between">
                    <a class="text-indigo-600 hover:underline" href="/does.html#${d.id}">${d.titre}</a>
                    <span class="text-xs text-slate-500">#${d.id}</span>
                  </li>`).join('') || '<li class="text-slate-500">Aucun</li>';
            }
            const mUl = document.getElementById('siteMaintenancesList');
            if (mUl) {
                mUl.innerHTML = (rel.maintenances||[]).map(m => `
                  <li class="flex items-center justify-between">
                    <a class="text-slate-700" href="/maintenance.html#${m.id}">${m.titre || ('Maintenance #' + m.id)}</a>
                    <span class="text-xs text-slate-500">${m.etat || ''}</span>
                  </li>`).join('') || '<li class="text-slate-500">Aucune</li>';
            }

            // Documents
            const docsUl = document.getElementById('siteDocsList');
            if (docsUl) {
                docsUl.innerHTML = (rel.documents||[]).map(d => `
                  <li class="flex items-center justify-between">
                    <a class="text-indigo-600 hover:underline" target="_blank" href="/api/documents/${d.id}/view">${d.nom_fichier}</a>
                    <span class="text-xs text-slate-500">${(d.type_mime||'').split('/')[1]||''}</span>
                  </li>`).join('') || '<li class="text-slate-500">Aucun</li>';
            }

            // Rendezvous
            const rdvUl = document.getElementById('siteRendezvousList');
            if (rdvUl) {
                rdvUl.innerHTML = (rel.rendezvous||[]).map(r => {
                  const when = r.date_rdv ? (new Date(r.date_rdv).toLocaleDateString() + (r.heure_rdv ? ' ' + r.heure_rdv : '')) : '';
                  return `
                    <li class="flex items-center justify-between">
                      <a class="text-slate-700" href="/rendezvous.html#${r.id}">${r.titre || ('Rendez-vous #' + r.id)}</a>
                      <span class="text-xs text-slate-500">${when}</span>
                    </li>`;
                }).join('') || '<li class="text-slate-500">Aucun</li>';
            }

            // Images
            const imgsDiv = document.getElementById('siteImages');
            if (imgsDiv) {
                imgsDiv.innerHTML = (rel.images||[]).map(i => `
                  <img class="w-28 h-28 object-cover rounded border" src="/api/images/${i.id}/view" alt="${i.nom_fichier}">`
                ).join('');
                if (!imgsDiv.innerHTML) imgsDiv.innerHTML = '<span class="text-slate-500">Aucune</span>';
            }
        } catch (e) {
            console.error('Error loading site detail', e);
        }
    };

    if (window.location.pathname.endsWith('site.html')) {
        loadSiteDetail();
        window.addEventListener('hashchange', loadSiteDetail);
    }

    // Intervention details page loader
    const loadInterventionDetail = async () => {
        const token = localStorage.getItem('token');
        if (!token) { window.location.href = '/login.html'; return; }
        const raw = (location.hash || '').replace('#','').trim();
        const id = raw || null;
        if (!id) {
            const t = document.getElementById('interTitle');
            if (t) t.textContent = 'Intervention introuvable';
            return;
        }
        try {
            const resp = await fetch(`/api/interventions/${id}/relations`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) { window.location.href = '/interventions.html'; return; }
            const rel = await resp.json();
            const it = rel.intervention || {};

            // Header/meta
            const titleEl = document.getElementById('interTitle');
            if (titleEl) titleEl.textContent = it.description || ('Intervention #' + it.id);
            const metaEl = document.getElementById('interMeta');
            if (metaEl) metaEl.textContent = (it.date_debut ? ('Début: ' + (new Date(it.date_debut).toLocaleDateString())) : '') + (it.date_fin ? (' · Fin: ' + (new Date(it.date_fin).toLocaleDateString())) : '');

            // Counters
            const docs = rel.documents || []; const imgs = rel.images || []; const rdvs = rel.rendezvous || [];
            const cR = document.getElementById('countRdv'); if (cR) cR.textContent = rdvs.length || '0';
            const cD = document.getElementById('countDocs'); if (cD) cD.textContent = docs.length || '0';
            const cI = document.getElementById('countImgs'); if (cI) cI.textContent = imgs.length || '0';

            // Details block
            const det = document.getElementById('interDetails');
            if (det) {
              const lines = [];
              if (rel.maintenance) lines.push(`<div><span class="text-slate-500">Maintenance:</span> ${rel.maintenance.titre || ('#'+rel.maintenance.id)}</div>`);
              if (rel.doe) lines.push(`<div><span class="text-slate-500">DOE:</span> ${rel.doe.titre || ('#'+rel.doe.id)}</div>`);
              if (rel.affaire) lines.push(`<div><span class="text-slate-500">Affaire:</span> ${rel.affaire.nom_affaire || ('#'+rel.affaire.id)}</div>`);
              if (rel.site) lines.push(`<div><span class="text-slate-500">Site:</span> ${rel.site.nom_site || ('#'+rel.site.id)}</div>`);
              det.innerHTML = lines.join('') || '<span class="text-slate-500">—</span>';
            }

            // Breadcrumb
            const bcInter = document.getElementById('breadcrumb');
            try { if (bcInter) bcInter.innerHTML = `<a class=\"hover:underline\" href=\"/dashboard.html\">Dashboard</a> <span class=\"mx-1\">/</span> <a class=\"hover:underline\" href=\"/interventions.html\">Interventions</a> <span class=\"mx-1\">/</span> <span>${it.description || ('Intervention #'+it.id)}</span>`; } catch(_) {}

            // Relation links
            const relLinks = document.getElementById('relLinks');
            if (relLinks) {
              const bits = [];
              if (rel.maintenance) bits.push(`<a class="text-indigo-600 hover:underline" href="/maintenance.html#${rel.maintenance.id}">Voir la maintenance</a>`);
              if (rel.doe) bits.push(`<a class="text-indigo-600 hover:underline" href="/does.html#${rel.doe.id}">Voir le DOE</a>`);
              if (rel.site) bits.push(`<a class="text-indigo-600 hover:underline" href="/site.html#${rel.site.id}">Voir le site</a>`);
              relLinks.innerHTML = bits.join(' · ');
            }

            // Rendezvous list
            const rdvUl = document.getElementById('interRdvList');
            if (rdvUl) {
              rdvUl.innerHTML = rdvs.map(r => {
                const when = r.date_rdv ? (new Date(r.date_rdv).toLocaleDateString() + (r.heure_rdv ? ' ' + r.heure_rdv : '')) : '';
                return `<li class="flex items-center justify-between"><a class="text-slate-700" href="/rendezvous.html#${r.id}">${r.titre || ('Rendez-vous #'+r.id)}</a><span class="text-xs text-slate-500">${when}</span></li>`;
              }).join('') || '<li class="text-slate-500">Aucun</li>';
            }

            // Documents
            const docsUl = document.getElementById('interDocsList');
            if (docsUl) {
              docsUl.innerHTML = docs.map(d => `<li class="flex items-center justify-between"><a class="text-indigo-600 hover:underline" target="_blank" href="/api/documents/${d.id}/view">${d.nom_fichier}</a><span class="text-xs text-slate-500">${(d.type_mime||'').split('/')[1]||''}</span></li>`).join('') || '<li class="text-slate-500">Aucun</li>';
            }

            // Images
            const imgsDiv = document.getElementById('interImages');
            if (imgsDiv) {
              imgsDiv.innerHTML = imgs.map(i => `<img class="w-28 h-28 object-cover rounded border" src="/api/images/${i.id}/view" alt="${i.nom_fichier}">`).join('');
              if (!imgsDiv.innerHTML) imgsDiv.innerHTML = '<span class="text-slate-500">Aucune</span>';
            }
        } catch (e) {
            console.error('Error loading intervention detail', e);
        }
    };

    if (window.location.pathname.endsWith('intervention.html')) {
        loadInterventionDetail();
        window.addEventListener('hashchange', loadInterventionDetail);
    }

    // Maintenance details page loader
    const loadMaintenanceDetail = async () => {
        const token = localStorage.getItem('token');
        if (!token) { window.location.href = '/login.html'; return; }
        const raw = (location.hash || '').replace('#','').trim();
        const id = raw || null;
        if (!id) {
            const t = document.getElementById('mntTitle');
            if (t) t.textContent = 'Maintenance introuvable';
            return;
        }
        try {
            const resp = await fetch(`/api/maintenances/${id}/relations`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) { window.location.href = '/maintenances.html'; return; }
            const rel = await resp.json();
            const m = rel.maintenance || {};

            // Header/meta
            const titleEl = document.getElementById('mntTitle');
            if (titleEl) titleEl.textContent = m.titre || ('Maintenance #' + m.id);
            const etatEl = document.getElementById('mntEtat');
            if (etatEl) etatEl.innerHTML = `<span class="${badgeClassForMaintenance(m.etat)}">${m.etat||''}</span>`;

            // DOE and Site
            const doeEl = document.getElementById('mntDoe');
            if (doeEl) doeEl.innerHTML = rel.doe ? `<a class="text-indigo-600 hover:underline" href="/does.html#${rel.doe.id}">${rel.doe.titre || ('DOE #'+rel.doe.id)}</a>` : '<span class="text-slate-500">�</span>';
            const siteEl = document.getElementById('mntSite');
            if (siteEl) siteEl.innerHTML = rel.site ? `<a class="text-indigo-600 hover:underline" href="/site.html#${rel.site.id}">${rel.site.nom_site || ('Site #'+rel.site.id)}</a>` : '<span class="text-slate-500">�</span>';

            // Interventions list
            const intUl = document.getElementById('mntInterv');
            if (intUl) {
                const arr = rel.interventions || [];
                intUl.innerHTML = arr.map(it => {
                    const when = it.date_debut ? new Date(it.date_debut).toLocaleDateString() : '';
                    return `<li class="flex items-center justify-between"><a class="text-slate-700" href="/intervention.html#${it.id}">${it.description || ('Intervention #'+it.id)}</a><span class="text-xs text-slate-500">${when}</span></li>`;
                }).join('') || '<li class="text-slate-500">Aucune</li>';
            }

            // Documents
            const docsUl = document.getElementById('mntDocs');
            if (docsUl) {
                const docs = rel.documents || [];
                docsUl.innerHTML = docs.map(d => `<li class="flex items-center justify-between"><a class="text-indigo-600 hover:underline" target="_blank" href="/api/documents/${d.id}/view">${d.nom_fichier}</a><span class="text-xs text-slate-500">${(d.type_mime||'').split('/')[1]||''}</span></li>`).join('') || '<li class="text-slate-500">Aucun</li>';
            }

            // Images
            const imgsDiv = document.getElementById('mntImgs');
            if (imgsDiv) {
                const imgs = rel.images || [];
                imgsDiv.innerHTML = imgs.map(i => `<img class="w-28 h-28 object-cover rounded border" src="/api/images/${i.id}/view" alt="${i.nom_fichier}">`).join('');
                if (!imgsDiv.innerHTML) imgsDiv.innerHTML = '<span class="text-slate-500">Aucune</span>';
            }
        } catch (e) {
            console.error('Error loading maintenance detail', e);
        }
    };
    if (window.location.pathname.endsWith('maintenance.html')) {
        loadMaintenanceDetail();
        window.addEventListener('hashchange', loadMaintenanceDetail);
    }

    // Agent details page loader
    const loadAgentDetail = async () => {
        const token = localStorage.getItem('token');
        if (!token) { window.location.href = '/login.html'; return; }
        const matricule = (location.hash||'').replace('#','').trim();
        if (!matricule) { const t = document.getElementById('agentTitle'); if (t) t.textContent = 'Agent introuvable'; return; }
        try {
            const resp = await fetch(`/api/agents/${encodeURIComponent(matricule)}/relations`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) { window.location.href = '/agents.html'; return; }
            const rel = await resp.json();
            const ag = rel.agent || {};
            const titleEl = document.getElementById('agentTitle'); if (titleEl) titleEl.textContent = `${ag.nom||'Agent'} (${ag.matricule||matricule})`;
            const metaEl = document.getElementById('agentMeta'); if (metaEl) metaEl.textContent = [ag.email, ag.tel, ag.admin? 'Admin' : null, ag.actif===false? 'Inactif': null].filter(Boolean).join(' · ');
            const info = document.getElementById('agentInfo');
            if (info) {
                info.innerHTML = `
                  <div><span class="text-slate-500">Email:</span> ${ag.email||'—'}</div>
                  <div><span class="text-slate-500">Téléphone:</span> ${ag.tel||'—'}</div>
                  <div><span class="text-slate-500">Agence ID:</span> ${ag.agence_id||'—'}</div>
                  <div><span class="text-slate-500">Entrée:</span> ${ag.date_entree||'—'}</div>`;
            }
            // Breadcrumb
            const bcAgent = document.getElementById('breadcrumb');
            try { if (bcAgent) bcAgent.innerHTML = `<a class=\"hover:underline\" href=\"/dashboard.html\">Dashboard</a> <span class=\"mx-1\">/</span> <a class=\"hover:underline\" href=\"/agents.html\">Agents</a> <span class=\"mx-1\">/</span> <span>${ag.nom || 'Agent'} (${ag.matricule||matricule})</span>`; } catch(_) {}

            const passDiv = document.getElementById('agentPassport');
            const hasPass = document.getElementById('hasPassport');
            if (hasPass) hasPass.textContent = rel.passeport ? 'Oui' : 'Non';
            if (passDiv) {
                const p = rel.passeport;
                passDiv.innerHTML = p ? `
                  <ul class="list-disc pl-5 space-y-1">
                    ${p.permis? `<li>Permis: ${p.permis}</li>`:''}
                    ${p.habilitations? `<li>Habilitations: ${p.habilitations}</li>`:''}
                    ${p.certifications? `<li>Certifications: ${p.certifications}</li>`:''}
                    ${p.commentaire? `<li>Note: ${p.commentaire}</li>`:''}
                  </ul>` : '<span class="text-slate-500">Aucun</span>';
            }
            const forms = rel.formations||[];
            const cF = document.getElementById('countFormations'); if (cF) cF.textContent = forms.length || '0';
            const formsUl = document.getElementById('agentFormations');
            if (formsUl) {
                formsUl.innerHTML = forms.map(f => `
                  <li class="flex items-center justify-between">
                    <span>${f.libelle} <span class="text-xs text-slate-500">(${f.type})</span></span>
                    <span class="text-xs text-slate-500">${f.date_obtention? f.date_obtention.split('T')[0] : ''}</span>
                  </li>`).join('') || '<li class="text-slate-500">Aucune</li>';
            }
        } catch (e) { console.error('Error loading agent detail', e); }
    };
    if (window.location.pathname.endsWith('agent.html')) {
        loadAgentDetail();
        window.addEventListener('hashchange', loadAgentDetail);
    }

    // Rendezvous details page loader
    const loadRendezvousDetail = async () => {
        const token = localStorage.getItem('token');
        if (!token) { window.location.href = '/login.html'; return; }
        const id = (location.hash||'').replace('#','').trim();
        if (!id) { const t = document.getElementById('rdvTitle'); if (t) t.textContent = 'Rendez-vous introuvable'; return; }
        try {
            const resp = await fetch(`/api/rendezvous/${id}/relations`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) { window.location.href = '/rendezvous.html'; return; }
            const rel = await resp.json();
            const rdv = rel.rendezvous || {};
            const titleEl = document.getElementById('rdvTitle'); if (titleEl) titleEl.textContent = rdv.titre || ('Rendez-vous #' + rdv.id);
            const when = rdv.date_rdv ? (new Date(rdv.date_rdv).toLocaleDateString() + (rdv.heure_rdv ? ' ' + rdv.heure_rdv : '')) : '';
            const metaEl = document.getElementById('rdvMeta'); if (metaEl) metaEl.textContent = [when, rdv.statut, rdv.sujet].filter(Boolean).join(' · ');
            const det = document.getElementById('rdvDetails');
            if (det) {
                det.innerHTML = `
                  <div><span class="text-slate-500">Intervention:</span> ${rel.intervention ? (rel.intervention.description || ('#'+rel.intervention.id)) : '—'}</div>
                  <div><span class="text-slate-500">Site:</span> ${rel.site ? (rel.site.nom_site || ('#'+rel.site.id)) : '—'}</div>`;
            }
            const links = document.getElementById('rdvLinks');
            if (links) {
                const bits = [];
                if (rel.intervention) bits.push(`<a class="text-indigo-600 hover:underline" href="/intervention.html#${rel.intervention.id}">Voir l'intervention</a>`);
                if (rel.site) bits.push(`<a class="text-indigo-600 hover:underline" href="/site.html#${rel.site.id}">Voir le site</a>`);
                links.innerHTML = bits.join(' · ');
            }
            // Breadcrumb
            const bcRdv = document.getElementById('breadcrumb');
            try { if (bcRdv) bcRdv.innerHTML = `<a class=\"hover:underline\" href=\"/dashboard.html\">Dashboard</a> <span class=\"mx-1\">/</span> <a class=\"hover:underline\" href=\"/rendezvous.html\">Rendez-vous</a> <span class=\"mx-1\">/</span> <span>${rdv.titre || ('Rendez-vous #'+rdv.id)}</span>`; } catch(_) {}

            const docs = rel.documents||[]; const imgs = rel.images||[];
            const cD = document.getElementById('rdvDocsCount'); if (cD) cD.textContent = docs.length || '0';
            const cI = document.getElementById('rdvImgsCount'); if (cI) cI.textContent = imgs.length || '0';
            const docsUl = document.getElementById('rdvDocsList'); if (docsUl) {
                docsUl.innerHTML = docs.map(d => `<li class="flex items-center justify-between"><a class=\"text-indigo-600 hover:underline\" target=\"_blank\" href=\"/api/documents/${d.id}/view\">${d.nom_fichier}</a><span class=\"text-xs text-slate-500\">${(d.type_mime||'').split('/')[1]||''}</span></li>`).join('') || '<li class="text-slate-500">Aucun</li>';
            }
            const imgsDiv = document.getElementById('rdvImages'); if (imgsDiv) {
                imgsDiv.innerHTML = imgs.map(i => `<img class=\"w-28 h-28 object-cover rounded border\" src=\"/api/images/${i.id}/view\" alt=\"${i.nom_fichier}\">`).join('');
                if (!imgsDiv.innerHTML) imgsDiv.innerHTML = '<span class="text-slate-500">Aucune</span>';
            }
        } catch (e) { console.error('Error loading rendezvous detail', e); }
    };
    if (window.location.pathname.endsWith('rendezvous-view.html')) {
        loadRendezvousDetail();
        window.addEventListener('hashchange', loadRendezvousDetail);
    }

    // ---------------- Achats (liste + ajout) ----------------
    const achatListDiv = document.getElementById('achatList');
    const addAchatForm = document.getElementById('addAchatForm');
    async function loadAffairesSitesForAchat() {
      const token = localStorage.getItem('token');
      try {
        const [afs, sts] = await Promise.all([
          fetch('/api/affaires', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/sites', { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);
        const affaires = afs.ok ? await afs.json() : [];
        const sites = sts.ok ? await sts.json() : [];
        const selA = document.getElementById('a_affaire');
        const selS = document.getElementById('a_site');
        if (selA) {
          selA.innerHTML = '<option value="">(Aucune)</option>' + affaires.map(a=>`<option value="${a.id}">${a.nom_affaire}</option>`).join('');
        }
        if (selS) {
          selS.innerHTML = '<option value="">(Aucun)</option>' + sites.map(s=>`<option value="${s.id}">${s.nom_site}</option>`).join('');
        }
      } catch (_) {}
    }
    async function fetchAchats() {
      const token = localStorage.getItem('token');
      try {
        const r = await fetch('/api/achats', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!r.ok) return;
        const achats = await r.json();
        if (achatListDiv) {
          achatListDiv.innerHTML = '';
          achats.forEach(a => {
            const el = document.createElement('div');
            el.className = 'card card-body flex items-center justify-between';
            const mht = (a.montant_ht!=null? Number(a.montant_ht).toFixed(2):'-');
            const tva = (a.tva!=null? Number(a.tva).toFixed(2):'-');
            const ttc = (a.montant_ttc!=null? Number(a.montant_ttc).toFixed(2):'-');
            el.innerHTML = `
              <div>
                <div class="font-semibold">${a.reference || 'Sans ref.'} � ${a.objet || ''}</div>
                <div class="text-sm text-slate-600">Fournisseur: ${a.fournisseur || '�'} � Statut: <span class="${badgeClassFor("achat", a.statut)}">${a.statut}</span></div>
                <div class="text-xs text-slate-500">HT: ${mht} � TVA: ${tva}% � TTC: ${ttc}</div>
              </div>
              <div>
                <button class="btn btn-danger delete-achat-btn" data-id="${a.id}">Supprimer</button>
              </div>`;
            // compact row override
            try {
              el.className = 'card card-body';
              el.innerHTML = `
                <div class="card-row">
                  <div class="min-w-0">
                    <div class="font-semibold truncate">${a.reference || 'Sans ref.'} � ${a.objet || ''}</div>
                    <div class="text-xs text-slate-500 truncate">Fournisseur: ${a.fournisseur || '�'} � Statut: <span class="${badgeClassFor("achat", a.statut)}">${a.statut}</span></div>
                    <div class="text-xs text-slate-500">HT: ${mht} � TVA: ${tva}%</div>
                  </div>
                  <div class="shrink-0 text-right">
                    <div class="text-xs text-slate-500">TTC</div>
                    <div class="font-semibold">${ttc}</div>
                    <button class="btn btn-sm btn-danger delete-achat-btn mt-1" data-id="${a.id}">Supprimer</button>
                  </div>
                </div>`;
            } catch(_) {}
            achatListDiv.appendChild(el);
          });
        }
      } catch (e) { console.error('Error fetching achats:', e); }
    }
    if (addAchatForm) {
      addAchatForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const token = localStorage.getItem('token');
        const payload = {
          reference: document.getElementById('a_reference').value || null,
          objet: document.getElementById('a_objet').value || null,
          fournisseur: document.getElementById('a_fournisseur').value || null,
          montant_ht: document.getElementById('a_montant_ht').value || null,
          tva: document.getElementById('a_tva').value || null,
          date_commande: document.getElementById('a_date_commande').value || null,
          affaire_id: document.getElementById('a_affaire').value || null,
          site_id: document.getElementById('a_site').value || null,
        };
        try {
          const r = await fetch('/api/achats', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
          if (r.ok) { addAchatForm.reset(); fetchAchats(); try{ showToast("Achat enregistr�", "success"); }catch(_){} }
        } catch (e) { console.error('Error creating achat:', e); }
      });
      if (achatListDiv) {
        achatListDiv.addEventListener('click', async (ev) => {
          if (ev.target.classList.contains('delete-achat-btn')) {
            const id = ev.target.dataset.id; const token = localStorage.getItem('token');
            if (confirm('Supprimer cet achat ?')) {
              try { const d = await fetch(`/api/achats/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); if (d.ok) fetchAchats(); } catch(_){}
            }
          }
        });
      }
      if (achatListDiv) makeCardsClickable(achatListDiv);
      loadAffairesSitesForAchat();
      fetchAchats();
    }

    // ---------------- Factures (liste + ajout) ----------------
    const factureListDiv = document.getElementById('factureList');
    const addFactureForm = document.getElementById('addFactureForm');
    async function loadClientsAffairesForFacture() {
      const token = localStorage.getItem('token');
      try {
        const [cls, afs] = await Promise.all([
          fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/affaires', { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);
        const clients = cls.ok ? await cls.json() : [];
        const affaires = afs.ok ? await afs.json() : [];
        const selC = document.getElementById('f_client');
        const selA = document.getElementById('f_affaire');
        if (selC) selC.innerHTML = '<option value="">(Aucun)</option>' + clients.map(c=>`<option value="${c.id}">${c.nom_client}</option>`).join('');
        if (selA) selA.innerHTML = '<option value="">(Aucune)</option>' + affaires.map(a=>`<option value="${a.id}">${a.nom_affaire}</option>`).join('');
      } catch(_){}
    }
    async function fetchFactures() {
      const token = localStorage.getItem('token');
      try {
        const r = await fetch('/api/factures', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!r.ok) return; const factures = await r.json();
        if (factureListDiv) {
          factureListDiv.innerHTML = '';
          factures.forEach(f => {
            const el = document.createElement('div');
            el.className = 'card card-body flex items-center justify-between';
            const mht = (f.montant_ht!=null? Number(f.montant_ht).toFixed(2):'-');
            const tva = (f.tva!=null? Number(f.tva).toFixed(2):'-');
            const ttc = (f.montant_ttc!=null? Number(f.montant_ttc).toFixed(2):'-');
            el.innerHTML = `
              <div>
                <div class="font-semibold">${f.reference || 'Sans ref.'}</div>
                <div class="text-sm text-slate-600">Statut: <span class="${badgeClassFor("facture", f.statut)}">${f.statut}</span> � Client: ${f.nom_client || '�'}</div>
                <div class="text-xs text-slate-500">HT: ${mht} � TVA: ${tva}% � TTC: ${ttc}</div>
              </div>
              <div>
                <button class="btn btn-danger delete-facture-btn" data-id="${f.id}">Supprimer</button>
              </div>`;
            // compact row override
            try {
              el.className = 'card card-body';
              el.innerHTML = `
                <div class="card-row">
                  <div class="min-w-0">
                    <div class="font-semibold truncate">${f.reference || 'Sans ref.'}</div>
                    <div class="text-xs text-slate-500 truncate">Statut: <span class="${badgeClassFor("facture", f.statut)}">${f.statut}</span> � Client: ${f.nom_client || '�'}</div>
                    <div class="text-xs text-slate-500">HT: ${mht} � TVA: ${tva}%</div>
                  </div>
                  <div class="shrink-0 text-right">
                    <div class="text-xs text-slate-500">TTC</div>
                    <div class="font-semibold">${ttc}</div>
                    <button class="btn btn-sm btn-danger delete-facture-btn mt-1" data-id="${f.id}">Supprimer</button>
                  </div>
                </div>`;
            } catch(_) {}
            factureListDiv.appendChild(el);
          });
        }
      } catch(e){ console.error('Error fetching factures:', e); }
    }
    if (addFactureForm) {
      addFactureForm.addEventListener('submit', async (ev) => {
        ev.preventDefault(); const token = localStorage.getItem('token');
        const payload = {
          reference: document.getElementById('f_reference').value || null,
          montant_ht: document.getElementById('f_montant_ht').value || null,
          tva: document.getElementById('f_tva').value || null,
          date_emission: document.getElementById('f_date_emission').value || null,
          date_echeance: document.getElementById('f_date_echeance').value || null,
          client_id: document.getElementById('f_client').value || null,
          affaire_id: document.getElementById('f_affaire').value || null,
        };
        try {
          const r = await fetch('/api/factures', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
          if (r.ok) { addFactureForm.reset(); fetchFactures(); try{ showToast("Facture enregistr�e", "success"); }catch(_){} }
        } catch(e){ console.error('Error creating facture:', e); }
      });
      if (factureListDiv) {
        factureListDiv.addEventListener('click', async (ev) => {
          if (ev.target.classList.contains('delete-facture-btn')) {
            const id = ev.target.dataset.id; const token = localStorage.getItem('token');
            if (confirm('Supprimer cette facture ?')) {
              try { const d = await fetch(`/api/factures/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); if (d.ok) fetchFactures(); } catch(_){}
            }
          }
        });
      }
      if (factureListDiv) makeCardsClickable(factureListDiv);
      loadClientsAffairesForFacture();
      fetchFactures();
    }

    // Logic for agency management
    const agenceListDiv = document.getElementById('agenceList');
    const addAgenceForm = document.getElementById('addAgenceForm');

    const fetchAgences = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/agences', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = '/login.html';
                return;
            }
            const agences = await response.json();
            agenceListDiv.innerHTML = '';
            agences.forEach(agence => {
                const agenceEl = document.createElement('div');
                agenceEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                agenceEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${agence.titre}</p>
                        <p class="text-sm text-gray-600">${agence.email || ''}</p>
                    </div>
                    <div>
                        <button class="delete-agence-btn text-red-500 hover:text-red-700" data-id="${agence.id}">Supprimer</button>
                        <button class="edit-agence-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${agence.id}">Modifier</button>
                    </div>
                `;
                agenceListDiv.appendChild(agenceEl);
            });
        } catch (error) {
            console.error('Error fetching agences:', error);
        }
    };

    if (addAgenceForm) {
        addAgenceForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const titre = document.getElementById('titre').value;
            const designation = document.getElementById('designation').value;
            const telephone = document.getElementById('telephone').value;
            const email = document.getElementById('email').value;

            const agenceId = document.getElementById('agenceId').value;
            const method = agenceId ? 'PUT' : 'POST';
            const url = agenceId ? `/api/agences/${agenceId}` : '/api/agences';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ titre, designation, telephone, email })
                });
                if (response.ok) {
                    addAgenceForm.reset();
                    document.getElementById('agenceId').value = ''; // Clear hidden ID
                    document.getElementById('formTitle').textContent = 'Ajouter une Agence';
                    document.getElementById('submitButton').textContent = 'Ajouter l\'Agence';
                    fetchAgences();
                }
            } catch (error) {
                console.error('Error saving agence:', error);
            }
        });
    }

    if (agenceListDiv) {
        agenceListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-agence-btn')) {
                const agenceId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette agence ?')) {
                    try {
                        const response = await fetch(`/api/agences/${agenceId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchAgences();
                        }
                    } catch (error) {
                        console.error('Error deleting agence:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-agence-btn')) {
                const agenceId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/agences/${agenceId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const agence = await response.json();
                    
                    document.getElementById('agenceId').value = agence.id;
                    document.getElementById('titre').value = agence.titre;
                    document.getElementById('designation').value = agence.designation || '';
                    document.getElementById('telephone').value = agence.telephone || '';
                    document.getElementById('email').value = agence.email || '';

                    document.getElementById('formTitle').textContent = 'Modifier l\'Agence';
                    document.getElementById('submitButton').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching agence for edit:', error);
                }
            } else if (event.target.classList.contains('edit-agence-btn')) {
                const agenceId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/agences/${agenceId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const agence = await response.json();
                    
                    document.getElementById('agenceId').value = agence.id;
                    document.getElementById('titre').value = agence.titre;
                    document.getElementById('designation').value = agence.designation || '';
                    document.getElementById('telephone').value = agence.telephone || '';
                    document.getElementById('email').value = agence.email || '';

                    document.getElementById('formTitle').textContent = 'Modifier l\'Agence';
                    document.getElementById('submitButton').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching agence for edit:', error);
                }
            }
        });
        fetchAgences();
    }

    // Logic for agent management
    const agentListDiv = document.getElementById('agentList');
    const addAgentForm = document.getElementById('addAgentForm');
    const agenceSelect = document.getElementById('agence');

    const fetchAgents = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/agents', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const agents = await response.json();
            agentListDiv.innerHTML = '';
            agents.forEach(agent => {
                const agentEl = document.createElement('div');
                agentEl.className = 'card card-body';
                const title = `${agent.nom} (${agent.matricule})`;
                agentEl.innerHTML = `
                  <div class="card-row">
                    <div class="min-w-0">
                      <div class="font-semibold truncate"><a class="text-indigo-600 hover:underline" href="/agent.html#${agent.matricule}">${title}</a></div>
                      <div class="text-xs text-slate-500 truncate">${agent.agence_titre || ''}</div>
                    </div>
                    <div class="shrink-0">
                      <button class="btn btn-sm btn-danger delete-agent-btn" data-id="${agent.matricule}">Supprimer</button>
                      <button class="btn btn-sm btn-secondary edit-agent-btn" data-id="${agent.matricule}">Modifier</button>
                    </div>
                  </div>`;
                agentListDiv.appendChild(agentEl);
            });
        } catch (error) {
            console.error('Error fetching agents:', error);
        }
    };

    const loadAgencesIntoSelect = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/agences', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const agences = await response.json();
            agenceSelect.innerHTML = '<option value="">Sélectionner une agence</option>';
            agences.forEach(agence => {
                const option = document.createElement('option');
                option.value = agence.id;
                option.textContent = agence.titre;
                agenceSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching agences for select:', error);
        }
    };

    if (addAgentForm) {
        addAgentForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const matricule = document.getElementById('matricule').value;
            const nom = document.getElementById('nom').value;
            const email = document.getElementById('email').value;
            const agence_id = document.getElementById('agence').value;

            const agentMatricule = document.getElementById('agentMatricule').value;
            const method = agentMatricule ? 'PUT' : 'POST';
            const url = agentMatricule ? `/api/agents/${agentMatricule}` : '/api/agents';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ matricule, nom, email, agence_id })
                });
                if (response.ok) {
                    addAgentForm.reset();
                    document.getElementById('agentMatricule').value = ''; // Clear hidden ID
                    document.getElementById('formTitleAgent').textContent = 'Ajouter un Agent';
                    document.getElementById('submitButtonAgent').textContent = 'Ajouter l\'Agent';
                    fetchAgents();
                }
            } catch (error) {
                console.error('Error saving agent:', error);
            }
        });
    }

    if (agentListDiv) {
        agentListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-agent-btn')) {
                const agentMatricule = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cet agent ?')) {
                    try {
                        const response = await fetch(`/api/agents/${agentMatricule}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchAgents();
                        }
                    } catch (error) {
                        console.error('Error deleting agent:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-agent-btn')) {
                const agentMatricule = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/agents/${agentMatricule}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const agent = await response.json();
                    
                    document.getElementById('agentMatricule').value = agent.matricule;
                    document.getElementById('matricule').value = agent.matricule;
                    document.getElementById('nom').value = agent.nom;
                    document.getElementById('email').value = agent.email || '';
                    document.getElementById('agence').value = agent.agence_id;

                    document.getElementById('formTitleAgent').textContent = 'Modifier l\'Agent';
                    document.getElementById('submitButtonAgent').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching agent for edit:', error);
                }
            } else if (event.target.classList.contains('edit-agent-btn')) {
                const agentMatricule = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/agents/${agentMatricule}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const agent = await response.json();
                    
                    document.getElementById('agentMatricule').value = agent.matricule;
                    document.getElementById('matricule').value = agent.matricule;
                    document.getElementById('nom').value = agent.nom;
                    document.getElementById('email').value = agent.email || '';
                    document.getElementById('agence').value = agent.agence_id;

                    document.getElementById('formTitleAgent').textContent = 'Modifier l\'Agent';
                    document.getElementById('submitButtonAgent').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching agent for edit:', error);
                }
            }
        });
        makeCardsClickable(agentListDiv);
        fetchAgents();
        loadAgencesIntoSelect();
    }

    // Logic for address management
    const adresseListDiv = document.getElementById('adresseList');
    const addAdresseForm = document.getElementById('addAdresseForm');

    const fetchAdresses = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/adresses', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = '/login.html';
                return;
            }
            const adresses = await response.json();
            adresseListDiv.innerHTML = '';
            adresses.forEach(adresse => {
                const adresseEl = document.createElement('div');
                adresseEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                adresseEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${adresse.libelle}</p>
                        <p class="text-sm text-gray-600">${adresse.ligne1}, ${adresse.code_postal} ${adresse.ville}</p>
                    </div>
                    <div>
                        <button class="delete-adresse-btn text-red-500 hover:text-red-700" data-id="${adresse.id}">Supprimer</button>
                        <button class="edit-adresse-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${adresse.id}">Modifier</button>
                    </div>
                `;
                adresseListDiv.appendChild(adresseEl);
            });
        } catch (error) {
            console.error('Error fetching adresses:', error);
        }
    };

    if (addAdresseForm) {
        addAdresseForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const libelle = document.getElementById('libelle').value;
            const ligne1 = document.getElementById('ligne1').value;
            const code_postal = document.getElementById('code_postal').value;
            const ville = document.getElementById('ville').value;
            const pays = document.getElementById('pays').value;

            const adresseId = document.getElementById('adresseId').value;
            const method = adresseId ? 'PUT' : 'POST';
            const url = adresseId ? `/api/adresses/${adresseId}` : '/api/adresses';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ libelle, ligne1, code_postal, ville, pays })
                });
                if (response.ok) {
                    addAdresseForm.reset();
                    document.getElementById('adresseId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleAdresse').textContent = 'Ajouter une Adresse';
                    document.getElementById('submitButtonAdresse').textContent = 'Ajouter l\'Adresse';
                    fetchAdresses();
                }
            } catch (error) {
                console.error('Error saving adresse:', error);
            }
        });
    }

    if (adresseListDiv) {
        adresseListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-adresse-btn')) {
                const adresseId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette adresse ?')) {
                    try {
                        const response = await fetch(`/api/adresses/${adresseId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchAdresses();
                        }
                    } catch (error) {
                        console.error('Error deleting adresse:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-adresse-btn')) {
                const adresseId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/adresses/${adresseId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const adresse = await response.json();
                    
                    document.getElementById('adresseId').value = adresse.id;
                    document.getElementById('libelle').value = adresse.libelle;
                    document.getElementById('ligne1').value = adresse.ligne1 || '';
                    document.getElementById('code_postal').value = adresse.code_postal || '';
                    document.getElementById('ville').value = adresse.ville;
                    document.getElementById('pays').value = adresse.pays || '';

                    document.getElementById('formTitleAdresse').textContent = 'Modifier l\'Adresse';
                    document.getElementById('submitButtonAdresse').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching adresse for edit:', error);
                }
            } else if (event.target.classList.contains('edit-adresse-btn')) {
                const adresseId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/adresses/${adresseId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const adresse = await response.json();
                    
                    document.getElementById('adresseId').value = adresse.id;
                    document.getElementById('libelle').value = adresse.libelle;
                    document.getElementById('ligne1').value = adresse.ligne1 || '';
                    document.getElementById('code_postal').value = adresse.code_postal || '';
                    document.getElementById('ville').value = adresse.ville;
                    document.getElementById('pays').value = adresse.pays || '';

                    document.getElementById('formTitleAdresse').textContent = 'Modifier l\'Adresse';
                    document.getElementById('submitButtonAdresse').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching adresse for edit:', error);
                }
            }
        });
        fetchAdresses();
    }

    // Logic for client management
    const clientListDiv = document.getElementById('clientList');
    const addClientForm = document.getElementById('addClientForm');
    const adresseSelectForClient = document.getElementById('adresse');

    const fetchClients = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const clients = await response.json();
            clientListDiv.innerHTML = '';
            clients.forEach(client => {
                const clientEl = document.createElement('div');
                clientEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                clientEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${client.nom_client}</p>
                        <p class="text-sm text-gray-600">${client.adresse_libelle || 'Adresse non spécifiée'}</p>
                    </div>
                    <div>
                        <button class="delete-client-btn text-red-500 hover:text-red-700" data-id="${client.id}">Supprimer</button>
                        <button class="edit-client-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${client.id}">Modifier</button>
                    </div>
                `;
                clientListDiv.appendChild(clientEl);
            });
        } catch (error) {
            console.error('Error fetching clients:', error);
        }
    };

    const loadAdressesIntoSelectForClient = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/adresses', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const adresses = await response.json();
            adresseSelectForClient.innerHTML = '<option value="">Sélectionner une adresse</option>';
            adresses.forEach(adresse => {
                const option = document.createElement('option');
                option.value = adresse.id;
                option.textContent = adresse.libelle;
                adresseSelectForClient.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching adresses for select:', error);
        }
    };

    if (addClientForm) {
        addClientForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const nom_client = document.getElementById('nom_client').value;
            const representant_nom = document.getElementById('representant_nom').value;
            const adresse_id = document.getElementById('adresse').value;

            const clientId = document.getElementById('clientId').value;
            const method = clientId ? 'PUT' : 'POST';
            const url = clientId ? `/api/clients/${clientId}` : '/api/clients';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ nom_client, representant_nom, adresse_id })
                });
                if (response.ok) {
                    addClientForm.reset();
                    document.getElementById('clientId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleClient').textContent = 'Ajouter un Client';
                    document.getElementById('submitButtonClient').textContent = 'Ajouter le Client';
                    fetchClients();
                }
            } catch (error) {
                console.error('Error saving client:', error);
            }
        });
    }

    if (clientListDiv) {
        clientListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-client-btn')) {
                const clientId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer ce client ?')) {
                    try {
                        const response = await fetch(`/api/clients/${clientId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchClients();
                        }
                    } catch (error) {
                        console.error('Error deleting client:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-client-btn')) {
                const clientId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/clients/${clientId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const client = await response.json();
                    
                    document.getElementById('clientId').value = client.id;
                    document.getElementById('nom_client').value = client.nom_client;
                    document.getElementById('representant_nom').value = client.representant_nom || '';
                    // Re-load adresses and set the selected one
                    await loadAdressesIntoSelectForClient();
                    document.getElementById('adresse').value = client.adresse_id || '';

                    document.getElementById('formTitleClient').textContent = 'Modifier le Client';
                    document.getElementById('submitButtonClient').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching client for edit:', error);
                }
            } else if (event.target.classList.contains('edit-client-btn')) {
                const clientId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/clients/${clientId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const client = await response.json();
                    
                    document.getElementById('clientId').value = client.id;
                    document.getElementById('nom_client').value = client.nom_client;
                    document.getElementById('representant_nom').value = client.representant_nom || '';
                    // Re-load adresses and set the selected one
                    await loadAdressesIntoSelectForClient();
                    document.getElementById('adresse').value = client.adresse_id || '';

                    document.getElementById('formTitleClient').textContent = 'Modifier le Client';
                    document.getElementById('submitButtonClient').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching client for edit:', error);
                }
            } else if (event.target.classList.contains('edit-client-btn')) {
                const clientId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/clients/${clientId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const client = await response.json();
                    
                    document.getElementById('clientId').value = client.id;
                    document.getElementById('nom_client').value = client.nom_client;
                    document.getElementById('representant_nom').value = client.representant_nom || '';
                    // Re-load adresses and set the selected one
                    await loadAdressesIntoSelectForClient();
                    document.getElementById('adresse').value = client.adresse_id || '';

                    document.getElementById('formTitleClient').textContent = 'Modifier le Client';
                    document.getElementById('submitButtonClient').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching client for edit:', error);
                }
            }
        });
        fetchClients();
        loadAdressesIntoSelectForClient();
    }

    // Logic for site management
    const siteListDiv = document.getElementById('siteList');
    const addSiteForm = document.getElementById('addSiteForm');
    const adresseSelectForSite = document.getElementById('adresse');

    const fetchSites = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/sites?overview=1', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const sites = await response.json();
            siteListDiv.innerHTML = '';
            sites.forEach(site => {
                const siteEl = document.createElement('div');
                siteEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                siteEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${site.nom_site}</p>
                        <p class="text-sm text-gray-600">${site.adresse_libelle || 'Adresse non spécifiée'}</p>
                    </div>
                    <div>
                        <button class="delete-site-btn text-red-500 hover:text-red-700" data-id="${site.id}">Supprimer</button>
                        <button class="edit-site-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${site.id}">Modifier</button>
                    </div>
                `;
                try {
                  const last = site.last_maintenance_date ? new Date(site.last_maintenance_date).toLocaleDateString() : '—';
                  const firstDiv = siteEl.querySelector('div');
                  if (firstDiv) {
                    firstDiv.insertAdjacentHTML('beforeend', `
                      <div class="mt-2 text-xs text-slate-600 grid grid-cols-2 gap-x-6 gap-y-1">
                        <div><span class="text-slate-500">Affaires:</span> ${site.affaires_count ?? 0}</div>
                        <div><span class="text-slate-500">DOE:</span> ${site.does_count ?? 0}</div>
                        <div><span class="text-slate-500">Maintenances:</span> ${site.maintenances_count ?? 0}</div>
                        <div><span class="text-slate-500">Derniere maintenance:</span> ${last}</div>
                      </div>`);
                  }
                } catch (_) {}
                try {
                  const title = siteEl.querySelector('p.font-semibold');
                  if (title) {
                    const txt = title.textContent || ('Site #' + site.id);
                    title.innerHTML = `<a class="text-indigo-600 hover:underline" href="/site.html#${site.id}">${txt}</a>`;
                  }
                } catch (_) {}
                siteListDiv.appendChild(siteEl);
            });
            // Colorize site cards uniformly with gradients and accent bars
            try {
              const cards = siteListDiv ? Array.from(siteListDiv.children) : [];
              const gradients = [
                'linear-gradient(135deg,#eef2ff,#e0e7ff)',
                'linear-gradient(135deg,#ecfeff,#cffafe)',
                'linear-gradient(135deg,#ecfdf5,#bbf7d0)',
                'linear-gradient(135deg,#fff7ed,#fed7aa)',
                'linear-gradient(135deg,#fef2f2,#fecaca)',
                'linear-gradient(135deg,#f5f3ff,#ddd6fe)'
              ];
              const accents = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6'];
              cards.forEach((el, i) => {
                el.style.background = gradients[i % gradients.length];
                el.style.border = '1px solid rgba(15,23,42,0.06)';
                el.style.position = 'relative';
                if (!el.querySelector('.accent-bar')) {
                  const bar = document.createElement('div');
                  bar.className = 'accent-bar';
                  bar.style.position = 'absolute'; bar.style.left = '0'; bar.style.top = '0'; bar.style.bottom = '0'; bar.style.width = '4px';
                  bar.style.background = accents[i % accents.length];
                  bar.style.borderTopLeftRadius = '12px'; bar.style.borderBottomLeftRadius = '12px';
                  el.appendChild(bar);
                }
              });
            } catch(_) {}
        } catch (error) {
            console.error('Error fetching sites:', error);
        }
    };

    const loadAdressesIntoSelectForSite = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/adresses', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const adresses = await response.json();
            adresseSelectForSite.innerHTML = '<option value="">Sélectionner une adresse</option>';
            adresses.forEach(adresse => {
                const option = document.createElement('option');
                option.value = adresse.id;
                option.textContent = adresse.libelle;
                adresseSelectForSite.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching adresses for select:', error);
        }
    };

    if (addSiteForm) {
        addSiteForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const nom_site = document.getElementById('nom_site').value;
            const adresse_id = document.getElementById('adresse').value;

            const siteId = document.getElementById('siteId').value;
            const method = siteId ? 'PUT' : 'POST';
            const url = siteId ? `/api/sites/${siteId}` : '/api/sites';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ nom_site, adresse_id })
                });
                if (response.ok) { addSiteForm.reset(); try{ showToast("Site sauvegard�", "success"); }catch(_){};
                    document.getElementById('siteId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleSite').textContent = 'Ajouter un Site';
                    document.getElementById('submitButtonSite').textContent = 'Ajouter le Site';
                    fetchSites();
                }
            } catch (error) {
                console.error('Error saving site:', error);
            }
        });
    }

    if (siteListDiv) {
        siteListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-site-btn')) {
                const siteId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer ce site ?')) {
                    try {
                        const response = await fetch(`/api/sites/${siteId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchSites();
                        }
                    } catch (error) {
                        console.error('Error deleting site:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-site-btn')) {
                const siteId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/sites/${siteId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const site = await response.json();
                    
                    document.getElementById('siteId').value = site.id;
                    document.getElementById('nom_site').value = site.nom_site;
                    // Re-load adresses and set the selected one
                    await loadAdressesIntoSelectForSite();
                    document.getElementById('adresse').value = site.adresse_id || '';

                    document.getElementById('formTitleSite').textContent = 'Modifier le Site';
                    document.getElementById('submitButtonSite').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching site for edit:', error);
                }
            } else if (event.target.classList.contains('edit-site-btn')) {
                const siteId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/sites/${siteId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const site = await response.json();
                    
                    document.getElementById('siteId').value = site.id;
                    document.getElementById('nom_site').value = site.nom_site;
                    // Re-load adresses and set the selected one
                    await loadAdressesIntoSelectForSite();
                    document.getElementById('adresse').value = site.adresse_id || '';

                    document.getElementById('formTitleSite').textContent = 'Modifier le Site';
                    document.getElementById('submitButtonSite').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching site for edit:', error);
                }
            }
        });
        fetchSites();
        loadAdressesIntoSelectForSite();
    }

    // Logic for maintenance management
    const maintenanceListDiv = document.getElementById('maintenanceList');
    const addMaintenanceForm = document.getElementById('addMaintenanceForm');

    const fetchMaintenances = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/maintenances', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const maintenances = await response.json();
            maintenanceListDiv.innerHTML = '';
            maintenances.forEach(maintenance => {
                const maintenanceEl = document.createElement('div');
                maintenanceEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                maintenanceEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${maintenance.titre}</p>
                        <p class="text-sm text-gray-600">${maintenance.description}</p>
                    </div>
                    <div>
                        <button class="delete-maintenance-btn text-red-500 hover:text-red-700" data-id="${maintenance.id}">Supprimer</button>
                        <button class="edit-maintenance-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${maintenance.id}">Modifier</button>
                    </div>
                `;
                maintenanceListDiv.appendChild(maintenanceEl);
            });
        } catch (error) {
            console.error('Error fetching maintenances:', error);
        }
    };

    if (addMaintenanceForm) {
        addMaintenanceForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const titre = document.getElementById('titre').value;
            const description = document.getElementById('description').value;

            const maintenanceId = document.getElementById('maintenanceId').value;
            const method = maintenanceId ? 'PUT' : 'POST';
            const url = maintenanceId ? `/api/maintenances/${maintenanceId}` : '/api/maintenances';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ titre, description })
                });
                if (response.ok) {
                    addMaintenanceForm.reset();
                    document.getElementById('maintenanceId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleMaintenance').textContent = 'Ajouter une Maintenance';
                    document.getElementById('submitButtonMaintenance').textContent = 'Ajouter la Maintenance';
                    fetchMaintenances();
                }
            } catch (error) {
                console.error('Error saving maintenance:', error);
            }
        });
    }

    if (maintenanceListDiv) {
        maintenanceListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-maintenance-btn')) {
                const maintenanceId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette maintenance ?')) {
                    try {
                        const response = await fetch(`/api/maintenances/${maintenanceId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchMaintenances();
                        }
                    } catch (error) {
                        console.error('Error deleting maintenance:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-maintenance-btn')) {
                const maintenanceId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/maintenances/${maintenanceId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const maintenance = await response.json();
                    
                    document.getElementById('maintenanceId').value = maintenance.id;
                    document.getElementById('titre').value = maintenance.titre;
                    document.getElementById('description').value = maintenance.description;

                    document.getElementById('formTitleMaintenance').textContent = 'Modifier la Maintenance';
                    document.getElementById('submitButtonMaintenance').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching maintenance for edit:', error);
                }
            } else if (event.target.classList.contains('edit-maintenance-btn')) {
                const maintenanceId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/maintenances/${maintenanceId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const maintenance = await response.json();
                    
                    document.getElementById('maintenanceId').value = maintenance.id;
                    document.getElementById('titre').value = maintenance.titre;
                    document.getElementById('description').value = maintenance.description;

                    document.getElementById('formTitleMaintenance').textContent = 'Modifier la Maintenance';
                    document.getElementById('submitButtonMaintenance').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching maintenance for edit:', error);
                }
            } else if (event.target.classList.contains('edit-maintenance-btn')) {
                const maintenanceId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/maintenances/${maintenanceId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const maintenance = await response.json();
                    
                    document.getElementById('maintenanceId').value = maintenance.id;
                    document.getElementById('titre').value = maintenance.titre;
                    document.getElementById('description').value = maintenance.description;

                    document.getElementById('formTitleMaintenance').textContent = 'Modifier la Maintenance';
                    document.getElementById('submitButtonMaintenance').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching maintenance for edit:', error);
                }
            }
        });
        fetchMaintenances();
    }

    // Logic for intervention management
    const interventionListDiv = document.getElementById('interventionList');
    const addInterventionForm = document.getElementById('addInterventionForm');
    const maintenanceSelect = document.getElementById('maintenance');
    // Interventions filters (optional controls on interventions.html)
    const interSearch = document.getElementById('interSearch');
    const interDateStart = document.getElementById('interDateStart');
    const interDateEnd = document.getElementById('interDateEnd');
    const interMaintenanceFilter = document.getElementById('interMaintenanceFilter');
    const interSort = document.getElementById('interSort');
    let interventionsData = [];

    const renderInterventions = () => {
        if (!interventionListDiv) return;
        const q = (interSearch && interSearch.value || '').toLowerCase();
        const dStart = interDateStart && interDateStart.value ? new Date(interDateStart.value) : null;
        const dEnd = interDateEnd && interDateEnd.value ? new Date(interDateEnd.value) : null;
        const mFilter = interMaintenanceFilter && interMaintenanceFilter.value ? parseInt(interMaintenanceFilter.value, 10) : null;
        const sort = interSort && interSort.value || 'date_desc';

        let items = interventionsData.slice();
        items = items.filter(it => {
            if (q && !(it.description||'').toLowerCase().includes(q)) return false;
            if (mFilter && it.maintenance_id !== mFilter) return false;
            const dt = it.date_debut ? new Date(it.date_debut) : null;
            if (dStart && dt && dt < dStart) return false;
            if (dEnd && dt && dt > dEnd) return false;
            return true;
        });

        items.sort((a,b) => {
            switch (sort) {
              case 'date_asc': return (new Date(a.date_debut||0)) - (new Date(b.date_debut||0));
              case 'date_desc': return (new Date(b.date_debut||0)) - (new Date(a.date_debut||0));
              case 'id_asc': return (a.id||0) - (b.id||0);
              case 'id_desc': return (b.id||0) - (a.id||0);
              case 'desc_asc': return (a.description||'').localeCompare(b.description||'');
              case 'desc_desc': return (b.description||'').localeCompare(a.description||'');
            }
            return 0;
        });

        interventionListDiv.innerHTML = '';
        items.forEach(intervention => {
            const interventionEl = document.createElement('div');
            interventionEl.className = 'card card-body';
            const title = (intervention.description || ('Intervention #' + intervention.id));
            interventionEl.innerHTML = `
              <div class="card-row">
                <div class="min-w-0">
                  <div class="font-semibold truncate"><a class="text-indigo-600 hover:underline" href="/intervention.html#${intervention.id}">${title}</a></div>
                  <div class="text-xs text-slate-500 truncate">Maintenance: ${intervention.maintenance_titre||''}</div>
                </div>
                <div class="shrink-0 text-right">
                  <button class="btn btn-sm btn-danger delete-intervention-btn" data-id="${intervention.id}">Supprimer</button>
                  <button class="btn btn-sm btn-secondary edit-intervention-btn" data-id="${intervention.id}">Modifier</button>
                </div>
              </div>`;
            interventionListDiv.appendChild(interventionEl);
        });
    };

    const fetchInterventions = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/interventions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            interventionsData = await response.json();
            renderInterventions();
        } catch (error) {
            console.error('Error fetching interventions:', error);
        }
    };

    const loadMaintenancesIntoSelect = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/maintenances', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const maintenances = await response.json();
            maintenanceSelect.innerHTML = '<option value="">Sélectionner une maintenance</option>';
            maintenances.forEach(maintenance => {
                const option = document.createElement('option');
                option.value = maintenance.id;
                option.textContent = maintenance.titre;
                maintenanceSelect.appendChild(option);
            });
            if (interMaintenanceFilter) {
                // keep first option (Toutes), reset others
                Array.from(interMaintenanceFilter.querySelectorAll('option'))
                    .forEach((o, idx) => { if (idx>0) o.remove(); });
                maintenances.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id; opt.textContent = m.titre || ('Maintenance #' + m.id);
                    interMaintenanceFilter.appendChild(opt);
                });
            }
        } catch (error) {
            console.error('Error fetching maintenances for select:', error);
        }
    };

    // Filters listeners
    if (interSearch) interSearch.addEventListener('input', renderInterventions);
    if (interDateStart) interDateStart.addEventListener('change', renderInterventions);
    if (interDateEnd) interDateEnd.addEventListener('change', renderInterventions);
    if (interMaintenanceFilter) interMaintenanceFilter.addEventListener('change', renderInterventions);
    if (interSort) interSort.addEventListener('change', renderInterventions);

    if (addInterventionForm) {
        addInterventionForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const description = document.getElementById('description').value;
            const date_debut = document.getElementById('date_debut').value;
            const maintenance_id = document.getElementById('maintenance').value;

            const interventionId = document.getElementById('interventionId').value;
            const method = interventionId ? 'PUT' : 'POST';
            const url = interventionId ? `/api/interventions/${interventionId}` : '/api/interventions';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ description, date_debut, maintenance_id })
                });
                if (response.ok) {
                    addInterventionForm.reset();
                    document.getElementById('interventionId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleIntervention').textContent = 'Ajouter une Intervention';
                    document.getElementById('submitButtonIntervention').textContent = 'Ajouter l\'Intervention';
                    fetchInterventions();
                }
            } catch (error) {
                console.error('Error saving intervention:', error);
            }
        });
    }

    if (interventionListDiv) {
        interventionListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-intervention-btn')) {
                const interventionId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette intervention ?')) {
                    try {
                        const response = await fetch(`/api/interventions/${interventionId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchInterventions();
                        }
                    } catch (error) {
                        console.error('Error deleting intervention:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-intervention-btn')) {
                const interventionId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/interventions/${interventionId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const intervention = await response.json();
                    
                    document.getElementById('interventionId').value = intervention.id;
                    document.getElementById('description').value = intervention.description;
                    document.getElementById('date_debut').value = intervention.date_debut.split('T')[0]; // Assuming date_debut is ISO string
                    // Re-load maintenances and set the selected one
                    await loadMaintenancesIntoSelect();
                    document.getElementById('maintenance').value = intervention.maintenance_id;

                    document.getElementById('formTitleIntervention').textContent = 'Modifier l\'Intervention';
                    document.getElementById('submitButtonIntervention').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching intervention for edit:', error);
                }
            } else if (event.target.classList.contains('edit-intervention-btn')) {
                const interventionId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/interventions/${interventionId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const intervention = await response.json();
                    
                    document.getElementById('interventionId').value = intervention.id;
                    document.getElementById('description').value = intervention.description;
                    document.getElementById('date_debut').value = intervention.date_debut.split('T')[0]; // Assuming date_debut is ISO string
                    // Re-load maintenances and set the selected one
                    await loadMaintenancesIntoSelect();
                    document.getElementById('maintenance').value = intervention.maintenance_id;

                    document.getElementById('formTitleIntervention').textContent = 'Modifier l\'Intervention';
                    document.getElementById('submitButtonIntervention').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching intervention for edit:', error);
                }
            }
        });
        makeCardsClickable(interventionListDiv);
        fetchInterventions();
        loadMaintenancesIntoSelect();
    }

    // Logic for rendezvous management
    const rendezvousListDiv = document.getElementById('rendezvousList');
    const addRendezvousForm = document.getElementById('addRendezvousForm');
    const interventionSelect = document.getElementById('intervention');
    const siteSelect = document.getElementById('site');

    const fetchRendezvous = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/rendezvous', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const rendezvous_list = await response.json();
            rendezvousListDiv.innerHTML = '';
            rendezvous_list.forEach(rdv => {
                const rdvEl = document.createElement('div');
                rdvEl.className = 'card card-body';
                const title = (rdv.titre || ('Rendez-vous #' + rdv.id));
                rdvEl.innerHTML = `
                  <div class="card-row">
                    <div class="min-w-0">
                      <div class="font-semibold truncate"><a class="text-indigo-600 hover:underline" href="/rendezvous-view.html#${rdv.id}">${title}</a></div>
                      <div class="text-xs text-slate-500 truncate">Site: ${rdv.site_nom} � Intervention: ${rdv.intervention_description}</div>
                    </div>
                    <div class="shrink-0 text-right">
                      <button class="btn btn-sm btn-danger delete-rendezvous-btn" data-id="${rdv.id}">Supprimer</button>
                      <button class="btn btn-sm btn-secondary edit-rendezvous-btn" data-id="${rdv.id}">Modifier</button>
                    </div>
                  </div>`;
                rendezvousListDiv.appendChild(rdvEl);
            });
        } catch (error) {
            console.error('Error fetching rendezvous:', error);
        }
    };

    const loadInterventionsIntoSelect = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/interventions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const interventions = await response.json();
            interventionSelect.innerHTML = '<option value="">Sélectionner une intervention</option>';
            interventions.forEach(intervention => {
                const option = document.createElement('option');
                option.value = intervention.id;
                option.textContent = intervention.description;
                interventionSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching interventions for select:', error);
        }
    };

    const loadSitesIntoSelect = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/sites', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const sites = await response.json();
            siteSelect.innerHTML = '<option value="">Sélectionner un site</option>';
            sites.forEach(site => {
                const option = document.createElement('option');
                option.value = site.id;
                option.textContent = site.nom_site;
                siteSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching sites for select:', error);
        }
    };

    if (addRendezvousForm) {
        addRendezvousForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const titre = document.getElementById('titre').value;
            const date_rdv = document.getElementById('date_rdv').value;
            const intervention_id = document.getElementById('intervention').value;
            const site_id = document.getElementById('site').value;

            const rendezvousId = document.getElementById('rendezvousId').value;
            const method = rendezvousId ? 'PUT' : 'POST';
            const url = rendezvousId ? `/api/rendezvous/${rendezvousId}` : '/api/rendezvous';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ titre, date_rdv, intervention_id, site_id })
                });
                if (response.ok) {
                    addRendezvousForm.reset();
                    document.getElementById('rendezvousId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleRendezvous').textContent = 'Ajouter un Rendez-vous';
                    document.getElementById('submitButtonRendezvous').textContent = 'Ajouter le Rendez-vous';
                    fetchRendezvous();
                }
            } catch (error) {
                console.error('Error saving rendezvous:', error);
            }
        });
    }

    if (rendezvousListDiv) {
        rendezvousListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-rendezvous-btn')) {
                const rdvId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer ce rendez-vous ?')) {
                    try {
                        const response = await fetch(`/api/rendezvous/${rdvId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchRendezvous();
                        }
                    } catch (error) {
                        console.error('Error deleting rendezvous:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-rendezvous-btn')) {
                const rdvId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/rendezvous/${rdvId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const rdv = await response.json();
                    
                    document.getElementById('rendezvousId').value = rdv.id;
                    document.getElementById('titre').value = rdv.titre;
                    document.getElementById('date_rdv').value = rdv.date_rdv.split('T')[0]; // Assuming date_rdv is ISO string
                    // Re-load interventions and sites and set the selected ones
                    await loadInterventionsIntoSelect();
                    document.getElementById('intervention').value = rdv.intervention_id;
                    await loadSitesIntoSelect();
                    document.getElementById('site').value = rdv.site_id;

                    document.getElementById('formTitleRendezvous').textContent = 'Modifier le Rendez-vous';
                    document.getElementById('submitButtonRendezvous').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching rendezvous for edit:', error);
                }
            } else if (event.target.classList.contains('edit-rendezvous-btn')) {
                const rdvId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/rendezvous/${rdvId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const rdv = await response.json();
                    
                    document.getElementById('rendezvousId').value = rdv.id;
                    document.getElementById('titre').value = rdv.titre;
                    document.getElementById('date_rdv').value = rdv.date_rdv.split('T')[0]; // Assuming date_rdv is ISO string
                    // Re-load interventions and sites and set the selected ones
                    await loadInterventionsIntoSelect();
                    document.getElementById('intervention').value = rdv.intervention_id;
                    await loadSitesIntoSelect();
                    document.getElementById('site').value = rdv.site_id;

                    document.getElementById('formTitleRendezvous').textContent = 'Modifier le Rendez-vous';
                    document.getElementById('submitButtonRendezvous').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching rendezvous for edit:', error);
                }
            }
        });
        makeCardsClickable(rendezvousListDiv);
        fetchRendezvous();
        loadInterventionsIntoSelect();
        loadSitesIntoSelect();
    }

    // Logic for affaire management
    const affaireListDiv = document.getElementById('affaireList');
    const addAffaireForm = document.getElementById('addAffaireForm');
    const clientSelectForAffaire = document.getElementById('client');

    const fetchAffaires = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/affaires', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const affaires = await response.json();
            affaireListDiv.innerHTML = '';
            affaires.forEach(affaire => {
                const affaireEl = document.createElement('div');
                affaireEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                affaireEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${affaire.nom_affaire}</p>
                        <p class="text-sm text-gray-600">Client: ${affaire.nom_client}</p>
                    </div>
                    <div>
                        <button class="delete-affaire-btn text-red-500 hover:text-red-700" data-id="${affaire.id}">Supprimer</button>
                        <button class="edit-affaire-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${affaire.id}">Modifier</button>
                    </div>
                `;
                affaireListDiv.appendChild(affaireEl);
            });
        } catch (error) {
            console.error('Error fetching affaires:', error);
        }
    };

    const loadClientsIntoSelectForAffaire = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const clients = await response.json();
            clientSelectForAffaire.innerHTML = '<option value="">Sélectionner un client</option>';
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.nom_client;
                clientSelectForAffaire.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching clients for select:', error);
        }
    };

    if (addAffaireForm) {
        addAffaireForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const nom_affaire = document.getElementById('nom_affaire').value;
            const description = document.getElementById('description').value;
            const client_id = document.getElementById('client').value;

            const affaireId = document.getElementById('affaireId').value;
            const method = affaireId ? 'PUT' : 'POST';
            const url = affaireId ? `/api/affaires/${affaireId}` : '/api/affaires';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ nom_affaire, description, client_id })
                });
                if (response.ok) {
                    addAffaireForm.reset();
                    document.getElementById('affaireId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleAffaire').textContent = 'Ajouter une Affaire';
                    document.getElementById('submitButtonAffaire').textContent = 'Ajouter l\'Affaire';
                    fetchAffaires();
                }
            } catch (error) {
                console.error('Error saving affaire:', error);
            }
        });
    }

    if (affaireListDiv) {
        affaireListDiv.addEventListener('click', async (event) => {
            if (event.target.classList.contains('delete-affaire-btn')) {
                const affaireId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette affaire ?')) {
                    const token = localStorage.getItem('token');
                    try {
                        const response = await fetch(`/api/affaires/${affaireId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchAffaires();
                        }
                    } catch (error) {
                        console.error('Error deleting affaire:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-affaire-btn')) {
                const affaireId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/affaires/${affaireId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const affaire = await response.json();
                    
                    document.getElementById('affaireId').value = affaire.id;
                    document.getElementById('nom_affaire').value = affaire.nom_affaire;
                    document.getElementById('description').value = affaire.description || '';
                    // Re-load clients and set the selected one
                    await loadClientsIntoSelectForAffaire();
                    document.getElementById('client').value = affaire.client_id;

                    document.getElementById('formTitleAffaire').textContent = 'Modifier l\'Affaire';
                    document.getElementById('submitButtonAffaire').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching affaire for edit:', error);
                }
            }
        });
        fetchAffaires();
        loadClientsIntoSelectForAffaire();
    }

    // Logic for DOE management
    const doeListDiv = document.getElementById('doeList');
    const addDoeForm = document.getElementById('addDoeForm');
    const siteSelectForDoe = document.getElementById('site');
    const affaireSelectForDoe = document.getElementById('affaire');

    const fetchDoes = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/does', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const does = await response.json();
            doeListDiv.innerHTML = '';
            does.forEach(doe => {
                const doeEl = document.createElement('div');
                doeEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                doeEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${doe.titre}</p>
                        <p class="text-sm text-gray-600">Site: ${doe.nom_site} | Affaire: ${doe.nom_affaire}</p>
                    </div>
                    <div>
                        <button class="delete-doe-btn text-red-500 hover:text-red-700" data-id="${doe.id}">Supprimer</button>
                        <button class="edit-doe-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${doe.id}">Modifier</button>
                    </div>
                `;
                doeListDiv.appendChild(doeEl);
            });
        } catch (error) {
            console.error('Error fetching does:', error);
        }
    };

    const loadSitesIntoSelectForDoe = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/sites', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const sites = await response.json();
            siteSelectForDoe.innerHTML = '<option value="">Sélectionner un site</option>';
            sites.forEach(site => {
                const option = document.createElement('option');
                option.value = site.id;
                option.textContent = site.nom_site;
                siteSelectForDoe.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching sites for select:', error);
        }
    };

    const loadAffairesIntoSelectForDoe = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/affaires', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const affaires = await response.json();
            affaireSelectForDoe.innerHTML = '<option value="">Sélectionner une affaire</option>';
            affaires.forEach(affaire => {
                const option = document.createElement('option');
                option.value = affaire.id;
                option.textContent = affaire.nom_affaire;
                affaireSelectForDoe.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching affaires for select:', error);
        }
    };

    if (addDoeForm) {
        addDoeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const titre = document.getElementById('titre').value;
            const description = document.getElementById('description').value;
            const site_id = document.getElementById('site').value;
            const affaire_id = document.getElementById('affaire').value;

            const doeId = document.getElementById('doeId').value;
            const method = doeId ? 'PUT' : 'POST';
            const url = doeId ? `/api/does/${doeId}` : '/api/does';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ titre, description, site_id, affaire_id })
                });
                if (response.ok) {
                    addDoeForm.reset();
                    document.getElementById('doeId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleDoe').textContent = 'Ajouter un DOE';
                    document.getElementById('submitButtonDoe').textContent = 'Ajouter le DOE';
                    fetchDoes();
                }
            } catch (error) {
                console.error('Error saving doe:', error);
            }
        });
    }

    if (doeListDiv) {
        doeListDiv.addEventListener('click', async (event) => {
            if (event.target.classList.contains('delete-doe-btn')) {
                const doeId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer ce DOE ?')) {
                    const token = localStorage.getItem('token');
                    try {
                        const response = await fetch(`/api/does/${doeId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchDoes();
                        }
                    } catch (error) {
                        console.error('Error deleting doe:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-doe-btn')) {
                const doeId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/does/${doeId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const doe = await response.json();
                    
                    document.getElementById('doeId').value = doe.id;
                    document.getElementById('titre').value = doe.titre;
                    document.getElementById('description').value = doe.description || '';
                    // Re-load sites and affaires and set the selected ones
                    await loadSitesIntoSelectForDoe();
                    document.getElementById('site').value = doe.site_id;
                    await loadAffairesIntoSelectForDoe();
                    document.getElementById('affaire').value = doe.affaire_id;

                    document.getElementById('formTitleDoe').textContent = 'Modifier le DOE';
                    document.getElementById('submitButtonDoe').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching DOE for edit:', error);
                }
            }
        });
        fetchDoes();
        loadSitesIntoSelectForDoe();
        loadAffairesIntoSelectForDoe();
    }

    // Logic for document management
    const documentListDiv = document.getElementById('documentList');
    const addDocumentForm = document.getElementById('addDocumentForm');

    const fetchDocuments = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/documents', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const documents = await response.json();
            documentListDiv.innerHTML = '';
            documents.forEach(doc => {
                const docEl = document.createElement('div');
                docEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                docEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${doc.nom_fichier}</p>
                        <p class="text-sm text-gray-600">Cible: ${doc.cible_type} (ID: ${doc.cible_id}) - Nature: ${doc.nature}</p>
                    </div>
                    <div>
                        <button class="delete-document-btn text-red-500 hover:text-red-700" data-id="${doc.id}">Supprimer</button>
                        <button class="edit-document-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${doc.id}">Modifier</button>
                    </div>
                `;
                documentListDiv.appendChild(docEl);
            });
        } catch (error) {
            console.error('Error fetching documents:', error);
        }
    };

    if (addDocumentForm) {
        addDocumentForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const nom_fichier = document.getElementById('nom_fichier').value;
            const cible_type = document.getElementById('cible_type').value;
            const cible_id = document.getElementById('cible_id').value;
            const nature = document.getElementById('nature').value;
            const type_mime = document.getElementById('type_mime').value;

            const documentId = document.getElementById('documentId').value;
            const method = documentId ? 'PUT' : 'POST';
            const url = documentId ? `/api/documents/${documentId}` : '/api/documents';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ nom_fichier, cible_type, cible_id, nature, type_mime })
                });
                if (response.ok) {
                    addDocumentForm.reset();
                    document.getElementById('documentId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleDocument').textContent = 'Ajouter un Document';
                    document.getElementById('submitButtonDocument').textContent = 'Ajouter le Document';
                    fetchDocuments();
                }
            } catch (error) {
                console.error('Error saving document:', error);
            }
        });
    }

    if (documentListDiv) {
        documentListDiv.addEventListener('click', async (event) => {
            if (event.target.classList.contains('delete-document-btn')) {
                const docId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer ce document ?')) {
                    const token = localStorage.getItem('token');
                    try {
                        const response = await fetch(`/api/documents/${docId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchDocuments();
                        }
                    } catch (error) {
                        console.error('Error deleting document:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-document-btn')) {
                const docId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/documents/${docId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const doc = await response.json();
                    
                    document.getElementById('documentId').value = doc.id;
                    document.getElementById('nom_fichier').value = doc.nom_fichier;
                    document.getElementById('cible_type').value = doc.cible_type;
                    document.getElementById('cible_id').value = doc.cible_id;
                    document.getElementById('nature').value = doc.nature;
                    document.getElementById('type_mime').value = doc.type_mime || '';

                    document.getElementById('formTitleDocument').textContent = 'Modifier le Document';
                    document.getElementById('submitButtonDocument').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching document for edit:', error);
                }
            }
        });
        fetchDocuments();
    }

    // Logic for passeport management
    const passeportListDiv = document.getElementById('passeportList');
    const addPasseportForm = document.getElementById('addPasseportForm');
    const agentSelectForPasseport = document.getElementById('agent_matricule');

    const fetchPasseports = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/passeports', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const passeports = await response.json();
            passeportListDiv.innerHTML = '';
            passeports.forEach(passeport => {
                const passeportEl = document.createElement('div');
                passeportEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                passeportEl.innerHTML = `
                    <div>
                        <p class="font-semibold">Agent: ${passeport.agent_nom}</p>
                        <p class="text-sm text-gray-600">Permis: ${passeport.permis || 'N/A'}</p>
                        <p class="text-sm text-gray-600">Habilitations: ${passeport.habilitations || 'N/A'}</p>
                        <p class="text-sm text-gray-600">Certifications: ${passeport.certifications || 'N/A'}</p>
                    </div>
                    <div>
                        <button class="delete-passeport-btn text-red-500 hover:text-red-700" data-id="${passeport.id}">Supprimer</button>
                        <button class="edit-passeport-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${passeport.id}">Modifier</button>
                    </div>
                `;
                passeportListDiv.appendChild(passeportEl);
            });
        } catch (error) {
            console.error('Error fetching passeports:', error);
        }
    };

    const loadAgentsIntoSelectForPasseport = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/agents', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const agents = await response.json();
            agentSelectForPasseport.innerHTML = '<option value="">Sélectionner un agent</option>';
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.matricule;
                option.textContent = `${agent.nom} (${agent.matricule})`;
                agentSelectForPasseport.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching agents for select:', error);
        }
    };

    if (addPasseportForm) {
        addPasseportForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const agent_matricule = document.getElementById('agent_matricule').value;
            const permis = document.getElementById('permis').value;
            const habilitations = document.getElementById('habilitations').value;
            const certifications = document.getElementById('certifications').value;
            const commentaire = document.getElementById('commentaire').value;

            const passeportId = document.getElementById('passeportId').value;
            const method = passeportId ? 'PUT' : 'POST';
            const url = passeportId ? `/api/passeports/${passeportId}` : '/api/passeports';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ agent_matricule, permis, habilitations, certifications, commentaire })
                });
                if (response.ok) {
                    addPasseportForm.reset();
                    document.getElementById('passeportId').value = ''; // Clear hidden ID
                    document.getElementById('formTitlePasseport').textContent = 'Ajouter un Passeport';
                    document.getElementById('submitButtonPasseport').textContent = 'Ajouter le Passeport';
                    fetchPasseports();
                }
            } catch (error) {
                console.error('Error saving passeport:', error);
            }
        });
    }

    if (passeportListDiv) {
        passeportListDiv.addEventListener('click', async (event) => {
            if (event.target.classList.contains('delete-passeport-btn')) {
                const passeportId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer ce passeport ?')) {
                    const token = localStorage.getItem('token');
                    try {
                        const response = await fetch(`/api/passeports/${passeportId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchPasseports();
                        }
                    } catch (error) {
                        console.error('Error deleting passeport:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-passeport-btn')) {
                const passeportId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/passeports/${passeportId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const passeport = await response.json();
                    
                    document.getElementById('passeportId').value = passeport.id;
                    // Re-load agents and set the selected one
                    await loadAgentsIntoSelectForPasseport();
                    document.getElementById('agent_matricule').value = passeport.agent_matricule;
                    document.getElementById('permis').value = passeport.permis || '';
                    document.getElementById('habilitations').value = passeport.habilitations || '';
                    document.getElementById('certifications').value = passeport.certifications || '';
                    document.getElementById('commentaire').value = passeport.commentaire || '';

                    document.getElementById('formTitlePasseport').textContent = 'Modifier le Passeport';
                    document.getElementById('submitButtonPasseport').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching passeport for edit:', error);
                }
            }
        });
        fetchPasseports();
        loadAgentsIntoSelectForPasseport();
    }

    // Logic for formation management
    const formationListDiv = document.getElementById('formationList');
    const addFormationForm = document.getElementById('addFormationForm');
    const agentSelectForFormation = document.getElementById('agent_matricule');

    const fetchFormations = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/formations', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const formations = await response.json();
            formationListDiv.innerHTML = '';
            formations.forEach(formation => {
                const formationEl = document.createElement('div');
                formationEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                formationEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${formation.libelle} (${formation.type})</p>
                        <p class="text-sm text-gray-600">Agent: ${formation.agent_nom}</p>
                    </div>
                    <div>
                        <button class="delete-formation-btn text-red-500 hover:text-red-700" data-id="${formation.id}">Supprimer</button>
                        <button class="edit-formation-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${formation.id}">Modifier</button>
                    </div>
                `;
                formationListDiv.appendChild(formationEl);
            });
        } catch (error) {
            console.error('Error fetching formations:', error);
        }
    };

    const loadAgentsIntoSelectForFormation = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/agents', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const agents = await response.json();
            agentSelectForFormation.innerHTML = '<option value="">Sélectionner un agent</option>';
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.matricule;
                option.textContent = `${agent.nom} (${agent.matricule})`;
                agentSelectForFormation.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching agents for select:', error);
        }
    };

    if (addFormationForm) {
        addFormationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const agent_matricule = document.getElementById('agent_matricule').value;
            const type = document.getElementById('type').value;
            const libelle = document.getElementById('libelle').value;
            const date_obtention = document.getElementById('date_obtention').value;
            const date_expiration = document.getElementById('date_expiration').value;
            const organisme = document.getElementById('organisme').value;
            const commentaire = document.getElementById('commentaire').value;

            const formationId = document.getElementById('formationId').value;
            const method = formationId ? 'PUT' : 'POST';
            const url = formationId ? `/api/formations/${formationId}` : '/api/formations';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ agent_matricule, type, libelle, date_obtention, date_expiration, organisme, commentaire })
                });
                if (response.ok) {
                    addFormationForm.reset();
                    document.getElementById('formationId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleFormation').textContent = 'Ajouter une Formation';
                    document.getElementById('submitButtonFormation').textContent = 'Ajouter la Formation';
                    fetchFormations();
                }
            } catch (error) {
                console.error('Error saving formation:', error);
            }
        });
    }

    if (formationListDiv) {
        formationListDiv.addEventListener('click', async (event) => {
            if (event.target.classList.contains('delete-formation-btn')) {
                const formationId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette formation ?')) {
                    const token = localStorage.getItem('token');
                    try {
                        const response = await fetch(`/api/formations/${formationId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchFormations();
                        }
                    } catch (error) {
                        console.error('Error deleting formation:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-formation-btn')) {
                const formationId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/formations/${formationId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const formation = await response.json();
                    
                    document.getElementById('formationId').value = formation.id;
                    // Re-load agents and set the selected one
                    await loadAgentsIntoSelectForFormation();
                    document.getElementById('agent_matricule').value = formation.agent_matricule;
                    document.getElementById('type').value = formation.type;
                    document.getElementById('libelle').value = formation.libelle;
                    document.getElementById('date_obtention').value = formation.date_obtention ? formation.date_obtention.split('T')[0] : '';
                    document.getElementById('date_expiration').value = formation.date_expiration ? formation.date_expiration.split('T')[0] : '';
                    document.getElementById('organisme').value = formation.organisme || '';
                    document.getElementById('commentaire').value = formation.commentaire || '';

                    document.getElementById('formTitleFormation').textContent = 'Modifier la Formation';
                    document.getElementById('submitButtonFormation').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching formation for edit:', error);
                }
            }
        });
        fetchFormations();
        loadAgentsIntoSelectForFormation();
    }

    // Relations helpers and observers
    function enhanceCards(listEl, selectorEditBtnClass, viewClass, label) {
        if (!listEl) return;
        const cards = Array.from(listEl.children);
        cards.forEach(card => {
            if (card.querySelector('.' + viewClass)) return;
            const editBtn = card.querySelector('.' + selectorEditBtnClass);
            const actions = card.querySelector('div:last-child');
            if (editBtn && actions) {
                const id = editBtn.dataset.id;
                const btn = document.createElement('button');
                btn.className = viewClass + ' text-slate-600 hover:text-slate-900 mr-2';
                btn.dataset.id = id;
                btn.textContent = label;
                actions.prepend(btn);
            }
        });
    }

    function setupObserver(listEl, cb) {
        if (!listEl) return;
        const obs = new MutationObserver(() => cb());
        obs.observe(listEl, { childList: true });
        // initial pass
        cb();
    }

    // Set up observers to inject “Voir relations / Voir détails” buttons
    setupObserver(document.getElementById('siteList'), () => enhanceCards(document.getElementById('siteList'), 'edit-site-btn', 'view-site-rel', 'Voir relations'));
    setupObserver(document.getElementById('doeList'), () => enhanceCards(document.getElementById('doeList'), 'edit-doe-btn', 'view-doe-rel', 'Voir relations'));
    setupObserver(document.getElementById('agentList'), () => enhanceCards(document.getElementById('agentList'), 'edit-agent-btn', 'view-agent-rel', 'Voir relations'));
    setupObserver(document.getElementById('rendezvousList'), () => enhanceCards(document.getElementById('rendezvousList'), 'edit-rdv-btn', 'view-rdv-rel', 'Voir détails'));

    // Global handler for relation/detail views
    document.addEventListener('click', async (event) => {
        const token = localStorage.getItem('token');
        if (event.target.classList.contains('view-site-rel')) {
            const siteId = event.target.dataset.id;
            try {
                const rel = await fetch(`/api/sites/${siteId}/relations`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json());
                const container = document.getElementById('siteRelationsContent');
                if (container) {
                    container.innerHTML = `
                        <div>
                          <h4 class="font-semibold mb-2">Affaires</h4>
                          <ul class="list-disc pl-5 space-y-1">${(rel.affaires||[]).map(a=>`<li><a class=\"text-indigo-600 hover:underline\" href=\"/affaires.html#${a.id}\">${a.nom_affaire}</a></li>`).join('') || '<li class=\"text-slate-500\">Aucune</li>'}</ul>
                        </div>
                        <div>
                          <h4 class=\"font-semibold mb-2\">DOE</h4>
                          <ul class=\"list-disc pl-5 space-y-1\">${(rel.does||[]).map(d=>`<li><a class=\"text-indigo-600 hover:underline view-doe-rel\" data-id=\"${d.id}\" href=\"/does.html#${d.id}\">${d.titre}</a></li>`).join('') || '<li class=\"text-slate-500\">Aucun</li>'}</ul>
                        </div>
                        <div>
                          <h4 class=\"font-semibold mb-2\">Maintenances</h4>
                          <ul class=\"list-disc pl-5 space-y-1\">${(rel.maintenances||[]).map(m=>`<li><a class=\"text-slate-700\" href=\"/maintenance.html#${m.id}\">${m.titre||('Maintenance #'+m.id)}</a> <span class=\"text-xs text-slate-500\">(${m.etat})</span></li>`).join('') || '<li class=\"text-slate-500\">Aucune</li>'}</ul>
                        </div>`;
                }
            } catch (e) { console.error('Error fetching site relations', e); }
        } else if (event.target.classList.contains('view-doe-rel')) {
            const id = event.target.dataset.id;
            try {
                const rel = await fetch(`/api/does/${id}/relations`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json());
                const c = document.getElementById('doeRelationsContent');
                if (!c) return;
                const docs = (rel.documents||[]).map(d=>`<li><a class=\"text-indigo-600 hover:underline\" target=\"_blank\" href=\"/api/documents/${d.id}/view\">${d.nom_fichier}</a></li>`).join('') || '<li class=\"text-slate-500\">Aucun</li>';
                const imgs = (rel.images||[]).map(i=>`<img class=\"w-24 h-24 object-cover rounded border\" src=\"/api/images/${i.id}/view\" alt=\"${i.nom_fichier}\">`).join('');
                c.innerHTML = `
                    <div>
                      <h4 class=\"font-semibold mb-2\">Maintenances</h4>
                      <ul class=\"list-disc pl-5 space-y-1\">${(rel.maintenances||[]).map(m=>`<li>${m.titre||('Maintenance #'+m.id)} <span class=\"text-xs text-slate-500\">(${m.etat})</span></li>`).join('') || '<li class=\"text-slate-500\">Aucune</li>'}</ul>
                    </div>
                    <div>
                      <h4 class=\"font-semibold mb-2\">Documents</h4>
                      <ul class=\"list-disc pl-5 space-y-1\">${docs}</ul>
                    </div>
                    <div>
                      <h4 class=\"font-semibold mb-2\">Images</h4>
                      <div class=\"flex flex-wrap gap-2\">${imgs || '<span class=\"text-slate-500\">Aucune</span>'}</div>
                    </div>`;
            } catch (e) { console.error('Error fetching DOE relations', e); }
        } else if (event.target.classList.contains('view-agent-rel')) {
            const matricule = event.target.dataset.id;
            try {
                const rel = await fetch(`/api/agents/${matricule}/relations`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json());
                const c = document.getElementById('agentRelationsContent');
                if (!c) return;
                const formations = (rel.formations||[]).map(f=>`<li>${f.libelle} <span class=\"text-xs text-slate-500\">(${f.type})</span></li>`).join('') || '<li class=\"text-slate-500\">Aucune</li>';
                const pass = rel.passeport ? `
                    <ul class=\"list-disc pl-5 space-y-1\">
                      ${rel.passeport.permis ? `<li>Permis: ${rel.passeport.permis}</li>`:''}
                      ${rel.passeport.habilitations ? `<li>Habilitations: ${rel.passeport.habilitations}</li>`:''}
                      ${rel.passeport.certifications ? `<li>Certifications: ${rel.passeport.certifications}</li>`:''}
                    </ul>` : '<span class=\"text-slate-500\">Aucun</span>';
                c.innerHTML = `
                    <div>
                      <h4 class=\"font-semibold mb-2\">Passeport</h4>
                      ${pass}
                    </div>
                    <div>
                      <h4 class=\"font-semibold mb-2\">Formations</h4>
                      <ul class=\"list-disc pl-5 space-y-1\">${formations}</ul>
                    </div>`;
            } catch (e) { console.error('Error fetching agent relations', e); }
        } else if (event.target.classList.contains('view-rdv-rel')) {
            const id = event.target.dataset.id;
            try {
                const rel = await fetch(`/api/rendezvous/${id}/relations`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json());
                const c = document.getElementById('rendezvousRelationsContent');
                if (!c) return;
                const docs = (rel.documents||[]).map(d=>`<li><a class=\"text-indigo-600 hover:underline\" target=\"_blank\" href=\"/api/documents/${d.id}/view\">${d.nom_fichier}</a></li>`).join('') || '<li class=\"text-slate-500\">Aucun</li>';
                const imgs = (rel.images||[]).map(i=>`<img class=\"w-24 h-24 object-cover rounded border\" src=\"/api/images/${i.id}/view\" alt=\"${i.nom_fichier}\">`).join('');
                c.innerHTML = `
                    <div>
                      <h4 class=\"font-semibold mb-2\">Intervention</h4>
                      ${rel.intervention ? `<div class=\"text-sm\">#${rel.intervention.id} - ${rel.intervention.description||''}</div>` : '<div class=\"text-slate-500 text-sm\">Aucune</div>'}
                    </div>
                    <div>
                      <h4 class=\"font-semibold mb-2\">Site</h4>
                      ${rel.site ? `<div class=\"text-sm\">#${rel.site.id} - ${rel.site.nom_site}</div>` : '<div class=\"text-slate-500 text-sm\">Aucun</div>'}
                    </div>
                    <div>
                      <h4 class=\"font-semibold mb-2\">Documents</h4>
                      <ul class=\"list-disc pl-5 space-y-1\">${docs}</ul>
                    </div>
                    <div>
                      <h4 class=\"font-semibold mb-2\">Images</h4>
                      <div class=\"flex flex-wrap gap-2\">${imgs || '<span class=\"text-slate-500\">Aucune</span>'}</div>
                    </div>`;
            } catch (e) { console.error('Error fetching rendezvous relations', e); }
        }
    // Logout functionality
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', function(event) {
            event.preventDefault();
            localStorage.removeItem('jwtToken'); // Clear the JWT token
            localStorage.removeItem('token'); // Also remove 'token' if it's used
            window.location.href = '/login.html'; // Redirect to login page
        });
    }

    // User info in header
    const token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
    if (token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const decodedToken = JSON.parse(atob(base64));
            const userEmail = decodedToken.email;

            const loggedInUserEmailSpan = document.getElementById('logged-in-user-email');
            if (loggedInUserEmailSpan) {
                loggedInUserEmailSpan.textContent = userEmail;
            }

            // Fetch agent matricule for the logged-in user
            fetch(`/api/agents?email=${userEmail}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(response => response.json())
            .then(agents => {
                if (agents && agents.length > 0) {
                    const agentMatricule = agents[0].matricule;
                    const userInfoContainer = document.getElementById('user-info-container');
                    if (userInfoContainer) {
                        const userLink = document.createElement('a');
                        userLink.href = `/agent.html#${agentMatricule}`;
                        userLink.textContent = userEmail;
                        userLink.className = 'me-2 text-decoration-none text-dark'; // Style as needed
                        loggedInUserEmailSpan.replaceWith(userLink); // Replace span with link
                    }
                }
            })
            .catch(error => console.error('Error fetching agent for user info:', error));

        } catch (error) {
            console.error('Error decoding token or fetching user info:', error);
            // Optionally, redirect to login if token is invalid
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('token');
            // window.location.href = '/login.html';
        }
    }

    // Utility function for Markdown rendering
    function renderMarkdown(markdownText) {
        if (typeof marked === 'undefined') {
            console.warn('Marked.js is not loaded. Markdown rendering will not work.');
            return markdownText;
        }
        return marked.parse(markdownText);
    }
});











