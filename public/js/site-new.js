document.addEventListener('DOMContentLoaded', async () => {
      const token = localStorage.getItem('token');
      let isAdmin = false;
      try { const p = token ? JSON.parse(atob(token.split('.')[1])) : null; isAdmin = Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch {}

      const form = document.getElementById('site-new-form');
      if (!form) return;
      const saveBtn = document.getElementById('save-site-btn');
      const adresseSelect = document.getElementById('adresse_id');
      const toggleNew = document.getElementById('toggle_new_address');
      const newAddr = document.getElementById('new-address-fields');
      const clientSelect = document.getElementById('client_id');

      const responsableSelect = document.getElementById('responsable_matricule');
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

      // Load addresses
      try {
        if (adresseSelect) {
          const r = await fetch('/api/adresses', { headers: await buildHeaders(false), credentials: 'same-origin' });
          if (r.ok) { const list = await r.json(); (Array.isArray(list)? list: []).forEach(a => adresseSelect.add(new Option(a.libelle || `Adresse #${a.id}`, a.id))); }
        }
      } catch {}

      // Load clients
      try {
        if (clientSelect) {
          const r = await fetch('/api/clients', { headers: await buildHeaders(false), credentials: 'same-origin' });
          if (r.ok) { const list = await r.json(); (Array.isArray(list)? list: []).forEach(c => clientSelect.add(new Option(c.nom_client || `Client #${c.id}`, c.id))); }
        }
      } catch {}



      // Load agents for responsable
      try {
        if (responsableSelect) {
          const r = await fetch('/api/agents', { headers: await buildHeaders(false), credentials: 'same-origin' });
          if (r.ok) {
            const list = await r.json();
            (Array.isArray(list)? list: []).forEach(a => responsableSelect.add(new Option(`${a.nom||''} ${a.prenom||''}`.trim() || a.matricule, a.matricule)));
          }
        }
      } catch {}

      // Role guard
      if (!isAdmin) { form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => el.setAttribute('disabled','true')); saveBtn?.classList.add('d-none'); }

      // Toggle behavior
      const req = (el, on) => { try { if (on) el?.setAttribute('required','true'); else el?.removeAttribute('required'); } catch{} };
      const addrL1 = document.getElementById('addr_ligne1');
      const addrCP = document.getElementById('addr_code_postal');
      const addrVille = document.getElementById('addr_ville');
      const syncRequired = (on) => { req(addrL1,on); req(addrCP,on); req(addrVille,on); if (on) adresseSelect?.removeAttribute('required'); else adresseSelect?.setAttribute('required','true'); };
      if (toggleNew) {
        toggleNew.addEventListener('change', () => {
          if (toggleNew.checked) { newAddr?.classList.remove('d-none'); adresseSelect?.setAttribute('disabled','true'); syncRequired(true); }
          else { newAddr?.classList.add('d-none'); adresseSelect?.removeAttribute('disabled'); syncRequired(false); }
        });
        // Apply initial state
        toggleNew.dispatchEvent(new Event('change'));
      }

      // Submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isAdmin) { alert('Action réservée aux administrateurs.'); return; }
        const nom_site = (document.getElementById('nom_site')?.value || '').trim();
        let adresse_id = (adresseSelect && !adresseSelect.disabled) ? (Number(adresseSelect.value) || null) : null;
        const commentaire = (document.getElementById('commentaire')?.value || '').trim() || null;
        if (!nom_site) { alert('Veuillez renseigner le nom du site.'); return; }
        if (clientSelect && !clientSelect.value) { alert('Veuillez sélectionner un client.'); return; }

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
            client_id: clientSelect ? Number(clientSelect.value) || null : null,
            responsable_matricule: responsableSelect ? (responsableSelect.value || null) : null,
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
