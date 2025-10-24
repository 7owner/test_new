require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_dev';

// Middleware
app.use(cors());
app.use(express.json()); // For parsing application/json
// Security headers
app.use((req, res, next) => { res.set('X-Content-Type-Options','nosniff'); next(); });
// Silence missing favicon errors to avoid noisy 404s in console
app.get('/favicon.ico', (_req, res) => res.redirect(302, '/favicon.svg'));
app.use(express.static('public', { setHeaders: (res, filePath, stat) => { try { const ct = res.getHeader('Content-Type'); if (ct && /charset=/i.test(ct)) { res.setHeader('Content-Type', ct.replace(/charset=([^;]+)/i, 'charset=utf-8')); } } catch(_){} try { res.removeHeader('Expires'); res.removeHeader('Pragma'); } catch(_){} res.setHeader('Cache-Control', 'public, max-age=604800, must-revalidate'); res.setHeader('X-Content-Type-Options', 'nosniff'); } })); // Serve static files from 'public' directory
// Ensure uploads directory exists
try {
  const uploadsDir = path.join(__dirname, 'public', 'uploads', 'documents');
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (_) {}

// PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err); // don't let a single error kill the app
    process.exit(-1);
});

// Function to initialize the database schema
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        // Check if schema is already initialized by looking for a known type
        const checkSchemaSql = "SELECT 1 FROM pg_type WHERE typname = 'statut_intervention'";
        const schemaExists = await client.query(checkSchemaSql);

        if (schemaExists.rows.length > 0) {
            console.log('Database schema already initialized. Skipping init.sql execution.');
        } else {
            const schemaSql = fs.readFileSync(path.join(__dirname, 'db', 'init.sql')).toString();
            await client.query(schemaSql);
            console.log('Database schema initialized successfully.');
        }

        // Seed data (idempotent via NOT EXISTS checks)
        try {
            const seedSql = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql')).toString();
            await client.query(seedSql);
            console.log('Database seed executed successfully.');
        } catch (seedErr) {
            console.warn('Database seed skipped/failed:', seedErr.message);
        }
    } catch (err) {
        console.error('Error initializing database schema:', err);
        // process.exit(-1); // Exit if schema creation fails critically
    } finally {
        client.release();
    }
}

// Initialize DB schema on startup (non-fatal if it fails)
initializeDatabase();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // if there isn't any token

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // if the token is no longer valid
        req.user = user;
        next(); // proceed to the next middleware or route handler
    });
};

const authorizeAdmin = (req, res, next) => {
    if (!req.user || !req.user.roles || !req.user.roles.includes('ROLE_ADMIN')) {
        return res.sendStatus(403); // Forbidden if not admin
    }
    next();
};

// Serve login and register pages
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// API Route for user registration
app.post('/api/register', authenticateToken, authorizeAdmin, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password, roles) VALUES ($1, $2, $3) RETURNING *',
            [email, hashedPassword, JSON.stringify(['ROLE_USER'])]
        );
        res.status(201).json({ message: 'User created successfully', user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Route for user login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, roles: user.roles }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ message: 'Login successful', token });
    } catch (err) {
        console.error('Error logging in:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Health endpoint
app.get('/api/health', async (req, res) => {
    try {
        const r = await pool.query('SELECT 1');
        res.json({ ok: true, db: true });
    } catch (e) {
        res.json({ ok: true, db: false });
    }
});

// Dashboard API Route
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const activeTickets = (await pool.query("SELECT COUNT(*) FROM ticket WHERE etat = 'En_cours'")).rows[0].count;
        const ongoingInterventions = (await pool.query('SELECT COUNT(*) FROM intervention')).rows[0].count;
        const activeAgents = (await pool.query("SELECT COUNT(*) FROM agent WHERE actif = true")).rows[0].count;
        const sitesUnderContract = (await pool.query('SELECT COUNT(*) FROM site')).rows[0].count;
        const urgentTickets = (await pool.query("SELECT * FROM ticket WHERE etat = 'Bloque'")).rows;
        const achatsCount = (await pool.query('SELECT COUNT(*) FROM achat')).rows[0].count;
        const facturesCount = (await pool.query('SELECT COUNT(*) FROM facture')).rows[0].count;
        const reglementsCount = (await pool.query('SELECT COUNT(*) FROM reglement')).rows[0].count;

        const monthlyTicketData = (await pool.query("SELECT TO_CHAR(date_debut, 'YYYY-MM') as month, COUNT(id) as count FROM ticket GROUP BY month ORDER BY month ASC")).rows;

        const chartLabels = monthlyTicketData.map(d => d.month);
        const chartData = monthlyTicketData.map(d => d.count);

        const chart = {
            labels: chartLabels,
            datasets: [{
                label: 'Nombre de tickets',
                data: chartData,
                backgroundColor: 'rgba(108, 99, 255, 0.6)',
                borderColor: 'rgba(108, 99, 255, 1)',
                borderWidth: 1
            }]
        };

        res.json({
            activeTickets,
            ongoingInterventions,
            activeAgents,
            sitesUnderContract,
            urgentTickets,
            chartData: chart,
            achatsCount,
            facturesCount,
            reglementsCount
        });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Documents API --------------------
// List documents (optionally filter by cible_type & cible_id)
app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { cible_type, cible_id } = req.query;
    let sql = 'SELECT d.*, a.nom as auteur_nom FROM documents_repertoire d LEFT JOIN agent a ON a.matricule = d.auteur_matricule';
    const params = [];
    if (cible_type && cible_id) {
      sql += ' WHERE d.cible_type = $1 AND d.cible_id = $2 ORDER BY d.id DESC';
      params.push(cible_type, cible_id);
    } else {
      sql += ' ORDER BY d.id DESC';
    }
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get document metadata
app.get('/api/documents/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM documents_repertoire WHERE id = $1', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Upload document via JSON base64 and save to disk
app.post('/api/documents', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { cible_type, cible_id, nature, nom_fichier, type_mime, base64, auteur_matricule } = req.body;
    if (!cible_type || !cible_id || !nom_fichier) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    let taille_octets = null, chemin_fichier = null, checksum_sha256 = null;
    if (base64) {
      const buffer = Buffer.from(base64, 'base64');
      taille_octets = buffer.length;
      checksum_sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const ext = path.extname(nom_fichier) || '';
      const safeName = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
      const relPath = path.join('uploads', 'documents', safeName);
      const absPath = path.join(__dirname, 'public', relPath);
      fs.writeFileSync(absPath, buffer);
      chemin_fichier = relPath.replace(/\\/g,'/');
    }
    const result = await pool.query(
      `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, chemin_fichier, checksum_sha256, auteur_matricule)
       VALUES ($1,$2,COALESCE($3,'Document'),$4,COALESCE($5,'application/octet-stream'),$6,$7,$8,$9) RETURNING *`,
      [cible_type, cible_id, nature, nom_fichier, type_mime || null, taille_octets, chemin_fichier, checksum_sha256, auteur_matricule || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error uploading document:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update document metadata (no file move)
app.put('/api/documents/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { cible_type, cible_id, nature, nom_fichier, type_mime } = req.body;
  try {
    const result = await pool.query(
      'UPDATE documents_repertoire SET cible_type=$1, cible_id=$2, nature=$3, nom_fichier=$4, type_mime=$5 WHERE id=$6 RETURNING *',
      [cible_type, cible_id, nature, nom_fichier, type_mime || null, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating document:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Stream document
app.get('/api/documents/:id/view', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM documents_repertoire WHERE id = $1', [id]);
    const doc = result.rows[0];
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const absPath = path.join(__dirname, 'public', doc.chemin_fichier);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File missing' });
    res.setHeader('Content-Type', doc.type_mime || 'application/octet-stream');
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    console.error('Error viewing document:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Download document (attachment)
app.get('/api/documents/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM documents_repertoire WHERE id = $1', [id]);
    const doc = result.rows[0];
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const absPath = path.join(__dirname, 'public', doc.chemin_fichier);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File missing' });
    res.setHeader('Content-Type', doc.type_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nom_fichier)}"`);
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    console.error('Error downloading document:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/documents/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM documents_repertoire WHERE id = $1 RETURNING *', [id]);
    const doc = result.rows[0];
    if (doc) {
      try { fs.unlinkSync(path.join(__dirname, 'public', doc.chemin_fichier)); } catch (_) {}
    }
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Images API --------------------
// List images (no blobs)
app.get('/api/images', authenticateToken, async (req, res) => {
  try {
    const { cible_type, cible_id } = req.query;
    let sql = 'SELECT id, nom_fichier, type_mime, taille_octets, commentaire_image, auteur_matricule, cible_type, cible_id, date_debut, date_fin FROM images';
    const params = [];
    if (cible_type && cible_id) { sql += ' WHERE cible_type = $1 AND cible_id = $2'; params.push(cible_type, cible_id); }
    sql += ' ORDER BY id DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching images:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get image bytes
app.get('/api/images/:id/view', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT image_blob, type_mime FROM images WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', row.type_mime || 'image/jpeg');
    res.end(row.image_blob, 'binary');
  } catch (err) {
    console.error('Error serving image:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Upload image (JSON base64)
app.post('/api/images', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { nom_fichier, type_mime, base64, commentaire_image, auteur_matricule, cible_type, cible_id } = req.body;
    if (!nom_fichier || !base64) return res.status(400).json({ error: 'Missing required fields' });
    const buffer = Buffer.from(base64, 'base64');
    const taille_octets = buffer.length;
    const result = await pool.query(
      `INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
       VALUES ($1, COALESCE($2,'image/jpeg'), $3, $4, $5, $6, $7, $8) RETURNING id, nom_fichier, type_mime, taille_octets, commentaire_image, auteur_matricule, cible_type, cible_id` ,
      [nom_fichier, type_mime, taille_octets, buffer, commentaire_image || null, auteur_matricule || null, cible_type || null, cible_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error uploading image:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete image
app.delete('/api/images/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM images WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Relations: Site --------------------
app.get('/api/sites/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const site = (await pool.query('SELECT * FROM site WHERE id=$1', [id])).rows[0];
    if (!site) return res.status(404).json({ error: 'Site not found' });
    const affaires = (await pool.query('SELECT af.* FROM site_affaire sa JOIN affaire af ON sa.affaire_id=af.id WHERE sa.site_id=$1 ORDER BY af.id DESC', [id])).rows;
    const does = (await pool.query('SELECT d.* FROM doe d WHERE d.site_id=$1 ORDER BY d.id DESC', [id])).rows;
    const tickets = (await pool.query('SELECT m.* FROM ticket m JOIN doe d ON m.doe_id=d.id WHERE d.site_id=$1 ORDER BY m.id DESC', [id])).rows;
    const adresse = site.adresse_id ? (await pool.query('SELECT * FROM adresse WHERE id=$1', [site.adresse_id])).rows[0] : null;
    const rendezvous = (await pool.query('SELECT * FROM rendezvous WHERE site_id=$1 ORDER BY date_rdv DESC, id DESC', [id])).rows;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Site' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Site' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    res.json({ site, adresse, affaires, does, tickets, rendezvous, documents, images });
  } catch (err) {
    console.error('Error fetching site relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Relations: DOE --------------------
app.get('/api/does/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const doe = (await pool.query('SELECT * FROM doe WHERE id=$1', [id])).rows[0];
    if (!doe) return res.status(404).json({ error: 'DOE not found' });
    const tickets = (await pool.query('SELECT * FROM ticket WHERE doe_id=$1 ORDER BY id DESC', [id])).rows;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Doe' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Doe' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    res.json({ doe, tickets, documents, images });
  } catch (err) {
    console.error('Error fetching doe relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Relations: Ticket --------------------
app.get('/api/tickets/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const m = (await pool.query('SELECT * FROM ticket WHERE id=$1', [id])).rows[0];
    if (!m) return res.status(404).json({ error: 'Ticket not found' });
    const doe = m.doe_id ? (await pool.query('SELECT * FROM doe WHERE id=$1', [m.doe_id])).rows[0] : null;
    const affaire = m.affaire_id ? (await pool.query('SELECT * FROM affaire WHERE id=$1', [m.affaire_id])).rows[0] : null;
    const site = doe && doe.site_id ? (await pool.query('SELECT * FROM site WHERE id=$1', [doe.site_id])).rows[0] : null;
    const interventions = (await pool.query('SELECT * FROM intervention WHERE ticket_id=$1 ORDER BY id DESC', [id])).rows;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Ticket' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Ticket' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    res.json({ ticket: m, doe, affaire, site, interventions, documents, images });
  } catch (err) {
    console.error('Error fetching ticket relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Relations: Intervention --------------------
app.get('/api/interventions/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const intervention = (await pool.query('SELECT * FROM intervention WHERE id=$1', [id])).rows[0];
    if (!intervention) return res.status(404).json({ error: 'Intervention not found' });

    const ticket = intervention.ticket_id
      ? (await pool.query('SELECT * FROM ticket WHERE id=$1', [intervention.ticket_id])).rows[0]
      : null;
    let doe = null; let site = null; let affaire = null;
    if (ticket && ticket.doe_id) {
      doe = (await pool.query('SELECT * FROM doe WHERE id=$1', [ticket.doe_id])).rows[0] || null;
      if (doe && doe.site_id) {
        site = (await pool.query('SELECT * FROM site WHERE id=$1', [doe.site_id])).rows[0] || null;
      }
    }
    if (ticket && ticket.affaire_id) {
      affaire = (await pool.query('SELECT * FROM affaire WHERE id=$1', [ticket.affaire_id])).rows[0] || null;
    }

    const rendezvous = (await pool.query('SELECT * FROM rendezvous WHERE intervention_id=$1 ORDER BY date_rdv DESC, id DESC', [id])).rows;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Intervention' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Intervention' AND cible_id=$1 ORDER BY id DESC", [id])).rows;

    res.json({ intervention, ticket, doe, site, affaire, rendezvous, documents, images });
  } catch (err) {
    console.error('Error fetching intervention relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Relations: Agent --------------------
app.get('/api/agents/:matricule/relations', authenticateToken, async (req, res) => {
  const { matricule } = req.params;
  try {
    const agent = (await pool.query('SELECT * FROM agent WHERE matricule=$1', [matricule])).rows[0];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const passeport = (await pool.query('SELECT * FROM passeport WHERE agent_matricule=$1', [matricule])).rows[0] || null;
    const formations = (await pool.query('SELECT * FROM formation WHERE agent_matricule=$1 ORDER BY id DESC', [matricule])).rows;
    res.json({ agent, passeport, formations });
  } catch (err) {
    console.error('Error fetching agent relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Relations: Rendezvous --------------------
app.get('/api/rendezvous/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const rdv = (await pool.query('SELECT * FROM rendezvous WHERE id=$1', [id])).rows[0];
    if (!rdv) return res.status(404).json({ error: 'Rendezvous not found' });
    const intervention = rdv.intervention_id ? (await pool.query('SELECT * FROM intervention WHERE id=$1', [rdv.intervention_id])).rows[0] : null;
    const site = rdv.site_id ? (await pool.query('SELECT * FROM site WHERE id=$1', [rdv.site_id])).rows[0] : null;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='RendezVous' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='RendezVous' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    res.json({ rendezvous: rdv, intervention, site, documents, images });
  } catch (err) {
    console.error('Error fetching rendezvous relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Clients API --------------------
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT c.*, a.libelle as adresse_libelle FROM client c LEFT JOIN adresse a ON c.adresse_id = a.id ORDER BY c.nom_client ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/clients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM client WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error fetching client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/clients', authenticateToken, authorizeAdmin, async (req, res) => {
  const { nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO client (nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [nom_client, representant_nom, representant_email, representant_tel, adresse_id || null, commentaire || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire } = req.body;
  try {
    const result = await pool.query(
      'UPDATE client SET nom_client=$1, representant_nom=$2, representant_email=$3, representant_tel=$4, adresse_id=$5, commentaire=$6 WHERE id=$7 RETURNING *',
      [nom_client, representant_nom, representant_email, representant_tel, adresse_id || null, commentaire || null, id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.delete('/api/clients/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM client WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Sites API --------------------
app.get('/api/sites', authenticateToken, async (req, res) => {
  try {
    const { overview } = req.query;
    if (overview) {
      const result = await pool.query(`
        SELECT 
          s.*, 
          a.libelle as adresse_libelle,
          COALESCE((SELECT COUNT(*) FROM site_affaire sa WHERE sa.site_id = s.id), 0) AS affaires_count,
          COALESCE((SELECT COUNT(*) FROM doe d WHERE d.site_id = s.id), 0) AS does_count,
          COALESCE((SELECT COUNT(*) FROM ticket m JOIN doe d2 ON m.doe_id = d2.id WHERE d2.site_id = s.id), 0) AS tickets_count,
          (SELECT MAX(m.date_debut) FROM ticket m JOIN doe d3 ON m.doe_id = d3.id WHERE d3.site_id = s.id) AS last_ticket_date
        FROM site s
        LEFT JOIN adresse a ON s.adresse_id = a.id
        ORDER BY s.id DESC`);
      return res.json(result.rows);
    }
    const result = await pool.query('SELECT s.*, a.libelle as adresse_libelle FROM site s LEFT JOIN adresse a ON s.adresse_id = a.id ORDER BY s.id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sites:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/sites/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM site WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error fetching site:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/sites', authenticateToken, authorizeAdmin, async (req, res) => {
  const { nom_site, adresse_id, commentaire } = req.body;
  try {
    const result = await pool.query('INSERT INTO site (nom_site, adresse_id, commentaire) VALUES ($1,$2,$3) RETURNING *', [nom_site, adresse_id || null, commentaire || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating site:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.delete('/api/sites/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM site WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting site:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Link Site <-> Affaire
app.post('/api/site_affaire', authenticateToken, authorizeAdmin, async (req, res) => {
  const { site_id, affaire_id } = req.body;
  if (!site_id || !affaire_id) return res.status(400).json({ error: 'Missing site_id or affaire_id' });
  try {
    const r = await pool.query('INSERT INTO site_affaire (site_id, affaire_id) VALUES ($1,$2) ON CONFLICT (site_id, affaire_id) DO NOTHING RETURNING *', [site_id, affaire_id]);
    res.status(r.rows[0] ? 201 : 200).json(r.rows[0] || { message: 'Already linked' });
  } catch (err) {
    console.error('Error linking site_affaire:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.delete('/api/site_affaire', authenticateToken, authorizeAdmin, async (req, res) => {
  const { site_id, affaire_id } = req.body;
  try {
    await pool.query('DELETE FROM site_affaire WHERE site_id=$1 AND affaire_id=$2', [site_id, affaire_id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error unlinking site_affaire:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Affaires API --------------------
app.get('/api/affaires', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT af.*, c.nom_client as client_nom FROM affaire af LEFT JOIN client c ON af.client_id = c.id ORDER BY af.id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching affaires:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/affaires/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM affaire WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error fetching affaire:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/affaires', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query('INSERT INTO affaire (nom_affaire, client_id, description) VALUES ($1,$2,$3) RETURNING *', [nom_affaire, client_id || null, description || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating affaire:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.put('/api/affaires/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { nom_affaire, client_id, description } = req.body;
  try {
    const result = await pool.query('UPDATE affaire SET nom_affaire=$1, client_id=$2, description=$3 WHERE id=$4 RETURNING *', [nom_affaire, client_id || null, description || null, id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error updating affaire:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.delete('/api/affaires/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM affaire WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting affaire:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- DOE API --------------------
app.get('/api/does', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT d.*, s.nom_site as site_nom, af.nom_affaire as affaire_nom FROM doe d JOIN site s ON d.site_id=s.id JOIN affaire af ON d.affaire_id = af.id ORDER BY d.id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching does:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/does/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM doe WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error fetching doe:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/does', authenticateToken, authorizeAdmin, async (req, res) => {
  const { site_id, affaire_id, titre, description } = req.body;
  if (!site_id || !affaire_id || !titre) return res.status(400).json({ error: 'Missing site_id, affaire_id or titre' });
  try {
    const result = await pool.query('INSERT INTO doe (site_id, affaire_id, titre, description) VALUES ($1,$2,$3,$4) RETURNING *', [site_id, affaire_id, titre, description || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating doe:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.put('/api/does/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { site_id, affaire_id, titre, description } = req.body;
  try {
    const result = await pool.query('UPDATE doe SET site_id=$1, affaire_id=$2, titre=$3, description=$4 WHERE id=$5 RETURNING *', [site_id, affaire_id, titre, description || null, id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error updating doe:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.delete('/api/does/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM doe WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting doe:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API Routes for Agences (CRUD)
app.get('/api/agences', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM agence ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching agences:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/agences', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, designation, telephone, email } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO agence (titre, designation, telephone, email) VALUES ($1, $2, $3, $4) RETURNING *',
            [titre, designation, telephone, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating agence:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/agences/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { titre, designation, telephone, email } = req.body;
    try {
        const result = await pool.query(
            'UPDATE agence SET titre = $1, designation = $2, telephone = $3, email = $4 WHERE id = $5 RETURNING *',
            [titre, designation, telephone, email, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Agence not found' });
        }
    } catch (err) {
        console.error(`Error updating agence with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/agences/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM agence WHERE id = $1', [id]);
        res.status(204).send(); // No Content
    } catch (err) {
        console.error(`Error deleting agence with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Agents (CRUD)
app.get('/api/agents', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT agent.*, agence.titre as agence_titre FROM agent JOIN agence ON agent.agence_id = agence.id ORDER BY agent.nom ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching agents:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/agents', authenticateToken, authorizeAdmin, async (req, res) => {
    const { matricule, nom, email, agence_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO agent (matricule, nom, email, agence_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [matricule, nom, email, agence_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating agent:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
    const { matricule } = req.params;
    const { nom, email, agence_id } = req.body; // Only allow updating these fields for simplicity
    try {
        const result = await pool.query(
            'UPDATE agent SET nom = $1, email = $2, agence_id = $3 WHERE matricule = $4 RETURNING *',
            [nom, email, agence_id, matricule]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Agent not found' });
        }
    } catch (err) {
        console.error(`Error updating agent with matricule ${matricule}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
    const { matricule } = req.params;
    try {
        await pool.query('DELETE FROM agent WHERE matricule = $1', [matricule]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting agent with matricule ${matricule}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Route for inviting agents and assigning to intervention
app.post('/api/invite-agent', authenticateToken, authorizeAdmin, async (req, res) => {
    const { email, intervention_id } = req.body;
    if (!email || !intervention_id) {
        return res.status(400).json({ error: 'Email and intervention_id are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find or create user
        let userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        let userId;
        if (userResult.rows.length === 0) {
            // User does not exist, create a new one with a temporary password
            const tempPassword = Math.random().toString(36).slice(-8); // Generate a random password
            const hashedPassword = await bcrypt.hash(tempPassword, 10);
            const newUser = await client.query(
                'INSERT INTO users (email, password, roles) VALUES ($1, $2, $3) RETURNING id',
                [email, hashedPassword, JSON.stringify(['ROLE_USER'])]
            );
            userId = newUser.rows[0].id;
            // In a real app, you'd email the tempPassword to the user
            console.log(`New user created: ${email} with temp password: ${tempPassword}`);
        } else {
            userId = userResult.rows[0].id;
        }

        // 2. Find or create agent and link to user
        let agentResult = await client.query('SELECT matricule FROM agent WHERE user_id = $1', [userId]);
        let agentMatricule;
        if (agentResult.rows.length === 0) {
            // Agent does not exist, create a new one
            const newMatricule = `AGT${Math.floor(100 + Math.random() * 900)}`; // Simple random matricule
            const newAgent = await client.query(
                'INSERT INTO agent (matricule, nom, prenom, email, agence_id, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING matricule',
                [newMatricule, 'Invité', 'Agent', email, 1, userId] // Assuming agence_id 1 exists
            );
            agentMatricule = newAgent.rows[0].matricule;
        } else {
            agentMatricule = agentResult.rows[0].matricule;
        }

        // 3. Link agent to intervention (e.g., set as responsible for a new ticket related to intervention)
        // This part is conceptual. A direct link between agent and intervention might be via a junction table
        // or by assigning the agent as responsible for a ticket related to the intervention.
        // For now, let's assume we update an existing intervention or create a new one.
        // A more robust solution would involve a specific junction table or a more complex assignment logic.
        const interventionExists = await client.query('SELECT id FROM intervention WHERE id = $1', [intervention_id]);
        if (interventionExists.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Intervention not found' });
        }

        // Example: Assign the agent as responsible for a new ticket linked to this intervention
        // This requires creating a new ticket and linking it to the intervention and agent.
        // This is a simplified example. Real logic might be more complex.
        const newTicketTitle = `Ticket pour intervention ${intervention_id} - Agent ${agentMatricule}`;
        const newTicket = await client.query(
            'INSERT INTO ticket (doe_id, affaire_id, titre, description, etat, responsable) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [1, 1, newTicketTitle, 'Nouvelle tâche pour agent invité', 'Pas_commence', agentMatricule] // Assuming doe_id 1 and affaire_id 1 exist
        );
        const newTicketId = newTicket.rows[0].id;

        // Update the intervention to reference this new ticket (if applicable, or create a new intervention)
        // For simplicity, let's just return the new ticket info.

        await client.query('COMMIT');
        res.status(201).json({ message: 'Agent invited and assigned', userEmail: email, agentMatricule: agentMatricule, newTicketId: newTicketId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error inviting agent:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// API Route for user to request affiliation to an intervention
app.post('/api/request-affiliation', authenticateToken, async (req, res) => {
    const { intervention_id } = req.body;
    const userEmail = req.user.email; // Email of the authenticated user

    if (!intervention_id) {
        return res.status(400).json({ error: 'Intervention ID is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find the user's agent matricule
        const agentResult = await client.query('SELECT matricule FROM agent WHERE email = $1', [userEmail]);
        if (agentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Agent not found for this user' });
        }
        const agentMatricule = agentResult.rows[0].matricule;

        // 2. Check if intervention exists
        const interventionExists = await client.query('SELECT id FROM intervention WHERE id = $1', [intervention_id]);
        if (interventionExists.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Intervention not found' });
        }

        // 3. Create a new ticket for this affiliation request
        // This is a simplified approach. In a real app, this might create a pending request
        // that an admin needs to approve.
        const newTicketTitle = `Demande d'affiliation pour intervention ${intervention_id} par ${userEmail}`;
        const newTicketDescription = `L'agent ${agentMatricule} (${userEmail}) demande à être affilié à l'intervention ${intervention_id}.`;

        const newTicket = await client.query(
            'INSERT INTO ticket (doe_id, affaire_id, titre, description, etat, responsable) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [1, 1, newTicketTitle, newTicketDescription, 'En_attente', agentMatricule] // Assuming default doe_id 1 and affaire_id 1
        );
        const newTicketId = newTicket.rows[0].id;

        await client.query('COMMIT');
        res.status(201).json({ message: 'Affiliation request submitted', newTicketId: newTicketId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error submitting affiliation request:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// API Routes for Adresses (CRUD)
app.get('/api/adresses', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM adresse ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching adresses:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/adresses', authenticateToken, authorizeAdmin, async (req, res) => {
    const { libelle, ligne1, code_postal, ville, pays } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [libelle, ligne1, code_postal, ville, pays]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating adresse:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/adresses/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM adresse WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting adresse with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Clients (CRUD)
app.get('/api/clients', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT client.*, adresse.libelle as adresse_libelle FROM client LEFT JOIN adresse ON client.adresse_id = adresse.id ORDER BY client.nom_client ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching clients:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
    const { nom_client, representant_nom, adresse_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO client (nom_client, representant_nom, adresse_id) VALUES ($1, $2, $3) RETURNING *',
            [nom_client, representant_nom, adresse_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating client:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM client WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting client with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Sites (CRUD)
app.get('/api/sites', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT site.*, adresse.libelle as adresse_libelle FROM site LEFT JOIN adresse ON site.adresse_id = adresse.id ORDER BY site.nom_site ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sites:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/sites', authenticateToken, async (req, res) => {
    const { nom_site, adresse_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO site (nom_site, adresse_id) VALUES ($1, $2) RETURNING *',
            [nom_site, adresse_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating site:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/sites/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { nom_site, adresse_id } = req.body;
    try {
        const result = await pool.query(
            'UPDATE site SET nom_site = $1, adresse_id = $2 WHERE id = $3 RETURNING *',
            [nom_site, adresse_id, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Site not found' });
        }
    } catch (err) {
        console.error(`Error updating site with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/sites/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM site WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting site with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Tickets (CRUD)
app.get('/api/tickets', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ticket ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching tickets:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/tickets', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, description } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO ticket (titre, description) VALUES ($1, $2) RETURNING *',
            [titre, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating ticket:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/tickets/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { titre, description, responsable } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const oldTicketResult = await client.query('SELECT responsable FROM ticket WHERE id = $1', [id]);
        const oldResponsable = oldTicketResult.rows[0]?.responsable;

        const result = await client.query(
            'UPDATE ticket SET titre = $1, description = $2, responsable = $3 WHERE id = $4 RETURNING *',
            [titre, description, responsable, id]
        );

        if (result.rows.length > 0) {
            if (oldResponsable !== responsable) {
                await client.query(
                    'INSERT INTO ticket_historique_responsable (ticket_id, ancien_responsable_matricule, nouveau_responsable_matricule, modifie_par_matricule) VALUES ($1, $2, $3, $4)',
                    [id, oldResponsable, responsable, req.user.email] // Assuming req.user.email holds the modifier's identifier
                );
            }
            await client.query('COMMIT');
            res.json(result.rows[0]);
        } else {
            await client.query('ROLLBACK');
            res.status(404).json({ error: 'Ticket not found' });
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error updating ticket with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

app.delete('/api/tickets/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM ticket WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting ticket with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Interventions (CRUD)
app.get('/api/interventions', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT intervention.*, ticket.titre as ticket_titre FROM intervention JOIN ticket ON intervention.ticket_id = ticket.id ORDER BY intervention.id ASC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching interventions:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/interventions', authenticateToken, authorizeAdmin, async (req, res) => {
    const { description, date_debut, date_fin = null, ticket_id, intervention_precedente_id = null } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO intervention (description, date_debut, date_fin, ticket_id, intervention_precedente_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [description, date_debut, date_fin, ticket_id, intervention_precedente_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating intervention:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/interventions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { description, date_debut, date_fin = null, ticket_id, intervention_precedente_id = null } = req.body;
    try {
        const result = await pool.query(
            'UPDATE intervention SET description = $1, date_debut = $2, date_fin = $3, ticket_id = $4, intervention_precedente_id = $5 WHERE id = $6 RETURNING *',
            [description, date_debut, date_fin, ticket_id, intervention_precedente_id, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: `Intervention with id ${id} not found` });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating intervention with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/interventions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM intervention WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting intervention with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});app.get('/api/rendezvous', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT rendezvous.*, intervention.description as intervention_description, site.nom_site as site_nom FROM rendezvous JOIN intervention ON rendezvous.intervention_id = intervention.id JOIN site ON rendezvous.site_id = site.id ORDER BY rendezvous.date_rdv ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching rendezvous:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/rendezvous', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, date_rdv, intervention_id, site_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO rendezvous (titre, date_rdv, intervention_id, site_id, statut, sujet, date_debut, date_fin) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *',
            [titre, date_rdv, intervention_id, site_id, 'Planifie', 'intervention']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating rendezvous:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/rendezvous/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { titre, date_rdv, intervention_id, site_id, statut, sujet } = req.body;
    try {
        const result = await pool.query(
            'UPDATE rendezvous SET titre = $1, date_rdv = $2, intervention_id = $3, site_id = $4, statut = $5, sujet = $6 WHERE id = $7 RETURNING *',
            [titre, date_rdv, intervention_id, site_id, statut, sujet, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Rendezvous not found' });
        }
    } catch (err) {
        console.error(`Error updating rendezvous with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/rendezvous/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM rendezvous WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting rendezvous with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Affaires (CRUD)
app.get('/api/affaires', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT affaire.*, client.nom_client FROM affaire JOIN client ON affaire.client_id = client.id ORDER BY affaire.nom_affaire ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching affaires:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/affaires', authenticateToken, async (req, res) => {
    const { nom_affaire, description, client_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO affaire (nom_affaire, description, client_id) VALUES ($1, $2, $3) RETURNING *',
            [nom_affaire, description, client_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating affaire:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/affaires/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { nom_affaire, description, client_id } = req.body;
    try {
        const result = await pool.query(
            'UPDATE affaire SET nom_affaire = $1, description = $2, client_id = $3 WHERE id = $4 RETURNING *',
            [nom_affaire, description, client_id, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Affaire not found' });
        }
    } catch (err) {
        console.error(`Error updating affaire with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/affaires/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM affaire WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting affaire with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for DOE (CRUD)
app.get('/api/does', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT doe.*, site.nom_site, affaire.nom_affaire FROM doe JOIN site ON doe.site_id = site.id JOIN affaire ON doe.affaire_id = affaire.id ORDER BY doe.titre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching does:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/does', authenticateToken, async (req, res) => {
    const { titre, description, site_id, affaire_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO doe (titre, description, site_id, affaire_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [titre, description, site_id, affaire_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating doe:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/does/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { titre, description, site_id, affaire_id } = req.body;
    try {
        const result = await pool.query(
            'UPDATE doe SET titre = $1, description = $2, site_id = $3, affaire_id = $4 WHERE id = $5 RETURNING *',
            [titre, description, site_id, affaire_id, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'DOE not found' });
        }
    } catch (err) {
        console.error(`Error updating DOE with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/does/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM doe WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting doe with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Documents (CRUD)
app.get('/api/documents', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM documents_repertoire ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/documents', authenticateToken, async (req, res) => {
    const { nom_fichier, cible_type, cible_id, nature, type_mime } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO documents_repertoire (nom_fichier, cible_type, cible_id, nature, type_mime) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [nom_fichier, cible_type, cible_id, nature, type_mime]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/documents/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { nom_fichier, cible_type, cible_id, nature, type_mime } = req.body;
    try {
        const result = await pool.query(
            'UPDATE documents_repertoire SET nom_fichier = $1, cible_type = $2, cible_id = $3, nature = $4, type_mime = $5 WHERE id = $6 RETURNING *',
            [nom_fichier, cible_type, cible_id, nature, type_mime, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Document not found' });
        }
    } catch (err) {
        console.error(`Error updating document with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/documents/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM documents_repertoire WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting document with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Passeports (CRUD)
app.get('/api/passeports', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT passeport.*, agent.nom as agent_nom FROM passeport JOIN agent ON passeport.agent_matricule = agent.matricule ORDER BY passeport.id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching passeports:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/passeports', authenticateToken, authorizeAdmin, async (req, res) => {
    const { agent_matricule, permis, habilitations, certifications, commentaire } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO passeport (agent_matricule, permis, habilitations, certifications, commentaire) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [agent_matricule, permis, habilitations, certifications, commentaire]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating passeport:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/passeports/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { agent_matricule, permis, habilitations, certifications, commentaire } = req.body;
    try {
        const result = await pool.query(
            'UPDATE passeport SET agent_matricule = $1, permis = $2, habilitations = $3, certifications = $4, commentaire = $5 WHERE id = $6 RETURNING *',
            [agent_matricule, permis, habilitations, certifications, commentaire, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Passeport not found' });
        }
    } catch (err) {
        console.error(`Error updating passeport with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/passeports/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM passeport WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting passeport with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Formations (CRUD)
app.get('/api/formations', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT formation.*, agent.nom as agent_nom FROM formation JOIN agent ON formation.agent_matricule = agent.matricule ORDER BY formation.id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching formations:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/formations', authenticateToken, authorizeAdmin, async (req, res) => {
    const { agent_matricule, type, libelle, date_obtention, date_expiration, organisme, commentaire } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO formation (agent_matricule, type, libelle, date_obtention, date_expiration, organisme, commentaire) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [agent_matricule, type, libelle, date_obtention, date_expiration, organisme, commentaire]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating formation:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/formations/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { agent_matricule, type, libelle, date_obtention, date_expiration, organisme, commentaire } = req.body;
    try {
        const result = await pool.query(
            'UPDATE formation SET agent_matricule = $1, type = $2, libelle = $3, date_obtention = $4, date_expiration = $5, organisme = $6, commentaire = $7 WHERE id = $8 RETURNING *',
            [agent_matricule, type, libelle, date_obtention, date_expiration, organisme, commentaire, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Formation not found' });
        }
    } catch (err) {
        console.error(`Error updating formation with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/formations/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM formation WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting formation with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Basic API Route
app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ message: 'Hello from backend!', dbTime: result.rows[0].now });
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// API Routes for Adresses
app.get('/api/adresses', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM adresse ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching adresses:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/adresses/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM adresse WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Adresse not found' });
        }
    } catch (err) {
        console.error(`Error fetching adresse with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/adresses', async (req, res) => {
    const { libelle, ligne1, ligne2, code_postal, ville, region, pays } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO adresse (libelle, ligne1, ligne2, code_postal, ville, region, pays) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING * ',
            [libelle, ligne1, ligne2, code_postal, ville, region, pays]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating adresse:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/adresses/:id', async (req, res) => {
    const { id } = req.params;
    const { libelle, ligne1, ligne2, code_postal, ville, region, pays } = req.body;
    try {
        const result = await pool.query(
            'UPDATE adresse SET libelle = $1, ligne1 = $2, ligne2 = $3, code_postal = $4, ville = $5, region = $6, pays = $7 WHERE id = $8 RETURNING * ',
            [libelle, ligne1, ligne2, code_postal, ville, region, pays, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Adresse not found' });
        }
    } catch (err) {
        console.error(`Error updating adresse with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/adresses/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM adresse WHERE id = $1 RETURNING * ', [id]);
        if (result.rows.length > 0) {
            res.json({ message: 'Adresse deleted successfully', adresse: result.rows[0] });
        } else {
            res.status(404).json({ error: 'Adresse not found' });
        }
    } catch (err) {
        console.error(`Error deleting adresse with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Agences
app.get('/api/agences', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM agence ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching agences:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/agences/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM agence WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Agence not found' });
        }
    } catch (err) {
        console.error(`Error fetching agence with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/agences', async (req, res) => {
    const { titre, designation, adresse_id, telephone, email } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO agence (titre, designation, adresse_id, telephone, email) VALUES ($1, $2, $3, $4, $5) RETURNING * ',
            [titre, designation, adresse_id, telephone, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating agence:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/agences/:id', async (req, res) => {
    const { id } = req.params;
    const { titre, designation, adresse_id, telephone, email } = req.body;
    try {
        const result = await pool.query(
            'UPDATE agence SET titre = $1, designation = $2, adresse_id = $3, telephone = $4, email = $5 WHERE id = $6 RETURNING * ',
            [titre, designation, adresse_id, telephone, email, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Agence not found' });
        }
    } catch (err) {
        console.error(`Error updating agence with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/agences/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM agence WHERE id = $1 RETURNING * ', [id]);
        if (result.rows.length > 0) {
            res.json({ message: 'Agence deleted successfully', agence: result.rows[0] });
        } else {
            res.status(404).json({ error: 'Agence not found' });
        }
    } catch (err) {
        console.error(`Error deleting agence with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Clients
app.get('/api/clients', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM client ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching clients:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/clients/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM client WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Client not found' });
        }
    } catch (err) {
        console.error(`Error fetching client with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/clients', async (req, res) => {
    const { nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO client (nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire) VALUES ($1, $2, $3, $4, $5, $6) RETURNING * ',
            [nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating client:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/clients/:id', async (req, res) => {
    const { id } = req.params;
    const { nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire } = req.body;
    try {
        const result = await pool.query(
            'UPDATE client SET nom_client = $1, representant_nom = $2, representant_email = $3, representant_tel = $4, adresse_id = $5, commentaire = $6 WHERE id = $7 RETURNING * ',
            [nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Client not found' });
        }
    } catch (err) {
        console.error(`Error updating client with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/clients/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM client WHERE id = $1 RETURNING * ', [id]);
        if (result.rows.length > 0) {
            res.json({ message: 'Client deleted successfully', client: result.rows[0] });
        } else {
            res.status(404).json({ error: 'Client not found' });
        }
    } catch (err) {
        console.error(`Error deleting client with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Organisation: Equipes --------------------
app.get('/api/equipes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT e.*, a.titre as agence_titre FROM equipe e JOIN agence a ON e.agence_id=a.id ORDER BY e.id DESC');
    res.json(result.rows);
  } catch (err) { console.error('Error fetching equipes:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/equipes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM equipe WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error('Error fetching equipe:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/equipes', authenticateToken, authorizeAdmin, async (req, res) => {
  const { agence_id, nom, description } = req.body;
  if (!agence_id || !nom) return res.status(400).json({ error: 'agence_id and nom are required' });
  try {
    const r = await pool.query('INSERT INTO equipe (agence_id, nom, description) VALUES ($1,$2,$3) RETURNING *', [agence_id, nom, description || null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error('Error creating equipe:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.put('/api/equipes/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agence_id, nom, description } = req.body;
  try {
    const r = await pool.query('UPDATE equipe SET agence_id=$1, nom=$2, description=$3 WHERE id=$4 RETURNING *', [agence_id || null, nom || null, description || null, id]);
    res.json(r.rows[0] || null);
  } catch (err) { console.error('Error updating equipe:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/equipes/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try { await pool.query('DELETE FROM equipe WHERE id=$1', [id]); res.status(204).send(); }
  catch (err) { console.error('Error deleting equipe:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Organisation: Agence Membres --------------------
app.get('/api/agence_membres', authenticateToken, async (req, res) => {
  try {
    const { agence_id, agent_matricule } = req.query;
    let sql = 'SELECT am.*, ag.titre as agence_titre, a.nom as agent_nom FROM agence_membre am JOIN agence ag ON am.agence_id=ag.id JOIN agent a ON am.agent_matricule=a.matricule';
    const params = []; const conds = [];
    if (agence_id) { params.push(agence_id); conds.push(`am.agence_id=$${params.length}`); }
    if (agent_matricule) { params.push(agent_matricule); conds.push(`am.agent_matricule=$${params.length}`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY am.id DESC';
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error('Error fetching agence_membres:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/agence_membres/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try { const r = await pool.query('SELECT * FROM agence_membre WHERE id=$1', [id]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); }
  catch (err) { console.error('Error fetching agence_membre:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/agence_membres', authenticateToken, authorizeAdmin, async (req, res) => {
  const { agence_id, agent_matricule, role } = req.body;
  if (!agence_id || !agent_matricule) return res.status(400).json({ error: 'agence_id and agent_matricule are required' });
  try { const r = await pool.query("INSERT INTO agence_membre (agence_id, agent_matricule, role) VALUES ($1,$2,COALESCE($3,'Membre')) RETURNING *", [agence_id, agent_matricule, role || null]); res.status(201).json(r.rows[0]); }
  catch (err) { console.error('Error creating agence_membre:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.put('/api/agence_membres/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agence_id, agent_matricule, role } = req.body;
  try { const r = await pool.query('UPDATE agence_membre SET agence_id=$1, agent_matricule=$2, role=COALESCE($3, role) WHERE id=$4 RETURNING *', [agence_id || null, agent_matricule || null, role || null, id]); res.json(r.rows[0] || null); }
  catch (err) { console.error('Error updating agence_membre:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/agence_membres/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM agence_membre WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting agence_membre:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Organisation: Agent Equipe --------------------
app.get('/api/agent_equipes', authenticateToken, async (req, res) => {
  try {
    const { equipe_id, agent_matricule } = req.query;
    let sql = 'SELECT ae.*, e.nom as equipe_nom, a.nom as agent_nom FROM agent_equipe ae JOIN equipe e ON ae.equipe_id=e.id JOIN agent a ON ae.agent_matricule=a.matricule';
    const params = []; const conds = [];
    if (equipe_id) { params.push(equipe_id); conds.push(`ae.equipe_id=$${params.length}`); }
    if (agent_matricule) { params.push(agent_matricule); conds.push(`ae.agent_matricule=$${params.length}`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY ae.id DESC';
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error('Error fetching agent_equipes:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/agent_equipes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params; try { const r = await pool.query('SELECT * FROM agent_equipe WHERE id=$1', [id]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); } catch (err) { console.error('Error fetching agent_equipe:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/agent_equipes', authenticateToken, authorizeAdmin, async (req, res) => {
  const { equipe_id, agent_matricule } = req.body;
  if (!equipe_id || !agent_matricule) return res.status(400).json({ error: 'equipe_id and agent_matricule are required' });
  try { const r = await pool.query('INSERT INTO agent_equipe (equipe_id, agent_matricule) VALUES ($1,$2) ON CONFLICT (equipe_id, agent_matricule) DO NOTHING RETURNING *', [equipe_id, agent_matricule]); res.status(r.rows[0]?201:200).json(r.rows[0]||{ message: 'Already linked' }); } catch (err) { console.error('Error creating agent_equipe:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/agent_equipes/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM agent_equipe WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting agent_equipe:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Organisation: Fonctions --------------------
app.get('/api/fonctions', authenticateToken, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM fonction ORDER BY code ASC'); res.json(r.rows); } catch (err) { console.error('Error fetching fonctions:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/fonctions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params; try { const r = await pool.query('SELECT * FROM fonction WHERE id=$1', [id]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); } catch (err) { console.error('Error fetching fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/fonctions', authenticateToken, authorizeAdmin, async (req, res) => {
  const { code, libelle, description } = req.body; if (!code || !libelle) return res.status(400).json({ error: 'code and libelle are required' });
  try { const r = await pool.query('INSERT INTO fonction (code, libelle, description) VALUES ($1,$2,$3) RETURNING *', [code, libelle, description || null]); res.status(201).json(r.rows[0]); } catch (err) { console.error('Error creating fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.put('/api/fonctions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { code, libelle, description } = req.body;
  try { const r = await pool.query('UPDATE fonction SET code=$1, libelle=$2, description=$3 WHERE id=$4 RETURNING *', [code || null, libelle || null, description || null, id]); res.json(r.rows[0] || null); } catch (err) { console.error('Error updating fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/fonctions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM fonction WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Organisation: Agent Fonctions --------------------
app.get('/api/agent_fonctions', authenticateToken, async (req, res) => {
  try {
    const { agent_matricule, fonction_id } = req.query;
    let sql = 'SELECT af.*, f.code as fonction_code, f.libelle as fonction_libelle FROM agent_fonction af JOIN fonction f ON af.fonction_id=f.id';
    const params = []; const conds = [];
    if (agent_matricule) { params.push(agent_matricule); conds.push(`af.agent_matricule=$${params.length}`); }
    if (fonction_id) { params.push(fonction_id); conds.push(`af.fonction_id=$${params.length}`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY af.id DESC';
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error('Error fetching agent_fonctions:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/agent_fonctions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params; try { const r = await pool.query('SELECT * FROM agent_fonction WHERE id=$1', [id]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); } catch (err) { console.error('Error fetching agent_fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/agent_fonctions', authenticateToken, authorizeAdmin, async (req, res) => {
  const { agent_matricule, fonction_id, principal } = req.body;
  if (!agent_matricule || !fonction_id) return res.status(400).json({ error: 'agent_matricule and fonction_id are required' });
  try { const r = await pool.query('INSERT INTO agent_fonction (agent_matricule, fonction_id, principal) VALUES ($1,$2,COALESCE($3,false)) ON CONFLICT (agent_matricule, fonction_id) DO NOTHING RETURNING *', [agent_matricule, fonction_id, principal === true]); res.status(r.rows[0]?201:200).json(r.rows[0]||{ message: 'Already linked' }); } catch (err) { console.error('Error creating agent_fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.put('/api/agent_fonctions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agent_matricule, fonction_id, principal } = req.body;
  try { const r = await pool.query('UPDATE agent_fonction SET agent_matricule=$1, fonction_id=$2, principal=COALESCE($3, principal) WHERE id=$4 RETURNING *', [agent_matricule || null, fonction_id || null, typeof principal === 'boolean' ? principal : null, id]); res.json(r.rows[0] || null); } catch (err) { console.error('Error updating agent_fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/agent_fonctions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM agent_fonction WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting agent_fonction:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});


// -------------------- Achats --------------------
app.get('/api/achats', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query("SELECT a.*, af.nom_affaire, s.nom_site FROM achat a LEFT JOIN affaire af ON a.affaire_id=af.id LEFT JOIN site s ON a.site_id=s.id ORDER BY a.id DESC");
    res.json(r.rows);
  } catch (err) { console.error('Error fetching achats:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/achats/:id', authenticateToken, async (req, res) => {
  const { id } = req.params; try { const r = await pool.query('SELECT * FROM achat WHERE id=$1', [id]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); } catch (err) { console.error('Error fetching achat:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/achats', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    let { reference, objet, fournisseur, statut, montant_ht, tva, montant_ttc, date_commande, affaire_id, site_id } = req.body;
    if (montant_ht != null && tva != null && (montant_ttc == null)) {
      montant_ttc = Number(montant_ht) * (1 + Number(tva)/100);
    }
    const r = await pool.query('INSERT INTO achat (reference, objet, fournisseur, statut, montant_ht, tva, montant_ttc, date_commande, affaire_id, site_id) VALUES ($1,$2,$3,COALESCE($4,\'Brouillon\'),$5,$6,$7,$8,$9,$10) RETURNING *', [reference||null, objet||null, fournisseur||null, statut||null, montant_ht||null, tva||null, montant_ttc||null, date_commande||null, affaire_id||null, site_id||null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error('Error creating achat:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.put('/api/achats/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try {
    let { reference, objet, fournisseur, statut, montant_ht, tva, montant_ttc, date_commande, affaire_id, site_id } = req.body;
    if (montant_ht != null && tva != null && (montant_ttc == null)) {
      montant_ttc = Number(montant_ht) * (1 + Number(tva)/100);
    }
    const r = await pool.query('UPDATE achat SET reference=$1, objet=$2, fournisseur=$3, statut=COALESCE($4, statut), montant_ht=$5, tva=$6, montant_ttc=$7, date_commande=$8, affaire_id=$9, site_id=$10 WHERE id=$11 RETURNING *', [reference||null, objet||null, fournisseur||null, statut||null, montant_ht||null, tva||null, montant_ttc||null, date_commande||null, affaire_id||null, site_id||null, id]);
    res.json(r.rows[0] || null);
  } catch (err) { console.error('Error updating achat:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/achats/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM achat WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting achat:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Factures --------------------
app.get('/api/factures', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query("SELECT f.*, c.nom_client, af.nom_affaire FROM facture f LEFT JOIN client c ON f.client_id=c.id LEFT JOIN affaire af ON f.affaire_id=af.id ORDER BY f.id DESC");
    res.json(r.rows);
  } catch (err) { console.error('Error fetching factures:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/factures/:id', authenticateToken, async (req, res) => {
  const { id } = req.params; try { const r = await pool.query('SELECT * FROM facture WHERE id=$1', [id]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); } catch (err) { console.error('Error fetching facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/factures', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    let { reference, statut, montant_ht, tva, montant_ttc, date_emission, date_echeance, client_id, affaire_id } = req.body;
    if (montant_ht != null && tva != null && (montant_ttc == null)) {
      montant_ttc = Number(montant_ht) * (1 + Number(tva)/100);
    }
    const r = await pool.query('INSERT INTO facture (reference, statut, montant_ht, tva, montant_ttc, date_emission, date_echeance, client_id, affaire_id) VALUES ($1, COALESCE($2,\'Brouillon\'), $3,$4,$5,$6,$7,$8,$9) RETURNING *', [reference||null, statut||null, montant_ht||null, tva||null, montant_ttc||null, date_emission||null, date_echeance||null, client_id||null, affaire_id||null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error('Error creating facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.put('/api/factures/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try {
    let { reference, statut, montant_ht, tva, montant_ttc, date_emission, date_echeance, client_id, affaire_id } = req.body;
    if (montant_ht != null && tva != null && (montant_ttc == null)) {
      montant_ttc = Number(montant_ht) * (1 + Number(tva)/100);
    }
    const r = await pool.query('UPDATE facture SET reference=$1, statut=COALESCE($2, statut), montant_ht=$3, tva=$4, montant_ttc=$5, date_emission=$6, date_echeance=$7, client_id=$8, affaire_id=$9 WHERE id=$10 RETURNING *', [reference||null, statut||null, montant_ht||null, tva||null, montant_ttc||null, date_emission||null, date_echeance||null, client_id||null, affaire_id||null, id]);
    res.json(r.rows[0] || null);
  } catch (err) { console.error('Error updating facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/factures/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM facture WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Règlements --------------------
app.get('/api/reglements', authenticateToken, async (req, res) => {
  try {
    const { facture_id } = req.query; let sql = 'SELECT * FROM reglement'; const params = [];
    if (facture_id) { sql += ' WHERE facture_id=$1'; params.push(facture_id); }
    sql += ' ORDER BY id DESC';
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error('Error fetching reglements:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/reglements', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { facture_id, montant, mode, reference, date_reglement } = req.body;
    if (!facture_id || !montant) return res.status(400).json({ error: 'facture_id and montant are required' });
    const r = await pool.query('INSERT INTO reglement (facture_id, montant, mode, reference, date_reglement) VALUES ($1,$2,COALESCE($3,\'Virement\'),$4,$5) RETURNING *', [facture_id, montant, mode||null, reference||null, date_reglement||null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error('Error creating reglement:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/reglements/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM reglement WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting reglement:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});// Start the server
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Serving static files from ${__dirname}/public`);
    });
});