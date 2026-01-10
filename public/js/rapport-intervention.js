// Helper to générer un HTML de rapport d'intervention et embarquer logo / images en data-URL
// Usage: const html = await window.buildInterventionReportHTML({ meta, images, resumeHtml, token, logoUrl });
// - meta: { client, site, contrat, intervention, dateStr }
// - images: [{ url, nom_fichier, commentaire_image }]
// - resumeHtml: texte HTML (déjà rendu depuis Markdown)
// - token: jeton Bearer si nécessaire pour accéder aux médias protégés
// - logoUrl: chemin du logo (défaut: /logo_logicielle.png)
(function () {
  const placeholderPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAn8B9W/2zXMAAAAASUVORK5CYII=';

  async function fetchAsDataUrl(path, token) {
    if (!path) return placeholderPixel;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(path, { credentials: 'same-origin', headers });
      if (!res.ok) throw new Error('fetch failed');
      const contentType = res.headers.get('Content-Type') || '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        // on ne convertit pas les docs/HTML pour éviter un data:text/html
        return path;
      }
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (_) {
      return path; // fallback: on laisse l’URL telle quelle
    }
  }

  async function buildInterventionReportHTML({
    meta = {},
    images = [],
    resumeHtml = '',
    token = null,
    logoUrl = '/logo_logicielle.png',
  } = {}) {
    const safeMeta = {
      client: meta.client || 'Non renseigné',
      site: meta.site || 'Non renseigné',
      contrat: meta.contrat || 'Non renseigné',
      intervention: meta.intervention || '—',
      dateStr: meta.dateStr || new Date().toLocaleDateString('fr-FR'),
    };

    const logoSrc = await fetchAsDataUrl(logoUrl, token);

    let imagesHtml = '';
    for (const img of images) {
      const imgSrc = await fetchAsDataUrl(img.url || img.previewUrl || '', token);
      imagesHtml += `
        <div class="bloc">
          <img src="${imgSrc || ''}" alt="${img.nom_fichier || 'Image'}">
          <p><b>${img.nom_fichier || 'Image'}</b></p>
          <p>${img.commentaire_image || ''}</p>
        </div>`;
    }

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport d'intervention</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 30px; background-color: #f9f9f9; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .header h1 { font-size: 16px; color: #2A61B3; margin-top: 5px; }
    .date { text-align: center; font-size: 13px; margin-top: 10px; color: #555; }
    .infos { text-align: center; margin: 30px 0; line-height: 1.8; font-size: 15px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
    .bloc { background-color: white; padding: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-radius: 5px; text-align: center; }
    .bloc img { width: 80%; height: auto; border-radius: 4px; margin-bottom: 8px; cursor: pointer; transition: transform 0.5s ease; }
    .bloc img:hover { transform: scale(1.3); }
    p { margin: 4px 0; font-size: 14px; color: #333; }
    .comment-section { background-color: #f0f8ff; padding: 15px; margin: 20px 0; border-left: 4px solid #2A61B3; border-radius: 4px; }
    .comment-section p { text-align: left; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" style="width:160px;height:auto;">
    <h1>Client : ${safeMeta.client}</h1>
  </div>
  <div class="date"><p><b>Date :</b> ${safeMeta.dateStr}</p></div>
  <div class="infos">
    <p><b>Intervention :</b> ${safeMeta.intervention}</p>
    <p><b>Site :</b> ${safeMeta.site}</p>
    <p><b>Contrat :</b> ${safeMeta.contrat}</p>
  </div>
  <div class="comment-section">
    <p><b>Commentaire / Résumé :</b></p>
    <div style="padding:8px;border-radius:4px;border:1px solid #ccc;background:#fff;">${resumeHtml || '<em>Aucun résumé</em>'}</div>
  </div>
  <div class="grid">
    ${imagesHtml || '<p class="text-muted">Aucune image.</p>'}
  </div>
</body>
</html>`;
  }

  window.buildInterventionReportHTML = buildInterventionReportHTML;
  // Helper optionnel pour enrichir les libellés à partir des API
  async function fetchInterventionMeta({ interventionId, ticketId, siteId, token }) {
    const safeMeta = {
      client: 'Non renseigné',
      site: 'Non renseigné',
      contrat: 'Non renseigné',
      intervention: interventionId || 'Rendu intervention',
    };

    const fetchJSON = async (url) => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(url, { headers, credentials: 'same-origin' });
      if (!res.ok) return null;
      return res.json();
    };

    try {
      if (interventionId) {
        const rel = await fetchJSON(`/api/interventions/${interventionId}/relations`);
        if (rel?.ticket) {
          ticketId = ticketId || rel.ticket.id || rel.ticket.ticket_id;
          siteId = siteId || rel.ticket.site_id;
          safeMeta.client = rel.ticket.nom_client || safeMeta.client;
          safeMeta.site = rel.ticket.nom_site || safeMeta.site;
          safeMeta.intervention = rel.ticket.titre || safeMeta.intervention;
          safeMeta.contrat = rel.ticket.contrat_titre || safeMeta.contrat;
        }
        if (rel?.site?.nom_site) safeMeta.site = rel.site.nom_site;
        if (rel?.intervention?.titre) safeMeta.intervention = rel.intervention.titre;
        if (rel?.contrat?.titre) safeMeta.contrat = rel.contrat.titre;
        if (rel?.association) {
          safeMeta.client = rel.association.client_nom || safeMeta.client;
          safeMeta.contrat = rel.association.contrat_titre || safeMeta.contrat;
        }
      }

      if (ticketId) {
        const rel = await fetchJSON(`/api/tickets/${ticketId}/relations`);
        if (rel?.ticket) {
          safeMeta.client = rel.ticket.nom_client || safeMeta.client;
          safeMeta.site = rel.ticket.nom_site || safeMeta.site;
          safeMeta.intervention = rel.ticket.titre || safeMeta.intervention;
          safeMeta.contrat = rel.ticket.contrat_titre || safeMeta.contrat;
        }
        if (rel?.association) {
          safeMeta.client = rel.association.client_nom || safeMeta.client;
          safeMeta.contrat = rel.association.contrat_titre || safeMeta.contrat;
        }
      }

      if (siteId && (safeMeta.site === 'Non renseigné' || safeMeta.client === 'Non renseigné')) {
        const site = await fetchJSON(`/api/sites/${siteId}`);
        if (site) {
          if (site.nom_site) safeMeta.site = site.nom_site;
          if (site.nom_client) safeMeta.client = site.nom_client;
        }
      }
    } catch (_) {
      // on garde les valeurs existantes en cas d'erreur
    }

    return safeMeta;
  }

  window.fetchInterventionMeta = fetchInterventionMeta;
})();
