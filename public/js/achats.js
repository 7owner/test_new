document.addEventListener('DOMContentLoaded', () => {
    const achatListDiv = document.getElementById('achatList');
    const addAchatForm = document.getElementById('addAchatForm');
    async function loadAffairesSitesForAchat() {
      const token = localStorage.getItem('token');
      try {
        const [afs, sts] = await Promise.all([
          fetch('/api/affaires', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
          fetch('/api/sites', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
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
                <div class="font-semibold">${a.reference || 'Sans ref.'} - ${a.objet || ''}</div>
                <div class="text-sm text-slate-600">Fournisseur: ${a.fournisseur || ''} - Statut: <span class="badge bg-secondary">${a.statut}</span></div>
                <div class="text-xs text-slate-500">HT: ${mht} - TVA: ${tva}% - TTC: ${ttc}</div>
              </div>
              <div>
                <button class="btn btn-danger delete-achat-btn" data-id="${a.id}">Supprimer</button>
              </div>`;
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
          if (r.ok) { addAchatForm.reset(); fetchAchats(); try{ showToast("Achat enregistré", "success"); }catch(_){} }
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
      loadAffairesSitesForAchat();
      fetchAchats();
    }
});