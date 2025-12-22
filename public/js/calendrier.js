document.addEventListener('DOMContentLoaded', async function () {
  const agentFilter = document.getElementById('agent-filter');
  const modalEl = document.getElementById('interventionModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const ivFeedback = document.getElementById('iv-feedback');
  const ivContent = document.getElementById('iv-content');
  const ivTitle = document.getElementById('iv-title');
  const ivDates = document.getElementById('iv-dates');
  const ivSite = document.getElementById('iv-site');
  const ivClient = document.getElementById('iv-client');
  const ivAgents = document.getElementById('iv-agents');
  const ivDesc = document.getElementById('iv-desc');
  const ivLink = document.getElementById('iv-link');
  let calendar;

  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error(body?.error || res.statusText);
    return body;
  }

  function statusColor(status) {
    const map = {
      'En_attente': '#f59e0b',
      'En cours de traitement': '#3b82f6',
      'En_cours': '#3b82f6',
      'Termine': '#10b981',
      'Terminé': '#10b981'
    };
    return map[status] || '#6366f1';
  }

  async function loadAgents() {
    try {
      const agents = await fetchJSON('/api/agents');
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'Tous les agents';
      agentFilter.appendChild(allOption);
      (agents || []).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.matricule;
        opt.textContent = `${a.nom || ''} ${a.prenom || ''}`.trim() || a.matricule;
        agentFilter.appendChild(opt);
      });
    } catch (e) {
      agentFilter.innerHTML = '<option>Erreur chargement agents</option>';
    }
  }

  function buildEventSource(fetchInfo) {
    const selectedAgents = Array.from(agentFilter.selectedOptions).map(o => o.value);
    const params = new URLSearchParams();
    if (fetchInfo?.start) params.set('start', fetchInfo.start.toISOString());
    if (fetchInfo?.end) params.set('end', fetchInfo.end.toISOString());
    if (selectedAgents.length && !selectedAgents.includes('all')) params.set('agent_ids', selectedAgents.join(','));
    return `/api/interventions/calendar?${params.toString()}`;
  }

  function renderEventContent(info) {
    const ext = info.event.extendedProps || {};
    const color = statusColor(ext.status || ext.statut);
    return {
      html: `
        <div style="display:flex;flex-direction:column;gap:2px;">
          <div style="font-weight:700;color:${color};">${info.event.title || 'Intervention'}</div>
          <div style="font-size:11px;color:#374151;">${ext.site || ''}</div>
          <div style="font-size:11px;color:#6b7280;">${ext.client || ''}</div>
        </div>
      `
    };
  }

  async function showInterventionDetail(id, fallback) {
    if (!modal) return;
    ivFeedback.className = 'alert alert-info py-2 mb-3';
    ivFeedback.textContent = 'Chargement...';
    ivFeedback.classList.remove('d-none');
    ivContent.classList.add('d-none');
    modal.show();
    try {
      const rel = await fetchJSON(`/api/interventions/${id}/relations`);
      const iv = rel.intervention || {};
      ivTitle.textContent = iv.titre || fallback?.title || 'Intervention';
      const deb = iv.date_debut ? new Date(iv.date_debut).toLocaleString() : '';
      const fin = iv.date_fin ? new Date(iv.date_fin).toLocaleString() : '';
      ivDates.textContent = deb ? (fin ? `${deb} → ${fin}` : deb) : 'Dates non renseignées';
      ivSite.textContent = rel.site?.nom_site || fallback?.site || 'Non spécifié';
      ivClient.textContent = rel.client?.nom_client || fallback?.client || 'Non spécifié';
      const agents = (rel.agents_assignes || []).map(a => `${a.prenom || ''} ${a.nom || ''}`.trim()).filter(Boolean);
      ivAgents.textContent = agents.join(', ') || 'Non assigné';
      ivDesc.textContent = iv.description || fallback?.desc || 'Aucune description.';
      ivLink.href = `intervention-view.html?id=${id}`;
      ivFeedback.classList.add('d-none');
      ivContent.classList.remove('d-none');
    } catch (e) {
      ivFeedback.className = 'alert alert-danger py-2 mb-3';
      ivFeedback.textContent = e.message || 'Impossible de charger le détail.';
    }
  }

  function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      eventSources: [{
        events: async (fetchInfo, success, failure) => {
          try {
            const url = buildEventSource(fetchInfo);
            const data = await fetchJSON(url);
            const events = (data || []).map(ev => ({
              id: ev.id,
              title: ev.titre || ev.title || `Intervention #${ev.id}`,
              start: ev.date_debut || ev.start,
              end: ev.date_fin || ev.end,
              backgroundColor: statusColor(ev.status || ev.statut),
              borderColor: statusColor(ev.status || ev.statut),
              extendedProps: {
                description: ev.description,
                site: ev.nom_site || ev.site_nom,
                client: ev.nom_client || ev.client_nom,
                status: ev.status || ev.statut,
                intervention_id: ev.id
              }
            }));
            success(events);
          } catch (e) {
            console.error('Erreur calendrier', e);
            failure(e);
          }
        }
      }],
      eventContent: renderEventContent,
      eventClick: (info) => {
        const ext = info.event.extendedProps || {};
        const id = ext.intervention_id || info.event.id;
        showInterventionDetail(id, {
          title: info.event.title,
          site: ext.site,
          client: ext.client,
          desc: ext.description
        });
      },
      eventDidMount: (info) => {
        const desc = info.event.extendedProps?.description;
        if (desc) {
          new bootstrap.Tooltip(info.el, {
            title: desc,
            placement: 'top',
            trigger: 'hover',
            container: 'body'
          });
        }
      }
    });
    calendar.render();
  }

  await loadAgents();
  initCalendar();

  agentFilter.addEventListener('change', () => {
    calendar.refetchEvents();
  });
});
