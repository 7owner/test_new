document.addEventListener('DOMContentLoaded', () => {
  const clientListDiv = document.getElementById('clientList');
  const addClientForm = document.getElementById('addClientForm');

  const fetchClients = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) return;
      const clients = await response.json();
      clientListDiv.innerHTML = '';
      clients.forEach(client => {
        const clientEl = document.createElement('div');
        clientEl.className = 'list-group-item list-group-item-action';
        clientEl.innerHTML = `
          <div class="d-flex w-100 justify-content-between">
            <h5 class="mb-1"><a href="/client-view.html?id=${client.id}">${client.nom_client}</a></h5>
            <small class="text-muted">${client.representant_email || 'Email non spécifié'}</small>
          </div>
          <p class="mb-1">${client.adresse_libelle || 'Adresse non spécifiée'}</p>
          <div class="d-flex justify-content-end">
            <button class="btn btn-sm btn-outline-primary me-2 edit-client-btn" data-id="${client.id}">Modifier</button>
            <button class="btn btn-sm btn-outline-danger delete-client-btn" data-id="${client.id}">Supprimer</button>
          </div>
        `;
        clientListDiv.appendChild(clientEl);
      });
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  if (addClientForm) {
    addClientForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const token = localStorage.getItem('token');
      const nom_client = document.getElementById('nom_client').value;
      const representant_nom = document.getElementById('representant_nom').value;
      const representant_email = document.getElementById('representant_email').value; // New field
      const adresse_ligne1 = document.getElementById('adresse_ligne1').value;
      const adresse_ligne2 = document.getElementById('adresse_ligne2').value;
      const adresse_code_postal = document.getElementById('adresse_code_postal').value;
      const adresse_ville = document.getElementById('adresse_ville').value;
      const adresse_pays = document.getElementById('adresse_pays').value;
      const clientId = document.getElementById('clientId').value;

      const method = clientId ? 'PUT' : 'POST';
      const url = clientId ? `/api/clients/${clientId}` : '/api/clients';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            nom_client,
            representant_nom,
            representant_email, // New field
            adresse_ligne1,
            adresse_ligne2,
            adresse_code_postal,
            adresse_ville,
            adresse_pays
          })
        });
        if (response.ok) {
          addClientForm.reset();
          document.getElementById('clientId').value = '';
          document.getElementById('formTitleClient').textContent = 'Ajouter un Client';
          document.getElementById('submitButtonClient').textContent = 'Ajouter le Client';
          fetchClients();
        }
      } catch (error) { console.error('Error saving client:', error); }
    });
  }

  if (clientListDiv) {
    clientListDiv.addEventListener('click', async (event) => {
      const token = localStorage.getItem('token');
      if (event.target.classList.contains('delete-client-btn')) {
        const clientId = event.target.dataset.id;
        if (confirm('Voulez-vous vraiment supprimer ce client ?')) {
          try {
            const response = await fetch(`/api/clients/${clientId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) fetchClients();
          } catch (error) { console.error('Error deleting client:', error); }
        }
      } else if (event.target.classList.contains('edit-client-btn')) {
        const clientId = event.target.dataset.id;
        try {
          const response = await fetch(`/api/clients/${clientId}`, { headers: { 'Authorization': `Bearer ${token}` } });
          const client = await response.json();
          document.getElementById('clientId').value = client.id;
          document.getElementById('nom_client').value = client.nom_client;
          document.getElementById('representant_nom').value = client.representant_nom || '';
          document.getElementById('representant_email').value = client.representant_email || ''; // New field
          
          // Fetch address details if adresse_id exists
          if (client.adresse_id) {
            const adresseResponse = await fetch(`/api/adresses/${client.adresse_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (adresseResponse.ok) {
              const adresse = await adresseResponse.json();
              document.getElementById('adresse_ligne1').value = adresse.ligne1 || '';
              document.getElementById('adresse_ligne2').value = adresse.ligne2 || '';
              document.getElementById('adresse_code_postal').value = adresse.code_postal || '';
              document.getElementById('adresse_ville').value = adresse.ville || '';
              document.getElementById('adresse_pays').value = adresse.pays || '';
            }
          } else {
            // Clear address fields if no address_id
            document.getElementById('adresse_ligne1').value = '';
            document.getElementById('adresse_ligne2').value = '';
            document.getElementById('adresse_code_postal').value = '';
            document.getElementById('adresse_ville').value = '';
            document.getElementById('adresse_pays').value = '';
          }

          document.getElementById('formTitleClient').textContent = 'Modifier le Client';
          document.getElementById('submitButtonClient').textContent = 'Modifier';
        } catch (error) { console.error('Error fetching client for edit:', error); }
      }
    });
    fetchClients();
  }
});
