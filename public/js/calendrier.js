document.addEventListener('DOMContentLoaded', async function() {
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

  async function fetchJSON(url) {
    const token = localStorage.getItem('token');
    const res = await fetch(url, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res.ok) throw new Error(body?.error || res.statusText);
    return body;
  }

  async function fetchAgents() {
    try {
      const agents = await fetchJSON('/api/agents');
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'Tous les agents';
      agentFilter.appendChild(allOption);
      agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.matricule;
        option.textContent = `${agent.nom} ${agent.prenom}`;
        agentFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des agents:', error);
      agentFilter.innerHTML = '<option>Erreur de chargement</option>';
    }
  }

  function statusColors(status) {
    const map = {
      'En_attente': '#facc15',
      'En_cours': '#3b82f6',
      'Termine': '#10b981',
      'Terminé': '#10b981'
    };
    return map[status] || '#6366f1';
  }

  function buildEventSourceUrl(range) {
    const selectedAgents = Array.from(agentFilter.selectedOptions).map(option => option.value);
    const params = new URLSearchParams();
    if (range?.start) params.set('start', range.start.toISOString());
    if (range?.end) params.set('end', range.end.toISOString());
    if (selectedAgents.length && !selectedAgents.includes('all')) {
      params.set('agent_ids', selectedAgents.join(','));
    }
    return `/api/interventions/calendar?${params.toString()}`;
  }

  function renderEventContent(info) {
    const title = info.event.title || 'Intervention';
    const site = info.event.extendedProps.site || '';
    const client = info.event.extendedProps.client || '';
    const status = info.event.extendedProps.status || '';
    const color = statusColors(status);
    return { html: `
      <div style="display:flex;flex-direction:column;gap:2px;color:#111;">
        <div style="font-weight:700;color:${color};">${title}</div>
        <div style="font-size:11px;color:#374151;">${site}</div>
        <div style="font-size:11px;color:#6b7280;">${client}</div>
      </div>` };
  }

  function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      eventSources: [{
        events: async (fetchInfo, successCallback, failureCallback) => {
          try {
            const url = buildEventSourceUrl(fetchInfo);
            const data = await fetchJSON(url);
            const events = (data || []).map(ev => ({
              id: ev.id,
              title: ev.titre || ev.title || `Intervention #${ev.id}`,
              start: ev.date_debut || ev.start,
              end: ev.date_fin || ev.end,
              backgroundColor: statusColors(ev.status || ev.statut),
              borderColor: statusColors(ev.status || ev.statut),
              extendedProps: {
                description: ev.description,
                site: ev.nom_site || ev.site_nom,
                client: ev.nom_client || ev.client_nom,
                status: ev.status || ev.statut,
                intervention_id: ev.id
              }
            }));
            successCallback(events);
          } catch (e) {
            console.error('Erreur chargement calendrier:', e);
            failureCallback(e);
          }
        }
      }],
      eventContent: renderEventContent,
      eventClick: async (info) => {
        if (!modal) return;
        ivFeedback.className = 'alert alert-info py-2 mb-3';
        ivFeedback.textContent = 'Chargement...';
        ivFeedback.classList.remove('d-none');
        ivContent.classList.add('d-none');
        modal.show();

        const ext = info.event.extendedProps || {};
        const id = ext.intervention_id || info.event.id;
        try {
          const rel = await fetchJSON(`/api/interventions/${id}/relations`);
          const iv = rel.intervention || {};
          ivTitle.textContent = iv.titre || info.event.title || 'Intervention';
          const deb = iv.date_debut ? new Date(iv.date_debut).toLocaleString() : '';
          const fin = iv.date_fin ? new Date(iv.date_fin).toLocaleString() : '';
          ivDates.textContent = deb ? (fin ? `${deb} → ${fin}` : deb) : 'Dates non renseignées';
          ivSite.textContent = rel.site?.nom_site || ext.site || 'Non spécifié';
          ivClient.textContent = rel.client?.nom_client || ext.client || 'Non spécifié';
          const agents = (rel.agents_assignes || []).map(a => `${a.prenom || ''} ${a.nom || ''}`.trim()).filter(Boolean);
          ivAgents.textContent = agents.join(', ') || 'Non assigné';
          ivDesc.textContent = iv.description || 'Aucune description.';
          ivLink.href = `intervention-view.html?id=${id}`;

          ivFeedback.classList.add('d-none');
          ivContent.classList.remove('d-none');
        } catch (e) {
          ivFeedback.className = 'alert alert-danger py-2 mb-3';
          ivFeedback.textContent = e.message || 'Impossible de charger le détail.';
        }
      },
      eventDidMount: function(info) {
        const desc = info.event.extendedProps.description || '';
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

  await fetchAgents();
  initializeCalendar();

  agentFilter.addEventListener('change', function() {
    calendar.getEventSources().forEach(source => source.remove());
    calendar.addEventSource({ events: calendar.getOption('eventSources')[0].events });
    calendar.refetchEvents();
  });
});
