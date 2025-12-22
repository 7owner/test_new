document.addEventListener('DOMContentLoaded', async function() {
    const agentFilter = document.getElementById('agent-filter');
    let calendar;

    // --- Modal Handling ---
    const viewInterventionModalEl = document.getElementById('viewInterventionModal');
    const viewInterventionModal = viewInterventionModalEl ? new bootstrap.Modal(viewInterventionModalEl) : null;
    const viewInterventionFrame = document.getElementById('viewInterventionFrame');

    async function fetchAgents() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/agents', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = '/login.html';
                throw new Error('Impossible de charger les agents');
            }
            const agents = await response.json();
            
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'Tous les agents';
            agentFilter.appendChild(allOption);

            (agents || []).forEach(agent => {
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

    function initializeCalendar() {
        const calendarEl = document.getElementById('calendar');
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: '/api/interventions/calendar',
            eventClick: function(info) {
                info.jsEvent.preventDefault(); 

                const interventionId = info.event.id;
                if (!interventionId || !viewInterventionModal || !viewInterventionFrame) return;
                
                // Set the iframe source and show the modal
                viewInterventionFrame.src = `/intervention-view.html?id=${interventionId}`;
                viewInterventionModal.show();
            }
        });
        calendar.render();
    }

    await fetchAgents();
    initializeCalendar();

    agentFilter.addEventListener('change', function() {
        let selectedAgents = Array.from(agentFilter.selectedOptions).map(option => option.value);
        let eventSourceUrl = '/api/interventions/calendar';
        
        if (selectedAgents.length > 0 && !selectedAgents.includes('all')) {
            eventSourceUrl += `?agent_ids=${selectedAgents.join(',')}`;
        }

        calendar.getEventSources().forEach(source => source.remove());
        calendar.addEventSource(eventSourceUrl);
        calendar.refetchEvents();
    });

    // Refresh calendar data when modal is closed, in case something changed
    if (viewInterventionModalEl) {
        viewInterventionModalEl.addEventListener('hidden.bs.modal', function() {
            calendar.refetchEvents();
        });
    }
});