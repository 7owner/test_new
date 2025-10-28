document.addEventListener('DOMContentLoaded', async function () {
      const qp = new URLSearchParams(location.search);
      const siteId = qp.get('id');
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const isAdmin = (()=>{ try{ const p=token?JSON.parse(atob(token.split('.')[1])):null; return Array.isArray(p?.roles)&&p.roles.includes('ROLE_ADMIN'); } catch { return false; } })();

      function setText(id,val){ const el=document.getElementById(id); if(el) el.textContent = val || ''; }
      function fmt(iso){ if(!iso) return ''; const d=new Date(iso); return isNaN(d)?'':d.toLocaleDateString(); }

      try {
        const res = await fetch(`/api/sites/${siteId}/relations`, { headers, credentials:'same-origin' });
        if (res.status===401||res.status===403){ try{ location.replace('/login.html'); }catch{ location.href='/login.html'; } return; }
        if (!res.ok) throw new Error('Load failed');
        const data = await res.json();
        const site = data && data.site ? data.site : null;
        if (!site) throw new Error('Not found');

        setText('site-name', site.nom_site);
        setText('view_id', site.id);
        setText('view_nom_site', site.nom_site);
        setText('view_adresse_id', site.adresse_id);
        setText('view_commentaire', site.commentaire);
        setText('view_statut', site.statut);
        setText('view_ticket', site.ticket ? 'Oui':'Non');
        setText('view_responsable', site.responsable_matricule || 'Non assigné');
        setText('view_date_debut', fmt(site.date_debut));
        setText('view_date_fin', site.date_fin? fmt(site.date_fin): 'En cours');

        const ticketsDiv = document.getElementById('tickets-list');
        const tickets = Array.isArray(data.tickets) ? data.tickets : [];
        if (tickets.length) {
          tickets.sort((a,b)=>{ const da=a.date_debut? new Date(a.date_debut).getTime():0; const db=b.date_debut? new Date(b.date_debut).getTime():0; return db-da; });
          const ul = document.createElement('ul'); ul.className='list-group';
          tickets.forEach(t=>{
            const li=document.createElement('li'); li.className='list-group-item d-flex justify-content-between align-items-center';
            const dd=fmt(t.date_debut); const df=t.date_fin? fmt(t.date_fin): 'En cours';
            li.innerHTML = `<div><h6 class="mb-1">${t.titre || 'Ticket'}</h6><small>ID: ${t.id} — État: ${t.etat || ''} — Début: ${dd} — Fin: ${df}</small></div><a href="ticket-view.html?id=${t.id}" class="btn btn-sm btn-info">Voir</a>`;
            ul.appendChild(li);
          });
          ticketsDiv.innerHTML=''; ticketsDiv.appendChild(ul);
        } else {
          ticketsDiv.innerHTML = '<p class="text-muted">Aucun ticket associé à ce site.</p>';
        }

        const editBtn = document.getElementById('edit-site-btn'); if (!isAdmin && editBtn) editBtn.classList.add('d-none');
        if (isAdmin && ticketsDiv && ticketsDiv.parentElement) {
          const btn=document.createElement('a'); btn.href='#'; btn.className='btn btn-primary mt-3'; btn.innerHTML='<i class="bi bi-plus-circle me-2"></i>Créer un ticket pour ce site';
          btn.addEventListener('click',(e)=>{ e.preventDefault(); try{ location.replace(`ticket-new.html?site_id=${encodeURIComponent(siteId)}`); }catch{ location.href=`ticket-new.html?site_id=${encodeURIComponent(siteId)}`; } });
          ticketsDiv.parentElement.appendChild(btn);
        }

      } catch(e) {
        setText('site-name','Site introuvable');
      }
    });