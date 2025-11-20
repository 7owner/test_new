const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const cx = await pool.connect();
  try {
    // Ensure user_id column exists on client table
    const columnCheck = await cx.query("SELECT column_name FROM information_schema.columns WHERE table_name='client' AND column_name='user_id'");
    if (columnCheck.rows.length === 0) {
      await cx.query('ALTER TABLE client ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
      console.log('Added user_id column to client table.');
    }

    // Ensure client_id column exists on site table
    const siteColumnCheck = await cx.query("SELECT column_name FROM information_schema.columns WHERE table_name='site' AND column_name='client_id'");
    if (siteColumnCheck.rows.length === 0) {
      await cx.query('ALTER TABLE site ADD COLUMN client_id INTEGER REFERENCES client(id) ON DELETE SET NULL');
      console.log('Added client_id column to site table.');
    }

    await cx.query('BEGIN');
    const email = 'client1@app.com';
    const roles = ['ROLE_CLIENT'];
    const hashed = '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq';
    // Ensure user exists
    let u = (await cx.query('SELECT id, roles FROM users WHERE email=$1', [email])).rows[0];
    if (!u) {
      u = (await cx.query('INSERT INTO users (email, password, roles) VALUES ($1,$2,$3) RETURNING id, roles', [email, hashed, JSON.stringify(roles)])).rows[0];
      console.log('Created user:', email);
    } else {
      console.log('User exists:', email);
    }
    // Ensure client exists
    let c = (await cx.query('SELECT id FROM client WHERE representant_email=$1 LIMIT 1', [email])).rows[0];
    if (!c) {
      c = (await cx.query("INSERT INTO client (nom_client, representant_nom, representant_email, representant_tel, commentaire) VALUES ('Client Demo','Client One',$1,'0177777777','Compte de demonstration client') RETURNING id", [email])).rows[0];
      console.log('Created client for:', email);
    } else {
      console.log('Client exists for:', email);
    }
    // Set client.user_id
    await cx.query('UPDATE client SET user_id=$1 WHERE id=$2', [u.id, c.id]);
    // Ensure site exists
    let s = (await cx.query('SELECT id FROM site WHERE client_id=$1 AND nom_site=$2', [c.id, 'Site Client Demo'])).rows[0];
    if (!s) {
      s = (await cx.query("INSERT INTO site (client_id, nom_site, statut) VALUES ($1,'Site Client Demo','en attente') RETURNING id", [c.id])).rows[0];
      console.log('Created site for client demo:', s.id);
    }
    // Ensure a demande exists
    const dcnt = (await cx.query('SELECT count(*)::int AS n FROM demande_client WHERE client_id=$1', [c.id])).rows[0].n;
    if (dcnt === 0) {
      await cx.query('INSERT INTO demande_client (client_id, site_id, description, status) VALUES ($1,$2,$3,$4)', [c.id, s.id, 'Demande: verification installation', 'En_attente']);
      console.log('Inserted a demande for client demo');
    }

    // Ensure some agents exist
    const agentCount = (await cx.query('SELECT count(*)::int AS n FROM agent')).rows[0].n;
    if (agentCount === 0) {
        await cx.query(`
            INSERT INTO agent (matricule, nom, prenom, email, admin) VALUES 
            ('AGT001', 'Leclerc', 'Thomas', 'thomas.leclerc@example.com', false),
            ('AGT002', 'Martin', 'Sophie', 'sophie.martin@example.com', true),
            ('AGT003', 'Bernard', 'Pierre', 'pierre.bernard@example.com', false);
        `);
        console.log('Inserted 3 demo agents.');
    }

    await cx.query('COMMIT');
    console.log('Ensure demo client OK');
  } catch (e) {
    try { await cx.query('ROLLBACK'); } catch {}
    console.error('ensure-demo-client failed:', e.message);
    process.exitCode = 1;
  } finally {
    cx.release();
    await pool.end();
  }
}

run();

