document.addEventListener('DOMContentLoaded', async () => {
      const grid = document.getElementById('associations-grid');
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      async function loadAssociations() {
        try {
          const res = await fetch('/api/associations', { headers });
          if (!res.ok) throw new Error('Failed to fetch associations');
          const associations = await res.json();

          // Fetch relations for each association to get associated sites
          const associationsWithRelations = await Promise.all(
            associations.map(async (assoc) => {
              try {
                const relationsRes = await fetch(`/api/associations/${assoc.id}/relations`, { headers });
                if (relationsRes.ok) {
                  const relations = await relationsRes.json();
                  const sites = relations.sites || []; // Assuming relations.sites contains an array of sites
                  
                  // For each site, fetch its relations to get associated contracts
                  const sitesWithContracts = await Promise.all(
                    sites.map(async (site) => {
                      try {
                        const siteRelationsRes = await fetch(`/api/sites/${site.id}/relations`, { headers });
                        if (siteRelationsRes.ok) {
                          const siteRelations = await siteRelationsRes.json();
                          return { ...site, contracts: siteRelations.contrats || [] }; // Assuming siteRelations.contrats
                        }
                      } catch (siteErr) {
                        console.warn(`Could not fetch relations for site ${site.id}:`, siteErr);
                      }
                      return { ...site, contracts: [] };
                    })
                  );
                  return { ...assoc, sites: sitesWithContracts };
                }
              } catch (relationsErr) {
                console.warn(`Could not fetch relations for association ${assoc.id}:`, relationsErr);
              }
              return { ...assoc, sites: [] };
            })
          );
          renderAssociations(associationsWithRelations);
        } catch (error) {
          grid.innerHTML = '<div class="col-12"><div class="alert alert-danger">Erreur de chargement des associations.</div></div>';
        }
      }

      function renderAssociations(associations) {
        grid.innerHTML = '';
        if (!associations || associations.length === 0) {
          grid.innerHTML = '<div class="col-12"><p class="text-muted">Aucune association trouvée.</p></div>';
          return;
        }
        associations.forEach(assoc => {
          const col = document.createElement('div');
          col.className = 'col-12 col-md-6 col-lg-4';
          const address = [assoc.ligne1, assoc.code_postal, assoc.ville].filter(Boolean).join(', ');
          
          const contractsHtml = (assoc.sites || []).flatMap(site => site.contracts || [])
            .map(contract => `<span class="badge bg-secondary me-1 contract-link" data-id="${contract.id}" data-bs-toggle="modal" data-bs-target="#viewContractModal">${contract.titre || `Contrat #${contract.id}`}</span>`)
            .join('');

          col.innerHTML = `
            <div class="card h-100">
              <div class="card-body">
                <h5 class="card-title">${assoc.titre}</h5>
                <h6 class="card-subtitle mb-2 text-muted">${assoc.email_comptabilite || 'Pas d\'email de compta'}</h6>
                <p class="card-text small">${address || 'Pas d\'adresse'}</p>
                ${contractsHtml ? `<div class="mt-2"><small class="text-muted">Contrat(s):</small><br>${contractsHtml}</div>` : ''}
                <div class="mt-3">
                  <button class="btn btn-sm btn-info" data-bs-toggle="modal" data-bs-target="#viewAssociationModal" data-id="${assoc.id}"><i class="bi bi-eye"></i></button>
                  <button class="btn btn-sm btn-warning" data-bs-toggle="modal" data-bs-target="#editAssociationModal" data-id="${assoc.id}"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-danger delete-btn" data-id="${assoc.id}"><i class="bi bi-trash"></i></button>
                </div>
              </div>
            </div>
          `;
          grid.appendChild(col);
        });
      }

      // Modal event listeners
      const viewModal = document.getElementById('viewAssociationModal');
      viewModal.addEventListener('show.bs.modal', e => {
        const id = e.relatedTarget.getAttribute('data-id');
        e.currentTarget.querySelector('iframe').src = `/association-view.html?id=${id}`;
      });

      const editModal = document.getElementById('editAssociationModal');
      editModal.addEventListener('show.bs.modal', e => {
        const id = e.relatedTarget.getAttribute('data-id');
        e.currentTarget.querySelector('iframe').src = `/association-edit.html?id=${id}`;
      });

      [document.getElementById('createAssociationModal'), editModal].forEach(modal => {
        modal.addEventListener('hidden.bs.modal', loadAssociations);
      });
      
      // Delete button listener
      grid.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn') || e.target.closest('.delete-btn')) {
          const btn = e.target.closest('.delete-btn');
          const id = btn.getAttribute('data-id');
          if (confirm('Voulez-vous vraiment supprimer cette association ?')) {
            try {
              const res = await fetch(`/api/associations/${id}`, { method: 'DELETE', headers });
              if (!res.ok) throw new Error('La suppression a échoué');
              loadAssociations();
            } catch (error) {
              alert(error.message);
            }
          }
        }
        if (e.target.classList.contains('contract-link')) {
          const contractId = e.target.getAttribute('data-id');
          const viewContractModal = new bootstrap.Modal(document.getElementById('viewContractModal'));
          const viewContractFrame = document.getElementById('viewContractFrame');
          if (viewContractFrame) {
            viewContractFrame.src = `/contrat-view.html?id=${contractId}`;
            viewContractModal.show();
          }
        }
      });

      loadAssociations();

      const viewContractModal = document.getElementById('viewContractModal');
      if (viewContractModal) {
        viewContractModal.addEventListener('hidden.bs.modal', loadAssociations);
      }
    });