// Helper pour générer un HTML de rapport de travaux et embarquer logo / images en data-URL
// Usage:
//   const meta = await window.fetchTravauxMeta({ travauxId, token });
//   const html = await window.buildTravauxReportHTML({ meta, images, resumeHtml, token, logoUrl });
(function () {
  const placeholderPixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAn8B9W/2zXMAAAAASUVORK5CYII=';

  async function fetchAsDataUrl(path, token) {
    if (!path) return placeholderPixel;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(path, { credentials: 'same-origin', headers });
      if (!res.ok) throw new Error('fetch failed');
      const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) return path;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (_) {
      return path;
    }
  }

  async function buildTravauxReportHTML({
    meta = {},
    images = [],
    resumeHtml = '',
    token = null,
    logoUrl = '/logo_logicielle.png',
  } = {}) {
    const safeMeta = {
      client: meta.client || 'Non renseigné',
      travaux: meta.travaux || meta.titre || '—',
      site: meta.site || 'Non renseigné',
      affaire: meta.affaire || 'Non renseigné',
      doe: meta.doe || 'Non renseigné',
      contrat: meta.contrat || 'Non renseigné',
      dateStr: meta.dateStr || new Date().toLocaleDateString('fr-FR'),
    };

    const logoSrc = await fetchAsDataUrl(logoUrl, token);

    let imagesHtml = '';
    for (const img of images) {
      const imgSrc = await fetchAsDataUrl(img.url || img.previewUrl || '', token);
      const title = img.titre || img.nom_fichier || 'Image';
      imagesHtml += `
        <div class="bloc">
          <img src="${imgSrc || ''}" alt="${title}">
          <p><b>${title}</b></p>
          <p>${img.commentaire_image || ''}</p>
        </div>`;
    }

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport de travail</title>
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
    <p><b>Travail :</b> ${safeMeta.travaux}</p>
    <p><b>Site :</b> ${safeMeta.site}</p>
    <p><b>Affaire :</b> ${safeMeta.affaire}</p>
    <p><b>DOE :</b> ${safeMeta.doe}</p>
    <p><b>Contrat :</b> ${safeMeta.contrat}</p>
  </div>
  <div class="comment-section">
    <p><b>Résumé :</b></p>
    <div style="padding:8px;border-radius:4px;border:1px solid #ccc;background:#fff;">${resumeHtml || '<em>Aucun résumé</em>'}</div>
  </div>
  <div class="grid">
    ${imagesHtml || '<p class="text-muted">Aucune image.</p>'}
  </div>
</body>
</html>`;
  }

  async function fetchTravauxMeta({ travauxId, token } = {}) {
    const safe = {
      client: 'Non renseigné',
      travaux: `Travail #${travauxId || '—'}`,
      site: 'Non renseigné',
      affaire: 'Non renseigné',
      doe: 'Non renseigné',
      contrat: 'Non renseigné',
    };
    if (!travauxId) return safe;

    const fetchJSON = async (url) => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(url, { headers, credentials: 'same-origin' });
      if (!r.ok) return null;
      return r.json().catch(() => null);
    };

    try {
      const t = await fetchJSON(`/api/travaux/${travauxId}`);
      if (t) {
        if (t.titre) safe.travaux = t.titre;
        if (t.date_debut) safe.dateStr = new Date(t.date_debut).toLocaleDateString('fr-FR');

        const siteId = t.site_id;
        const affaireId = t.affaire_id;
        const doeId = t.doe_id;

        if (affaireId) {
          const aff = await fetchJSON(`/api/affaires/${affaireId}`);
          if (aff) safe.affaire = aff.nom_affaire || aff.numero_affaire || safe.affaire;
        }
        if (doeId) {
          const doe = await fetchJSON(`/api/does/${doeId}`);
          if (doe) safe.doe = doe.titre || safe.doe;
        }
        if (siteId) {
          const siteRel = await fetchJSON(`/api/sites/${siteId}/relations`);
          if (siteRel?.site) {
            safe.site = siteRel.site.nom_site || safe.site;
            if (siteRel.site.nom_client) safe.client = siteRel.site.nom_client;
          }
          if (Array.isArray(siteRel?.contrats) && siteRel.contrats.length) {
            safe.contrat = siteRel.contrats[0].titre || safe.contrat;
          }

          if (safe.site === 'Non renseigné' || safe.client === 'Non renseigné') {
            const site = await fetchJSON(`/api/sites/${siteId}`);
            if (site) {
              safe.site = site.nom_site || safe.site;
              const clientId = site.client_id;
              if (clientId) {
                const c = await fetchJSON(`/api/clients/${clientId}`);
                if (c) safe.client = c.nom_client || c.nom || safe.client;
              }
            }
          }
        }
      }
    } catch (_) {
      // ignore, return safe
    }

    return safe;
  }

  window.buildTravauxReportHTML = buildTravauxReportHTML;
  window.fetchTravauxMeta = fetchTravauxMeta;
})();

