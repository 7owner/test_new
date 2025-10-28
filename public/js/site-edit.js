document.addEventListener('DOMContentLoaded', async function() {
      const urlParams = new URLSearchParams(window.location.search);
      const siteId = urlParams.get('id');

      const token = localStorage.getItem('token');
      const isAdmin = (() => { try { const p = token? JSON.parse(atob(token.split('.')[1])):null; return Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch { return false; } })();

      const responsableSelect = document.getElementById('responsable_matricule');
      const adresseSelect = document.getElementById('adresse_id');

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

      // Load agents into select
      try {
        const r = await fetch('/api/agents', { headers: await buildHeaders(false), credentials: 'same-origin' });
        if (r.ok) { const list = await r.json(); (Array.isArray(list)? list: []).forEach(a => responsableSelect.add(new Option(`${a.nom} ${a.prenom} (${a.matricule})`, a.matricule))); }
      } catch {}

      // Load addresses into select
      try {
        const r = await fetch('/api/adresses', { headers: await buildHeaders(false), credentials: 'same-origin' });
        if (r.ok) { const list = await r.json(); (Array.isArray(list)? list: []).forEach(a => adresseSelect.add(new Option(a.libelle || `Adresse #${a.id}`, a.id))); }
      } catch {}

      if (siteId) {
        try {
          const response = await fetch(`/api/sites/${siteId}`, { headers: await buildHeaders(false), credentials: 'same-origin' });
          if (response.status===401||response.status===403){ try{ location.replace('/login.html'); }catch{ location.href='/login.html'; } return; }
          const site = response.ok ? await response.json() : null;

          if (site) {
            document.getElementById('id').value = site.id;
            document.getElementById('nom_site').value = site.nom_site;
            document.getElementById('adresse_id').value = site.adresse_id;
            document.getElementById('commentaire').value = site.commentaire;
            document.getElementById('statut').value = site.statut;
            document.getElementById('ticket').checked = site.ticket;
            if (site.responsable_matricule) {
              responsableSelect.value = site.responsable_matricule;
            }

            // Conditionally disable form fields and hide save button for non-admins
            if (!isAdmin) {
              const form = document.getElementById('site-edit-form');
              form.querySelectorAll('input, select, textarea').forEach(element => {
                element.setAttribute('disabled', 'true');
              });
              document.getElementById('save-site-btn').classList.add('d-none');
            }

          } else {
            alert("Site non trouvé!");
            window.location.href = "sites.html";
          }
        } catch (e) {
          console.error('Error loading site data:', e);
          alert("Erreur lors du chargement des données du site.");
          window.location.href = "sites.html";
        }
      } else {
        alert("ID de site manquant!");
        window.location.href = "sites.html";
      }

      const form = document.getElementById('site-edit-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isAdmin) { alert('Action réservée aux administrateurs.'); return; }

        const updatedSite = {
          id: document.getElementById('id').value,
          nom_site: document.getElementById('nom_site').value,
          adresse_id: document.getElementById('adresse_id').value,
          commentaire: document.getElementById('commentaire').value,
          statut: document.getElementById('statut').value,
          ticket: document.getElementById('ticket').checked,
          responsable_matricule: document.getElementById('responsable_matricule').value || null,
        };

        try {
          const response = await fetch(`/api/sites/${updatedSite.id}`, {
            method: 'PUT',
            headers: await buildHeaders(true),
            credentials: 'same-origin',
            body: JSON.stringify(updatedSite),
          });

          if (response.ok) {
            alert('Site mis à jour avec succès!');
            window.location.href = `site-view.html?id=${updatedSite.id}`;
          } else {
            const errorData = await response.json();
            alert(`Erreur lors de la mise à jour du site: ${errorData.error || response.statusText}`);
          }
        } catch (error) {
          console.error('Erreur lors de la mise à jour du site:', error);
          alert('Une erreur inattendue est survenue lors de la mise à jour.');
        }
      });
    });