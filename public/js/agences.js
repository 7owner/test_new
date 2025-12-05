document.addEventListener('DOMContentLoaded', () => {
    const agenceListDiv = document.getElementById('agenceList');
    const countBadge = document.getElementById('agence-count');
    const addAgenceForm = document.getElementById('addAgenceForm');
    const inIframe = window !== window.parent;

    const sendToParent = (agence) => {
        try {
            if (agence && window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'agence-select', agence }, '*');
            }
        } catch (e) {
            console.warn('postMessage agence-select failed', e);
        }
    };

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
            if (countBadge) countBadge.textContent = `${(agences || []).length} agence(s)`;
            if (!agences || !agences.length) {
                agenceListDiv.innerHTML = '<div class="col-12 text-muted small text-center py-3">Aucune agence.</div>';
                return;
            }
            (agences || []).forEach(agence => {
                const col = document.createElement('div');
                col.className = 'col-12 col-md-6';
                col.innerHTML = `
                  <div class="list-card h-100 d-flex flex-column justify-content-between">
                    <div>
                      <div class="fw-semibold">${agence.titre || 'Agence'}</div>
                      <div class="text-muted small">${agence.designation || ''}</div>
                      <div class="small mt-1"><i class="bi bi-envelope me-1"></i>${agence.email || '—'}</div>
                      <div class="small"><i class="bi bi-telephone me-1"></i>${agence.telephone || '—'}</div>
                    </div>
                    <div class="d-flex gap-2 mt-3 flex-wrap">
                      <button class="btn btn-sm btn-outline-success select-agence-btn" data-id="${agence.id}"><i class="bi bi-check2"></i> Choisir</button>
                      <button class="btn btn-sm btn-outline-primary edit-agence-btn" data-id="${agence.id}"><i class="bi bi-pencil"></i> Modifier</button>
                      <button class="btn btn-sm btn-outline-danger delete-agence-btn" data-id="${agence.id}"><i class="bi bi-trash"></i> Supprimer</button>
                    </div>
                  </div>
                `;
                agenceListDiv.appendChild(col);
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
                    const saved = await response.json().catch(() => null);
                    addAgenceForm.reset();
                    document.getElementById('agenceId').value = ''; // Clear hidden ID
                    document.getElementById('formTitle').textContent = 'Ajouter une Agence';
                    document.getElementById('submitButton').textContent = 'Ajouter l\'Agence';
                    fetchAgences();
                    if (saved && saved.id && inIframe) sendToParent(saved);
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
            } else if (event.target.classList.contains('select-agence-btn')) {
                const agenceId = event.target.dataset.id;
                const card = event.target.closest('.list-card');
                const titre = card?.querySelector('.fw-semibold')?.textContent || '';
                const email = card?.querySelector('.bi-envelope')?.parentElement?.textContent?.trim() || '';
                sendToParent({ id: Number(agenceId), titre, email });
            }
        });
        fetchAgences();
    }
});
