document.addEventListener('DOMContentLoaded', () => {
    const adresseListDiv = document.getElementById('adresseList');
    const addAdresseForm = document.getElementById('addAdresseForm');

    const fetchAdresses = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/adresses', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = '/login.html';
                return;
            }
            const adresses = await response.json();
            adresseListDiv.innerHTML = '';
            adresses.forEach(adresse => {
                const adresseEl = document.createElement('div');
                adresseEl.className = 'p-4 bg-gray-50 rounded-lg border flex justify-between items-center';
                adresseEl.innerHTML = `
                    <div>
                        <p class="font-semibold">${adresse.libelle}</p>
                        <p class="text-sm text-gray-600">${adresse.ligne1}, ${adresse.code_postal} ${adresse.ville}</p>
                    </div>
                    <div>
                        <button class="delete-adresse-btn text-red-500 hover:text-red-700" data-id="${adresse.id}">Supprimer</button>
                        <button class="edit-adresse-btn text-blue-500 hover:text-blue-700 ml-2" data-id="${adresse.id}">Modifier</button>
                    </div>
                `;
                adresseListDiv.appendChild(adresseEl);
            });
        } catch (error) {
            console.error('Error fetching adresses:', error);
        }
    };

    if (addAdresseForm) {
        addAdresseForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const libelle = document.getElementById('libelle').value;
            const ligne1 = document.getElementById('ligne1').value;
            const code_postal = document.getElementById('code_postal').value;
            const ville = document.getElementById('ville').value;
            const pays = document.getElementById('pays').value;

            const adresseId = document.getElementById('adresseId').value;
            const method = adresseId ? 'PUT' : 'POST';
            const url = adresseId ? `/api/adresses/${adresseId}` : '/api/adresses';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ libelle, ligne1, code_postal, ville, pays })
                });
                if (response.ok) {
                    addAdresseForm.reset();
                    document.getElementById('adresseId').value = ''; // Clear hidden ID
                    document.getElementById('formTitleAdresse').textContent = 'Ajouter une Adresse';
                    document.getElementById('submitButtonAdresse').textContent = 'Ajouter l\'Adresse';
                    fetchAdresses();
                }
            } catch (error) {
                console.error('Error saving adresse:', error);
            }
        });
    }

    if (adresseListDiv) {
        adresseListDiv.addEventListener('click', async (event) => {
            const token = localStorage.getItem('token');
            if (event.target.classList.contains('delete-adresse-btn')) {
                const adresseId = event.target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette adresse ?')) {
                    try {
                        const response = await fetch(`/api/adresses/${adresseId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (response.ok) {
                            fetchAdresses();
                        }
                    } catch (error) {
                        console.error('Error deleting adresse:', error);
                    }
                }
            } else if (event.target.classList.contains('edit-adresse-btn')) {
                const adresseId = event.target.dataset.id;
                try {
                    const response = await fetch(`/api/adresses/${adresseId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const adresse = await response.json();
                    
                    document.getElementById('adresseId').value = adresse.id;
                    document.getElementById('libelle').value = adresse.libelle;
                    document.getElementById('ligne1').value = adresse.ligne1 || '';
                    document.getElementById('code_postal').value = adresse.code_postal || '';
                    document.getElementById('ville').value = adresse.ville;
                    document.getElementById('pays').value = adresse.pays || '';

                    document.getElementById('formTitleAdresse').textContent = 'Modifier l\'Adresse';
                    document.getElementById('submitButtonAdresse').textContent = 'Modifier';
                } catch (error) {
                    console.error('Error fetching adresse for edit:', error);
                }
            }
        });
        fetchAdresses();
    }
});