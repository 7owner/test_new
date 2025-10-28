document.addEventListener('DOMContentLoaded', async () => {
      const token = localStorage.getItem('token');
      let isAdmin = false;
      try { const p = token ? JSON.parse(atob(token.split('.')[1])) : null; isAdmin = Array.isArray(p?.roles) && p.roles.includes('ROLE_ADMIN'); } catch {}

      const form = document.getElementById('site-new-form');
      const saveBtn = document.getElementById('save-site-btn');
      const adresseSelect = document.getElementById('adresse_id');
      const toggleNew = document.getElementById('toggle_new_address');
      const newAddr = document.getElementById('new-address-fields');

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
        const r = await fetch('/api/adresses', { headers: await buildHeaders(false), credentials: 'same-origin' });
        if (r.ok) { const list = await r.json(); (Array.isArray(list)? list: []).forEach(a => adresseSelect.add(new Option(a.libelle || `Adresse #${a.id}`, a.id))); }
      } catch {}

      // Role guard
      if (!isAdmin) { form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => el.setAttribute('disabled','true')); saveBtn?.classList.add('d-none'); }

      // Toggle behavior
      const req = (el, on) => { try { if (on) el?.setAttribute('required','true'); else el?.removeAttribute('required'); } catch{} };
      const addrL1 = document.getElementById('addr_ligne1');
      const addrCP = document.getElementById('addr_code_postal');
      const addrVille = document.getElementById('addr_ville');
      const syncRequired = (on) => { req(addrL1,on); req(addrCP,on); req(addrVille,on); if (on) adresseSelect?.removeAttribute('required'); else adresseSelect?.setAttribute('required','true'); };
      toggleNew.addEventListener('change', () => {
        if (toggleNew.checked) { newAddr.classList.remove('d-none'); adresseSelect.setAttribute('disabled','true'); syncRequired(true); }
        else { newAddr.classList.add('d-none'); adresseSelect.removeAttribute('disabled'); syncRequired(false); }
      });
      // Apply initial state
      toggleNew.dispatchEvent(new Event('change'));

      // Submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isAdmin) { alert('Action réservée aux administrateurs.'); return; }
        const nom_site = (document.getElementById('nom_site')?.value || '').trim();
        let adresse_id = adresseSelect.disabled ? null : (Number(adresseSelect.value) || null);
        const commentaire = (document.getElementById('commentaire')?.value || '').trim() || null;
        if (!nom_site) { alert('Veuillez renseigner le nom du site.'); return; }

        if (toggleNew.checked) {
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
          const r = await fetch('/api/sites', { method: 'POST', headers: await buildHeaders(true), credentials: 'same-origin', body: JSON.stringify({ nom_site, adresse_id, commentaire }) });
          const data = await r.json().catch(()=>null);
          if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
          if (data?.id) { alert('Site créé avec succès'); location.href = `site-view.html?id=${data.id}`; } else { location.href = 'sites.html'; }
        } catch (err) { console.error('Erreur création site:', err); alert(`Échec de la création: ${err.message}`); }
      });
    });