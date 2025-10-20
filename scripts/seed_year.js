const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

function fmtMonth(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();
  try {
    // Ensure schema + base seed exist
    try {
      const initSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql')).toString();
      await client.query(initSql);
    } catch (e) { console.warn('Init skipped:', e.message); }
    try {
      const seedSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql')).toString();
      await client.query(seedSql);
    } catch (e) { console.warn('Base seed skipped:', e.message); }

    // Get base references (Site, Affaire, DOE)
    const site = (await client.query("SELECT id, nom_site FROM site ORDER BY id ASC LIMIT 1")).rows[0];
    const affaire = (await client.query("SELECT id, nom_affaire FROM affaire ORDER BY id ASC LIMIT 1")).rows[0];
    let doe = (await client.query("SELECT id, titre FROM doe ORDER BY id ASC LIMIT 1")).rows[0];
    if (!site) throw new Error('No site found to attach demo data');
    if (!affaire) throw new Error('No affaire found to attach demo data');
    if (!doe) {
      const r = await client.query('INSERT INTO doe (site_id, affaire_id, titre, description) VALUES ($1,$2,$3,$4) RETURNING *', [site.id, affaire.id, 'DOE DEMO', 'DOE de démonstration']);
      doe = r.rows[0];
    }

    const now = new Date();
    let createdMaint = 0, createdInterv = 0, createdRdv = 0;
    for (let back = 11; back >= 0; back--) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - back, 1));
      const label = fmtMonth(d); // YYYY-MM
      const titres = [
        `DEMO Maintenance ${label} - A`,
        `DEMO Maintenance ${label} - B`,
        `DEMO Maintenance ${label} - C`,
      ];
      const etats = ['Pas_commence','En_cours','Termine','Bloque'];
      for (let i=0; i<titres.length; i++) {
        const titre = titres[i];
        // Check existence by unique titre
        const exists = (await client.query('SELECT id FROM maintenance WHERE titre=$1', [titre])).rows[0];
        if (exists) continue;
        const etat = etats[(i + d.getMonth()) % etats.length];
        const date_debut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 3 + i*7));
        const mRes = await client.query(
          'INSERT INTO maintenance (doe_id, affaire_id, titre, description, etat, responsable, date_debut) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [doe.id, affaire.id, titre, `Maintenance mensuelle ${label}`, etat, null, date_debut]
        );
        const m = mRes.rows[0];
        createdMaint++;

        // Create 1-3 interventions
        const intervCount = 1 + ((i + d.getUTCMonth()) % 3);
        for (let k=0; k<intervCount; k++) {
          const idesc = `DEMO Intervention ${label}-${k+1} pour ${titre}`;
          const idebut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 10 + k*6));
          const iRes = await client.query(
            'INSERT INTO intervention (maintenance_id, description, date_debut) VALUES ($1,$2,$3) RETURNING *',
            [m.id, idesc, idebut]
          );
          const iv = iRes.rows[0];
          createdInterv++;

          // Create 0-2 rendezvous per intervention
          const rdvCount = (k + i) % 3; // 0..2
          for (let r=0; r<rdvCount; r++) {
            const t = `RDV ${label} - ${k+1}.${r+1}`;
            const rdate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 12 + r*5, 8 + r));
            await client.query(
              'INSERT INTO rendezvous (titre, description, date_debut, date_fin, statut, sujet, date_rdv, heure_rdv, intervention_id, site_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
              [t, 'Visite sur site', rdate, null, 'Planifie', 'Intervention', rdate, '09:00', iv.id, site.id]
            );
            createdRdv++;
          }
        }
      }
      console.log(`Mois ${label}: maintenances +${titres.length} (nouvelles selon existence)`);
    }

    console.log(`Seed annuel terminé. Ajouté: maintenances=${createdMaint}, interventions=${createdInterv}, rendezvous=${createdRdv}`);
  } catch (e) {
    console.error('Seed year failed:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

