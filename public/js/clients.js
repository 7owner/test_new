document.addEventListener('DOMContentLoaded', () => {
    const clientListDiv = document.getElementById('clientList');
    const addClientForm = document.getElementById('addClientForm');
    const adresseSelectForClient = document.getElementById('adresse');

    const fetchClients = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const clients = await response.json();
            clientListDiv.innerHTML = '';
            clients.forEach(client => {
                const clientEl = document.createElement('div');
                clientEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                clientEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${client.nom_client}</p>
                        <p class="text-sm text-gray-600">${client.adresse_libelle || 'Adresse non spécifiée'}</p>
                    </div>
                    <div>
                        <button class="delete-client-btn text-red-500 hover:text-red-700" data-id="${client.id}">Supprimer</button>
                        <button class="edit-client-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${client.id}">Modifier</button>
                    </div>
                `;
                clientListDiv.appendChild(clientEl);
            });
        } catch (error) {
            console.error('Error fetching clients:', error);
        }
    };

    const loadAdressesIntoSelectForClient = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/adresses', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;
            const adresses = await response.json();
            adresseSelectForClient.innerHTML = '<option value="">Sélectionner une adresse</option>';
            adresses.forEach(adresse => {
                const option = document.createElement('option');
                option.value = adresse.id;
                option.textContent = adresse.libelle;
                adresseSelectForClient.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching adresses for select:', error);
        }
    };

    if (addClientForm) {
        addClientForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const nom_client = document.getElementById('nom_client').value;
            const representant_nom = document.getElementById('representant_nom').value;
            const adresse_id = document.getElementById('adresse').value;

            const clientId = document.getElementById('clientId').value;
            const method = clientId ? 'PUT' : 'POST';
            const url = clientId ? `/api/clients/${clientId}` : '/api/clients';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ nom_client, representant_nom, adresse_id })
                });
                if (response.ok) {
                    addClientForm.reset();
                    document.getElementById('clientId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleClient').textContent = 'Ajouter un Client';
                    document.getElementById('submitButtonClient').textContent = 'Ajouter le Client';
                    fetchClients();
                }
            } catch (error) {
                console.error('Error saving client:', error);
            }
        });
    }

    if (clientListDiv) {
        clientListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-client-btn')) {
                const clientId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer ce client ?')) {
                    try {
                        const response = await fetch(`/api/clients/${clientId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchClients();
                        }
                    } catch (error) {
                        console.error('Error deleting client:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-client-btn')) {
                const clientId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/clients/${clientId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const client = await response.json();
                    
                    document.getElementById('clientId').value = client.id;
                    document.getElementById('nom_client').value = client.nom_client;
                    document.getElementById('representant_nom').value = client.representant_nom || '';
                    // Re-load adresses and set the selected one
                    await loadAdressesIntoSelectForClient();
                    document.getElementById('adresse').value = client.adresse_id || '';

                    document.getElementById('formTitleClient').textContent = 'Modifier le Client';
                    document.getElementById('submitButtonClient').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching client for edit:', error);
                }
            }
        });
        fetchClients();
        loadAdressesIntoSelectForClient();
    }
});