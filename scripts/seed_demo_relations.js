const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Ensure minimal reference data
    await c.query("INSERT INTO site (id, nom_site) VALUES (1001, 'Site Alpha') ON CONFLICT (id) DO UPDATE SET nom_site=EXCLUDED.nom_site");
    await c.query("INSERT INTO site (id, nom_site) VALUES (1002, 'Site Beta') ON CONFLICT (id) DO UPDATE SET nom_site=EXCLUDED.nom_site");

    await c.query("INSERT INTO agent (matricule, nom, prenom, email, admin, actif, agence_id) VALUES ('AGT001','Dupont','Jean','jean.dupont@example.com', false, true, 1) ON CONFLICT (matricule) DO UPDATE SET nom=EXCLUDED.nom, prenom=EXCLUDED.prenom, email=EXCLUDED.email, admin=EXCLUDED.admin, actif=EXCLUDED.actif");
    await c.query("INSERT INTO agent (matricule, nom, prenom, email, admin, actif, agence_id) VALUES ('AGT002','Martin','Sophie','sophie.martin@example.com', true, true, 1) ON CONFLICT (matricule) DO UPDATE SET nom=EXCLUDED.nom, prenom=EXCLUDED.prenom, email=EXCLUDED.email, admin=EXCLUDED.admin, actif=EXCLUDED.actif");

    // Create tickets linked to sites and responsible agent
    const t1 = await c.query("INSERT INTO ticket (id, titre, description, site_id, responsable, etat) VALUES (5001,'Maintenance pompe','Remplacement joints',1001,'AGT001','Pas_commence') ON CONFLICT (id) DO UPDATE SET titre=EXCLUDED.titre, description=EXCLUDED.description, site_id=EXCLUDED.site_id, responsable=EXCLUDED.responsable RETURNING id");
    const t2 = await c.query("INSERT INTO ticket (id, titre, description, site_id, responsable, etat) VALUES (5002,'Contrôle clim','Vérification pression',1002,'AGT001','Pas_commence') ON CONFLICT (id) DO UPDATE SET titre=EXCLUDED.titre, description=EXCLUDED.description, site_id=EXCLUDED.site_id, responsable=EXCLUDED.responsable RETURNING id");

    // Interventions with dates to feed the chart
    await c.query("INSERT INTO intervention (id, description, date_debut, date_fin, ticket_id) VALUES (7001,'Joints pompe A','2025-01-10T08:00:00','2025-01-10T12:00:00',$1) ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description, date_debut=EXCLUDED.date_debut, date_fin=EXCLUDED.date_fin, ticket_id=EXCLUDED.ticket_id", [t1.rows[0].id]);
    await c.query("INSERT INTO intervention (id, description, date_debut, date_fin, ticket_id) VALUES (7002,'Test étanchéité','2025-01-11T09:00:00','2025-01-11T11:30:00',$1) ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description, date_debut=EXCLUDED.date_debut, date_fin=EXCLUDED.date_fin, ticket_id=EXCLUDED.ticket_id", [t1.rows[0].id]);
    await c.query("INSERT INTO intervention (id, description, date_debut, date_fin, ticket_id) VALUES (7003,'Contrôle pression zone 1','2025-01-12T13:00:00','2025-01-12T17:30:00',$1) ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description, date_debut=EXCLUDED.date_debut, date_fin=EXCLUDED.date_fin, ticket_id=EXCLUDED.ticket_id", [t2.rows[0].id]);

    await c.query('COMMIT');
    console.log('Demo relations seeded.');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    console.error('Seed demo failed:', e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

run();

