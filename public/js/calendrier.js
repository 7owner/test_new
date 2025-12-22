document.addEventListener('DOMContentLoaded', async function() {
    const agentFilter = document.getElementById('agent-filter');
    let calendar;

    async function fetchAgents() {
        try {
            const response = await fetch('/api/agents');
            if (!response.ok) {
                throw new Error('Impossible de charger les agents');
            }
            const agents = await response.json();
            
            // Add an option for "All agents"
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

    function initializeCalendar() {
        const calendarEl = document.getElementById('calendar');
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: '/api/interventions/calendar', // This endpoint needs to be created
            eventDidMount: function(info) {
                // You can customize event rendering here if needed
                // For example, adding a tooltip
                const tooltip = new bootstrap.Tooltip(info.el, {
                    title: info.event.extendedProps.description,
                    placement: 'top',
                    trigger: 'hover',
                    container: 'body'
                });
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
});
