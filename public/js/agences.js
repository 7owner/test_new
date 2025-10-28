document.addEventListener('DOMContentLoaded', () => {
    const agenceListDiv = document.getElementById('agenceList');
    const addAgenceForm = document.getElementById('addAgenceForm');

    const fetchAgences = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/agences', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = '/login.html';
                return;
            }
            const agences = await response.json();
            agenceListDiv.innerHTML = '';
            agences.forEach(agence => {
                const agenceEl = document.createElement('div');
                agenceEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                agenceEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${agence.titre}</p>
                        <p class="text-sm text-gray-600">${agence.email || ''}</p>
                    </div>
                    <div>
                        <button class="delete-agence-btn text-red-500 hover:text-red-700" data-id="${agence.id}">Supprimer</button>
                        <button class="edit-agence-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${agence.id}">Modifier</button>
                    </div>
                `;
                agenceListDiv.appendChild(agenceEl);
            });
        } catch (error) {
            console.error('Error fetching agences:', error);
        }
    };

    if (addAgenceForm) {
        addAgenceForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const titre = document.getElementById('titre').value;
            const designation = document.getElementById('designation').value;
            const telephone = document.getElementById('telephone').value;
            const email = document.getElementById('email').value;

            const agenceId = document.getElementById('agenceId').value;
            const method = agenceId ? 'PUT' : 'POST';
            const url = agenceId ? `/api/agences/${agenceId}` : '/api/agences';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ titre, designation, telephone, email })
                });
                if (response.ok) {
                    addAgenceForm.reset();
                    document.getElementById('agenceId').value = ''; // Clear hidden ID
                    document.getElementById('formTitle').textContent = 'Ajouter une Agence';
                    document.getElementById('submitButton').textContent = 'Ajouter l\'Agence';
                    fetchAgences();
                }
            } catch (error) {
                console.error('Error saving agence:', error);
            }
        });
    }

    if (agenceListDiv) {
        agenceListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-agence-btn')) {
                const agenceId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette agence ?')) {
                    try {
                        const response = await fetch(`/api/agences/${agenceId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchAgences();
                        }
                    } catch (error) {
                        console.error('Error deleting agence:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-agence-btn')) {
                const agenceId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/agences/${agenceId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const agence = await response.json();
                    
                    document.getElementById('agenceId').value = agence.id;
                    document.getElementById('titre').value = agence.titre;
                    document.getElementById('designation').value = agence.designation || '';
                    document.getElementById('telephone').value = agence.telephone || '';
                    document.getElementById('email').value = agence.email || '';

                    document.getElementById('formTitle').textContent = 'Modifier l\'Agence';
                    document.getElementById('submitButton').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching agence for edit:', error);
                }
            }
        });
        fetchAgences();
    }
});