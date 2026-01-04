document.addEventListener('DOMContentLoaded', () => {
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
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const factures = await r.json();
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
                <div class="text-sm text-slate-600">Statut: <span class="badge bg-secondary">${f.statut}</span> - Client: ${f.nom_client || ''}</div>
                <div class="text-xs text-slate-500">HT: ${mht} - TVA: ${tva}% - TTC: ${ttc}</div>
              </div>
              <div>
                <button class="btn btn-danger delete-facture-btn" data-id="${f.id}">Supprimer</button>
              </div>`;
            factureListDiv.appendChild(el);
          });
          if (!factures.length) factureListDiv.innerHTML = '<div class="text-muted">Aucune facture enregistrée.</div>';
        }
      } catch(e){
        console.error('Error fetching factures:', e);
        if (factureListDiv) factureListDiv.innerHTML = '<div class="text-danger">Erreur de chargement des factures.</div>';
      }
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
          if (r.ok) { addFactureForm.reset(); fetchFactures(); try{ showToast("Facture enregistrée", "success"); }catch(_){} }
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
      loadClientsAffairesForFacture();
      fetchFactures();
    }
});
