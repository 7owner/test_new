require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const csurf = require('csurf');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const createClientRoutes = require('./routes/client.routes');
const createMessagingRoutes = require('./routes/messaging.routes');
const createTicketsRoutes = require('./routes/tickets.routes');
const createTravauxRoutes = require('./routes/travaux.routes');
const createInterventionsRoutes = require('./routes/interventions.routes');

const app = express();
// Désactiver les ETag/304 sur l'API pour éviter les réponses vides côté fetch
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_dev';
const pathInitDefault = path.join(__dirname, 'database_correction', 'init_fixed.sql');
const pathSeedDefault = path.join(__dirname, 'database_correction', 'seed_fixed.sql');
const INIT_SQL_PATH = process.env.INIT_SQL || pathInitDefault;
const SEED_SQL_PATH = process.env.SEED_SQL || pathSeedDefault;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // For parsing application/json, with increased limit
// Security headers
app.use((req, res, next) => { res.set('X-Content-Type-Options','nosniff'); next(); });
// Silence missing favicon errors to avoid noisy 404s in console
app.get('/favicon.ico', (_req, res) => res.redirect(302, '/favicon.svg'));
app.use(express.static('public', { setHeaders: (res, filePath, stat) => {
  try {
    const ct = res.getHeader('Content-Type');
    if (ct) {
      if (/charset=/i.test(ct)) {
        res.setHeader('Content-Type', ct.replace(/charset=([^;]+)/i, 'charset=utf-8'));
      } else if (/(^text\/|javascript|json)/i.test(ct)) {
        res.setHeader('Content-Type', `${ct}; charset=utf-8`);
      }
    }
  } catch(_){}

  // For HTML files, disable caching to always reflect latest changes
  if (/\.html$/i.test(String(filePath || ''))) {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } catch(_){}
  } else {
    // Other assets can be cached for a week
    try { res.removeHeader('Expires'); res.removeHeader('Pragma'); } catch(_){}
    res.setHeader('Cache-Control', 'public, max-age=604800, must-revalidate');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
} })); // Serve static files from 'public' directory
// Default homepage → dashboard
try {
  app.get('/', (_req, res) => {
    try { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); }
    catch { res.redirect(302, '/dashboard.html'); }
  });
} catch(_) {}
// Ensure uploads directory exists
try {
  const uploadsDocumentsDir = path.join(__dirname, 'public', 'uploads', 'documents');
  const uploadsAttachmentsDir = path.join(__dirname, 'public', 'uploads', 'attachments');
  fs.mkdirSync(uploadsDocumentsDir, { recursive: true });
  fs.mkdirSync(uploadsAttachmentsDir, { recursive: true });
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
        // Acquire an advisory lock to ensure only one process initializes the DB at a time
        await client.query('SELECT pg_advisory_lock(123456789)'); // Use a unique arbitrary number

        if (String(process.env.SKIP_DB_INIT || 'false').toLowerCase() === 'true') {
            console.warn('SKIP_DB_INIT=true -> skipping DB initialization');
            return;
        }
        // Force schema initialization
        console.log('Forcing schema initialization as per user request.');

        // Check if schema is already initialized by looking for a key table (e.g., users)
        const checkSchemaSql = "SELECT to_regclass('public.users')";
        const schemaExists = await client.query(checkSchemaSql);

        if (schemaExists.rows[0].to_regclass) {
            console.log('Database schema already initialized. Skipping init.sql and seed.sql execution.');
            return; // Exit function if schema exists
        }

        const schemaPath = INIT_SQL_PATH;
        console.log('Initializing schema from:', schemaPath);
            const schemaSqlRaw = fs.readFileSync(schemaPath, 'utf8');
            // Normalize, strip BOM and comments, then split by ';'
            const norm = schemaSqlRaw
              .replace(/\uFEFF/g, '')
              .replace(/\r\n/g, '\n')
              .replace(/\/\*[\s\S]*?\*\//g, ''); // remove /* */ blocks
            const statements = norm
              .split('\n')
              .filter(line => !/^\s*--/.test(line))
              .join('\n')
              .split(';')
              .map(s => s.trim())
              .filter(s => /\S/.test(s))
              .filter(s => /^[A-Za-z]/.test(s)); // drop any leading junk fragments
            if (!statements.length) {
              console.error('Schema init: no SQL statements parsed from init_fixed.sql. First 120 chars:', norm.slice(0,120));
              throw new Error('Empty schema after parsing');
            }
            console.log('Schema init: executing', statements.length, 'statements. First statement head:', statements[0].slice(0,120));
            await client.query('BEGIN');
            for (const stmt of statements) {
              try { await client.query(stmt); }
              catch (e) { console.error('Schema statement failed:', stmt.slice(0,120)+'...', e.message); throw e; }
            }
            await client.query('COMMIT');
            console.log('Database schema initialized successfully.');
        

        // Ensure audit_log and password_reset_tokens tables exist
        try {
        } catch (auditErr) { console.warn('audit_log table ensure failed:', auditErr.message); }

        // Seed data (idempotent via NOT EXISTS checks)
        try {
            const seedPath = SEED_SQL_PATH;
            console.log('Seeding database from:', seedPath);
            const seedRaw = fs.readFileSync(seedPath, 'utf8');
            const normSeed = seedRaw
              .replace(/\uFEFF/g, '')
              .replace(/\r\n/g, '\n')
              .replace(/\/\*[\s\S]*?\*\//g, '');
            const seedStatements = normSeed
              .split('\n')
              .filter(line => !/^\s*--/.test(line))
              .join('\n')
              .split(';')
              .map(s => s.trim())
              .filter(s => /\S/.test(s))
              .filter(s => /^[A-Za-z]/.test(s));
            if (!seedStatements.length) {
              console.warn('Seed: no statements parsed from seed_fixed.sql. First 120 chars:', normSeed.slice(0,120));
            }
            console.log('Seed: executing', seedStatements.length, 'statements. First statement head:', (seedStatements[0]||'').slice(0,120));
            await client.query('BEGIN');
            for (const stmt of seedStatements) {
              try { await client.query(stmt); }
              catch (e) { console.warn('Seed statement failed:', stmt.slice(0,120)+'...', e.message); throw e; }
            }
            await client.query('COMMIT');
            console.log('Database seed executed successfully.');
        } catch (seedErr) {
            console.warn('Database seed skipped/failed:', seedErr.message);
        }
    } finally {
        await client.query('SELECT pg_advisory_unlock(123456789)'); // Release the lock
        client.release();
    }
}

// Initialize DB schema on startup (non-fatal if it fails)
initializeDatabase();

// Ensure additional schema coherence
ensureInterventionEventSchema().catch(e => console.warn('ensureInterventionEventSchema warning:', e.message));

// Ensure core reference data (agents coherent with users) on startup
ensureAgentsCoherent().catch(e => console.warn('ensureAgentsCoherent warning:', e.message));
async function ensureAgentsCoherent() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Agencies
    await client.query("INSERT INTO agence (titre, designation, telephone, email) SELECT 'Agence Paris','Agence principale Paris','0102030405','paris@agence.fr' WHERE NOT EXISTS (SELECT 1 FROM agence WHERE titre='Agence Paris')");
    await client.query("INSERT INTO agence (titre, designation, telephone, email) SELECT 'Agence Lyon','Agence secondaire Lyon','0499999999','lyon@agence.fr' WHERE NOT EXISTS (SELECT 1 FROM agence WHERE titre='Agence Lyon')");

    // Users (no-ops if already present)
    await client.query("INSERT INTO users (email, roles, password) SELECT 'maboujunior777@gmail.com','[\"ROLE_ADMIN\"]','$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq' WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='maboujunior777@gmail.com')");
    //await client.query("INSERT INTO users (email, roles, password) SELECT 'takotuemabou@outlook.com','[\"ROLE_USER\"]','$2b$10$FzYl.RlTXgB/sPKe7phzJuXk.uUfXWDWnevVIB4MuXc2NoIOW2WKq' WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='takotuemabou@outlook.com')");

    // AGT001 -> takotuemabou@outlook.com (ROLE_USER)
    await client.query(
      "UPDATE agent a SET email=u.email, user_id=u.id, admin=FALSE, actif=TRUE, agence_id=ap.id FROM users u, agence ap WHERE a.matricule='AGT001' AND u.email='takotuemabou@outlook.com' AND ap.titre='Agence Paris'"
    );
    await client.query(
      "INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id) " +
      "SELECT 'AGT001','Dupont','Jean',FALSE,'takotuemabou@outlook.com','0612345678',TRUE, " +
      "(SELECT id FROM agence WHERE titre='Agence Paris' LIMIT 1), (SELECT id FROM users WHERE email='takotuemabou@outlook.com' LIMIT 1) " +
      "WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule='AGT001')"
    );

    // AGT002 -> maboujunior777@gmail.com (ROLE_ADMIN)
    await client.query(
      "UPDATE agent a SET email=u.email, user_id=u.id, admin=TRUE, actif=TRUE, agence_id=al.id FROM users u, agence al WHERE a.matricule='AGT002' AND u.email='maboujunior777@gmail.com' AND al.titre='Agence Lyon'"
    );

    // Optional agents for richer testing
    await client.query("INSERT INTO users (email, roles, password) SELECT 'pierre.bernard@example.com','[\"ROLE_USER\"]','$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq' WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='pierre.bernard@example.com')");
    await client.query("INSERT INTO users (email, roles, password) SELECT 'marie.petit@example.com','[\"ROLE_USER\"]','$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq' WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='marie.petit@example.com')");

    // AGT003 -> pierre.bernard@example.com (Agence Paris)
    await client.query(
      "UPDATE agent a SET email='pierre.bernard@example.com', user_id=(SELECT id FROM users WHERE email='pierre.bernard@example.com' LIMIT 1), admin=FALSE, actif=COALESCE(actif, TRUE), agence_id=(SELECT id FROM agence WHERE titre='Agence Paris' LIMIT 1) WHERE a.matricule='AGT003'"
    );
    await client.query(
      "INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id) " +
      "SELECT 'AGT003','Bernard','Pierre',FALSE,'pierre.bernard@example.com','0611223344',FALSE, " +
      "(SELECT id FROM agence WHERE titre='Agence Paris' LIMIT 1), (SELECT id FROM users WHERE email='pierre.bernard@example.com' LIMIT 1) " +
      "WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule='AGT003')"
    );

    // AGT004 -> marie.petit@example.com (Agence Lyon)
    await client.query(
      "UPDATE agent a SET email='marie.petit@example.com', user_id=(SELECT id FROM users WHERE email='marie.petit@example.com' LIMIT 1), admin=FALSE, actif=TRUE, agence_id=(SELECT id FROM agence WHERE titre='Agence Lyon' LIMIT 1) WHERE a.matricule='AGT004'"
    );
    await client.query(
      "INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id) " +
      "SELECT 'AGT004','Petit','Marie',FALSE,'marie.petit@example.com','0655443322',TRUE, " +
      "(SELECT id FROM agence WHERE titre='Agence Lyon' LIMIT 1), (SELECT id FROM users WHERE email='marie.petit@example.com' LIMIT 1) " +
      "WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule='AGT004')"
    );
    await client.query(
      "INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id) " +
      "SELECT 'AGT002','Martin','Sophie',TRUE,'maboujunior777@gmail.com','0687654321',TRUE, " +
      "(SELECT id FROM agence WHERE titre='Agence Lyon' LIMIT 1), (SELECT id FROM users WHERE email='maboujunior777@gmail.com' LIMIT 1) " +
      "WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule='AGT002')"
    );

    await client.query('COMMIT');
    console.log('Core agents/users coherence ensured.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.warn('ensureAgentsCoherent failed:', e.message);
  } finally { client.release(); }
}

ensureAgentsCoherent();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');
let sendMail = async (msg) => {
  console.log('Email simulation:', msg);
  return Promise.resolve();
};

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid mail transport configured.');
  sendMail = async (msg) => {
    const from = process.env.EMAIL_FROM || 'no-reply@example.com';
    const msgToSend = { ...msg, from };
    try {
      await sgMail.send(msgToSend);
      console.log('Email sent via SendGrid to:', msg.to);
    } catch (error) {
      console.error('Error sending email via SendGrid');
      console.error(error);
      if (error.response) {
        console.error(error.response.body);
      }
      throw error;
    }
  };
} else {
  console.log('SENDGRID_API_KEY not found; falling back to console logging for emails.');
}

// Trust proxy for correct secure cookies behind proxies
try { app.set('trust proxy', 1); } catch {}

// Pre-create session table to avoid transaction-abort issues
async function ensureSessionTable() {
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS \"session\" (\n      sid varchar NOT NULL PRIMARY KEY,\n      sess json NOT NULL,\n      expire timestamp(6) NOT NULL\n    );");
    await pool.query("CREATE INDEX IF NOT EXISTS \"IDX_session_expire\" ON \"session\"(expire);");
  } catch (e) { console.warn('ensureSessionTable failed:', e.message); }
}
ensureSessionTable();

// Sessions setup
app.use(session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 1000 * 60 * 60 },
}));

// CSRF protection using session-based tokens
// Apply only to mutating requests, exclude public auth endpoints
const csrfProtection = csurf();
const publicNoCsrf = ['/api/forgot-password', '/api/reset-password', '/api/login', '/api/register'];
app.use((req, res, next) => {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (publicNoCsrf.includes(req.path)) return next();
  try {
    const auth = req.get && req.get('Authorization');
    const ct = req.get && req.get('Content-Type');
    // For APIs authenticated via Bearer token or JSON requests from SPA, skip CSRF
    if ((auth && /^Bearer\s+/i.test(auth)) || (ct && /application\/json/i.test(ct))) {
      return next();
    }
  } catch (_) {}
  return csrfProtection(req, res, next);
});

// Endpoint to fetch CSRF token (creates a session if needed)
app.get('/api/csrf-token', (req, res) => {
  try {
    // Generate token only if middleware is mounted for mutating routes
    const token = typeof req.csrfToken === 'function' ? req.csrfToken() : 'dummy_csrf_token';
    res.json({ csrfToken: token });
  } catch (e) {
    res.json({ csrfToken: 'dummy_csrf_token' });
  }
});

// Dev-only email test endpoint
app.get('/api/test-email', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Disabled in production' });
    }
    const to = req.query.to || req.query.email;
    if (!to) return res.status(400).json({ error: 'Missing to parameter' });
    const base = `${req.protocol}://${req.get('host')}`;
    const info = await sendMail({
      to,
      subject: 'Test email · projet_var_v4',
      text: `Ceci est un message de test. Page: ${base}`,
      html: `<p>Ceci est un message de test.</p><p>Page: <a href="${base}">${base}</a></p>`,
    });
    res.json({ message: 'Email sent', info: info && info.messageId ? { messageId: info.messageId } : info });
  } catch (e) {
    console.error('Test email failed:', e);
    res.status(500).json({ error: 'Send failed', detail: e && e.message ? e.message : String(e) });
  }
});

// Auth middleware: prefer session, fallback to JWT for backward compatibility
const authenticateToken = (req, res, next) => {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
    }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const authorizeAdmin = (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        try { console.log('authorizeAdmin req.user:', req.user); } catch (_) {}
    }
    if (!req.user || !req.user.roles || !req.user.roles.includes('ROLE_ADMIN')) {
        return res.sendStatus(403); // Forbidden if not admin
    }
    next();
};

// Helper: clients accessibles par un utilisateur (propriétaire ou représentant)
async function getClientIdsForUser(user) {
    if (!user) return [];
    const email = user.email ? user.email.toLowerCase() : null;
    const uid = user.id || null;
    const r = await pool.query(
        `SELECT DISTINCT c.id
         FROM client c
         LEFT JOIN client_representant cr ON cr.client_id = c.id
         WHERE (c.user_id = $1 OR (c.representant_email IS NOT NULL AND LOWER(c.representant_email) = $2)
                OR cr.user_id = $1 OR (cr.email IS NOT NULL AND LOWER(cr.email) = $2))`,
        [uid, email]
    );
    return r.rows.map(row => row.id);
}

async function userOwnsClientId(user, clientId) {
    if (!user || clientId == null) return false;
    const clientIds = await getClientIdsForUser(user);
    const targetId = String(clientId);
    return clientIds.map(id => String(id)).includes(targetId);
}

// Simple audit helper
async function logAudit(entity, entityId, action, actorEmail, details) {
    try {
        await pool.query('INSERT INTO audit_log (entity, entity_id, action, actor_email, details) VALUES ($1,$2,$3,$4,$5)', [entity, entityId ? String(entityId) : null, action, actorEmail || null, details ? JSON.stringify(details) : null]);
    } catch (e) { console.warn('audit_log insert failed:', e.message); }
}

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

// Admin: Search for users
app.get('/api/users/search', authenticateToken, authorizeAdmin, async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: 'Email query parameter is required.' });
    }
    try {
        const result = await pool.query("SELECT id, email FROM users WHERE email ILIKE $1 LIMIT 10", [`%${email}%`]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error searching users:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin: Create a new user
app.post('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return res.status(400).json({ error: 'Email, password, and role are required' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password, roles) VALUES ($1, $2, $3) RETURNING id, email, roles',
            [email, hashedPassword, JSON.stringify([role])]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'User with this email already exists.' });
        }
        console.error('Error creating user by admin:', err);
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

        // Fetch agent matricule
        let matricule = null;
        try {
            const agentRes = await pool.query('SELECT matricule FROM agent WHERE email = $1', [user.email]);
            if (agentRes.rows.length > 0) {
                matricule = agentRes.rows[0].matricule;
            }
        } catch (e) {
            console.error('Could not fetch agent matricule during login:', e);
        }

        // Normalize roles: handle jsonb (object/array) and text stored JSON
        let roles = user.roles;
        if (typeof roles === 'string') {
            try { roles = JSON.parse(roles); } catch (_) { roles = []; }
        }
        if (!Array.isArray(roles)) {
            roles = [];
        }

        const sessionUser = { id: user.id, email: user.email, roles, matricule };

        // Create session
        req.session.user = sessionUser;
        // Also return JWT for backward compatibility (front still using it)
        const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful', token, session: true });
    } catch (err) {
        console.error('Error logging in:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Session helpers
// Return current user from session; if absent, try JWT Authorization header for backward compatibility
app.get('/api/me', (req, res) => {
    try {
        if (req.session && req.session.user) return res.json(req.session.user);
        const authHeader = req.headers && (req.headers['authorization'] || req.get && req.get('Authorization'));
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded && decoded.email) return res.json({ id: decoded.id, email: decoded.email, roles: decoded.roles || [] });
            } catch (_) { /* invalid token -> fallthrough */ }
        }
        return res.sendStatus(401);
    } catch (e) {
        // Never 500 here; report unauthenticated instead
        return res.sendStatus(401);
    }
});

app.post('/api/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => res.status(200).json({ message: 'Logged out' }));
    } else {
        res.status(200).json({ message: 'No session' });
    }
});

// API Route for requesting password reset
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            // For security, don't reveal if the email exists or not
            return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const userId = userResult.rows[0].id;
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // Token valid for 1 hour

        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [userId, resetToken, expiresAt]
        );

        const host = req.get('host');
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const resetLink = `${proto}://${host}/reset-password.html?token=${resetToken}`;
        try {
          await sendMail({
            to: email,
            subject: 'Réinitialisation de mot de passe',
            text: `Utilisez ce lien pour réinitialiser votre mot de passe: ${resetLink}`,
            html: `<p>Bonjour,</p><p>Pour réinitialiser votre mot de passe, cliquez <a href=\"${resetLink}\">ici</a>.</p><p>Ce lien expire dans 1h.</p>`,
          });
        } catch (mailErr) {
          console.warn('Password reset email send failed; falling back to console log:', mailErr.message);
          console.log(`Password reset link for ${email}: ${resetLink}`);
        }

        res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (err) {
        console.error('Error requesting password reset:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Route for resetting password
app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }

    try {
        const resetTokenResult = await pool.query(
            'SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (resetTokenResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token.' });
        }

        const userId = resetTokenResult.rows[0].user_id;
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, userId]
        );

        await pool.query(
            'DELETE FROM password_reset_tokens WHERE user_id = $1',
            [userId]
        );

        res.status(200).json({ message: 'Password has been reset successfully.' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Route for requesting password reset
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            // For security, don't reveal if the email exists or not
            return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const userId = userResult.rows[0].id;
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // Token valid for 1 hour

        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [userId, resetToken, expiresAt]
        );

        const host = req.get('host');
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const resetLink = `${proto}://${host}/reset-password.html?token=${resetToken}`;
        try {
          await sendMail({
            to: email,
            subject: 'Réinitialisation de mot de passe',
            text: `Utilisez ce lien pour réinitialiser votre mot de passe: ${resetLink}`,
            html: `<p>Bonjour,</p><p>Pour réinitialiser votre mot de passe, cliquez <a href=\"${resetLink}\">ici</a>.</p><p>Ce lien expire dans 1h.</p>`,
          });
        } catch (mailErr) {
          console.warn('Password reset email send failed; falling back to console log:', mailErr.message);
          console.log(`Password reset link for ${email}: ${resetLink}`);
        }

        res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (err) {
        console.error('Error requesting password reset:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Route for resetting password
app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }

    try {
        const resetTokenResult = await pool.query(
            'SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (resetTokenResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token.' });
        }

        const userId = resetTokenResult.rows[0].user_id;
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, userId]
        );

        await pool.query(
            'DELETE FROM password_reset_tokens WHERE user_id = $1',
            [userId]
        );

        res.status(200).json({ message: 'Password has been reset successfully.' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Use memory storage for all uploads to handle them as buffers
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Multer config for Rendu d'intervention files
const renduStorage = multer.memoryStorage(); // Use memory storage to handle files as buffers
const renduUpload = multer({ storage: renduStorage });

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
        const urgentTickets = (await pool.query("SELECT * FROM ticket WHERE etat <> 'Termine'")).rows;
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

        // Commandes reçues récentes (statuts reçus/installe, tolérance accent)
        const recentOrders = (await pool.query(`
            SELECT
                m.id,
                m.titre,
                m.reference,
                m.designation,
                m.commande_status,
                m.prix_achat,
                m.fournisseur,
                COALESCE(SUM(im.quantite), 0) AS total_quantite_used_in_interventions,
                MIN(im.intervention_id) AS intervention_id
            FROM materiel m
            LEFT JOIN intervention_materiel im ON m.id = im.materiel_id
            WHERE m.commande_status::text IN (
                'Reçu','Recu','Installé','Installe'
            )
            GROUP BY m.id
            ORDER BY m.created_at DESC
            LIMIT 5
        `)).rows;

        res.json({
            activeTickets,
            ongoingInterventions,
            activeAgents,
            sitesUnderContract,
            urgentTickets,
            chartData: chart,
            achatsCount,
            facturesCount,
            reglementsCount,
            recentOrders
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
app.post('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { cible_type, cible_id, nom_fichier, type_mime, base64, auteur_matricule, titre, commentaire } = req.body || {};
    let { nature } = req.body || {}; // Keep it mutable

    if (!cible_type || !cible_id || !nom_fichier) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Sanitize the 'nature' field based on mime type
    const mime = type_mime || '';
    if (mime.startsWith('video/')) {
      nature = 'Video';
    } else if (mime.startsWith('audio/')) {
      nature = 'Audio';
    } else {
      nature = 'Document'; // Default for images, pdf, etc.
    }

    // Authorization: Admins allowed for all. Clients allowed only for their own Site/DemandeClient
    const roles = (req.user && Array.isArray(req.user.roles)) ? req.user.roles : [];
    const isAdmin = roles.includes('ROLE_ADMIN');
    if (!isAdmin) {
      const email = req.user && req.user.email;
      if (!email) return res.status(401).json({ error: 'Unauthorized' });
      const clientRow = (await pool.query('SELECT id FROM client WHERE representant_email=$1 LIMIT 1', [email])).rows[0];
      if (!clientRow) return res.status(403).json({ error: 'Forbidden' });
      if (String(cible_type) === 'Site') {
        const ok = (await pool.query('SELECT 1 FROM site WHERE id=$1 AND client_id=$2', [cible_id, clientRow.id])).rows[0];
        if (!ok) return res.status(403).json({ error: 'Forbidden' });
      } else if (String(cible_type) === 'DemandeClient') {
        const ok = (await pool.query('SELECT 1 FROM demande_client WHERE id=$1 AND client_id=$2', [cible_id, clientRow.id])).rows[0];
        if (!ok) return res.status(403).json({ error: 'Forbidden' });
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
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
      chemin_fichier = relPath.replace(/\\/g, '/');
    }
    const result = await pool.query(
      `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, chemin_fichier, checksum_sha256, auteur_matricule, titre, commentaire)
       VALUES ($1,$2,$3::doc_nature,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [cible_type, cible_id, nature, nom_fichier, type_mime || null, taille_octets, chemin_fichier, checksum_sha256, auteur_matricule || null, titre || null, commentaire || null]
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
  const { cible_type, cible_id, nature, nom_fichier, type_mime, titre, commentaire } = req.body;
  try {
    const result = await pool.query(
      'UPDATE documents_repertoire SET cible_type=$1, cible_id=$2, nature=$3, nom_fichier=$4, type_mime=$5, titre=COALESCE($6,titre), commentaire=COALESCE($7,commentaire) WHERE id=$8 RETURNING *',
      [cible_type, cible_id, nature, nom_fichier, type_mime || null, titre || null, commentaire || null, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating document:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Patch document meta (titre/commentaire) without requiring all fields
app.patch('/api/documents/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { titre = null, commentaire = null, nom_fichier = null, nature = null, cible_type = null, cible_id = null, type_mime = null } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE documents_repertoire
       SET titre = COALESCE($1, titre),
           commentaire = COALESCE($2, commentaire),
           nom_fichier = COALESCE($3, nom_fichier),
           nature = COALESCE($4, nature),
           cible_type = COALESCE($5, cible_type),
           cible_id = COALESCE($6, cible_id),
           type_mime = COALESCE($7, type_mime)
       WHERE id = $8
       RETURNING *`,
      [titre, commentaire, nom_fichier, nature, cible_type, cible_id, type_mime, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error patching document:', err);
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

// -------------------- Statistiques mensuelles (tickets par mois) --------------------
app.get('/api/stats/tickets/monthly', authenticateToken, async (req, res) => {
  try {
    // Requête SQL : compte le nombre de tickets créés par mois
    const result = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM date_debut) AS mois,
        COUNT(*) AS nb_tickets
      FROM ticket
      WHERE date_debut IS NOT NULL
      GROUP BY mois
      ORDER BY mois
    `);

    // Tableau des 12 mois
    const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
    const values = new Array(12).fill(0);

    // Remplissage avec les données SQL
    for (const row of result.rows) {
      const moisIndex = parseInt(row.mois, 10) - 1;
      if (moisIndex >= 0 && moisIndex < 12) {
        values[moisIndex] = parseInt(row.nb_tickets, 10);
      }
    }

    res.json({ labels, values });
  } catch (err) {
    console.error('Erreur stats mensuelles:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});


// -------------------- Images API --------------------
// List images (no blobs)
app.get('/api/images', authenticateToken, async (req, res) => {
  try {
    const { cible_type, cible_id } = req.query;
    let sql = 'SELECT id, nom_fichier, type_mime, taille_octets, commentaire_image, auteur_matricule, cible_type, cible_id FROM images';
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
    const doInsert = async () => {
      return pool.query(
        `INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
         VALUES ($1, COALESCE($2,'image/jpeg'), $3, $4, $5, $6, $7, $8) RETURNING id, nom_fichier, type_mime, taille_octets, commentaire_image, auteur_matricule, cible_type, cible_id` ,
        [nom_fichier, type_mime, taille_octets, buffer, commentaire_image || null, auteur_matricule || null, cible_type || null, cible_id || null]
      );
    };
    try {
      const result = await doInsert();
      res.status(201).json(result.rows[0]);
    } catch (err) {
      // handle missing column (commentaire_image) or enum value
      if (err.code === '42703') {
        try {
          await pool.query('ALTER TABLE images ADD COLUMN IF NOT EXISTS commentaire_image TEXT');
          const result = await doInsert();
          return res.status(201).json(result.rows[0]);
        } catch (e2) {
          console.error('Error adding commentaire_image column:', e2);
          return res.status(500).json({ error: 'Internal Server Error' });
        }
      }
      console.error('Error uploading image:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } catch (err) {
    console.error('Error uploading image:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update image meta (commentaire) and propagate titre/commentaire to documents if linked
app.patch('/api/images/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { commentaire_image = null, titre = null } = req.body || {};
  try {
    const imgResult = await pool.query('UPDATE images SET commentaire_image = COALESCE($1, commentaire_image) WHERE id = $2 RETURNING *', [commentaire_image, id]);
    const img = imgResult.rows[0];
    if (!img) return res.status(404).json({ error: 'Not found' });

    // Propager vers documents_repertoire si une entrée existe pour ce fichier/rendu
    try {
      await pool.query(
        `UPDATE documents_repertoire
         SET titre = COALESCE($1, titre),
             commentaire = COALESCE($2, commentaire)
         WHERE cible_type = $3 AND cible_id = $4 AND nom_fichier = $5`,
        [titre, commentaire_image, img.cible_type || 'RenduIntervention', img.cible_id, img.nom_fichier]
      );
    } catch (e) {
      console.warn('Image patch propagate to documents failed:', e.message);
    }

    res.json(img);
  } catch (err) {
    console.error('Error updating image:', err);
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

// Get message attachment bytes
app.get('/api/attachments/:id/view', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT file_blob, file_type FROM messagerie_attachment WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row || !row.file_blob) {
      return res.status(404).json({ error: 'Attachment not found or is empty' });
    }
    res.setHeader('Content-Type', row.file_type || 'application/octet-stream');
    res.end(row.file_blob, 'binary');
  } catch (err) {
    console.error(`Error serving attachment ${id}:`, err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Relations: Site --------------------
app.get('/api/sites/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const siteResult = await pool.query(
        `SELECT s.*, c.nom_client, c.representant_nom, c.representant_tel
         FROM site s
         LEFT JOIN client c ON s.client_id = c.id
         WHERE s.id = $1`, [id]
    );
    const site = siteResult.rows[0];
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const affaires = (await pool.query('SELECT af.* FROM site_affaire sa JOIN affaire af ON sa.affaire_id=af.id WHERE sa.site_id=$1 ORDER BY af.id DESC', [id])).rows;
    const does = (await pool.query('SELECT d.* FROM doe d WHERE d.site_id=$1 ORDER BY d.id DESC', [id])).rows;
    const tickets = (await pool.query("SELECT t.*, dc.titre as demande_titre FROM ticket t LEFT JOIN demande_client dc ON t.demande_id = dc.id WHERE t.site_id=$1 ORDER BY t.id DESC", [id])).rows;
    const adresse = site.adresse_id ? (await pool.query('SELECT * FROM adresse WHERE id=$1', [site.adresse_id])).rows[0] : null;
    const rendezvous = (await pool.query('SELECT * FROM rendezvous WHERE site_id=$1 ORDER BY date_rdv DESC, id DESC', [id])).rows;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Site' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Site' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const responsables = (await pool.query("SELECT agent_matricule, role, date_debut, date_fin FROM site_responsable WHERE site_id=$1 ORDER BY COALESCE(date_debut, CURRENT_TIMESTAMP) DESC, id DESC", [id])).rows;
    const agents_assignes = (await pool.query("SELECT agent_matricule, date_debut, date_fin FROM site_agent WHERE site_id=$1 ORDER BY COALESCE(date_debut, CURRENT_TIMESTAMP) DESC, id DESC", [id])).rows;
    // NEW: Fetch associated contracts
    const contrats = (await pool.query(`
        SELECT c.*, csa.id as association_id
        FROM contrat c
        JOIN contrat_site_association csa ON c.id = csa.contrat_id
        WHERE csa.site_id = $1
        ORDER BY c.date_debut DESC`,
        [id]
    )).rows;
    const representants = site.client_id ? (await pool.query(`
      SELECT
        cr.id AS client_representant_id,
        cr.client_id,
        cr.user_id,
        COALESCE(cr.nom, a.nom, u.email) AS nom,
        COALESCE(cr.email, u.email) AS email,
        COALESCE(cr.tel, a.tel, '') AS tel,
        cr.fonction
      FROM client_representant cr
      LEFT JOIN users u ON u.id = cr.user_id
      LEFT JOIN agent a ON a.user_id = u.id
      WHERE cr.client_id = $1
      ORDER BY COALESCE(cr.nom, a.nom, u.email)`,
      [site.client_id]
    )).rows : [];

    res.json({ site, adresse, affaires, does, tickets, rendezvous, documents, images, responsables, agents_assignes, contrats, representants });
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
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='DOE' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='DOE' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    res.json({ doe, tickets, documents, images });
  } catch (err) {
    console.error('Error fetching doe relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Matériel Catalogue API --------------------
// List all catalogue materiels
app.get('/api/catalogue', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
          mc.*,
          COALESCE(SUM(im.quantite), 0) AS total_quantite_used_in_interventions,
          MAX(a.id)     AS agence_id,
          MAX(a.titre)  AS agence_nom
      FROM materiel_catalogue mc
      LEFT JOIN materiel m ON mc.reference = m.reference -- Assuming materiel orders are linked by reference to catalogue
      LEFT JOIN agence a ON m.agence_id = a.id
      LEFT JOIN intervention_materiel im ON m.id = im.materiel_id
      GROUP BY mc.id
      ORDER BY mc.id DESC
    `);
    res.json(r.rows);
  } catch (e) { console.error('Error fetching materiel catalogue:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Get one catalogue materiel with relations
app.get('/api/catalogue/:id/relations', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const itemResult = await pool.query('SELECT * FROM materiel_catalogue WHERE id = $1', [id]);
        const item = itemResult.rows[0];
        if (!item) {
            return res.status(404).json({ error: 'Catalogue item not found' });
        }
        const documentsResult = await pool.query(
            "SELECT * FROM documents_repertoire WHERE cible_type = 'MaterielCatalogue' AND cible_id = $1 ORDER BY id DESC",
            [id]
        );
        item.documents = documentsResult.rows;
        res.json(item);
    } catch (err) {
        console.error(`Error fetching relations for catalogue item ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get one catalogue materiel
app.get('/api/catalogue/:id', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM materiel_catalogue WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { console.error('Error fetching materiel catalogue item:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Create catalogue materiel (admin)
app.post('/api/catalogue', authenticateToken, authorizeAdmin, async (req, res) => {
  const { titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO materiel_catalogue (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
      [titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { 
      if (e.code === '23505') return res.status(409).json({ error: 'An item with this reference already exists.' });
      console.error('Error creating materiel catalogue item:', e); res.status(500).json({ error: 'Internal Server Error' }); 
  }
});

// -------------------- Demande Matériel --------------------
// List demandes (optional filters)
app.get('/api/demandes-materiel', authenticateToken, async (req, res) => {
  const { ticket_id, intervention_id, travaux_id, statut } = req.query;
  try {
    const where = [];
    const params = [];
    let idx = 1;
    if (ticket_id) { where.push(`ticket_id = $${idx++}`); params.push(ticket_id); }
    if (intervention_id) { where.push(`intervention_id = $${idx++}`); params.push(intervention_id); }
    if (travaux_id) { where.push(`travaux_id = $${idx++}`); params.push(travaux_id); }
    if (statut) { where.push(`statut = $${idx++}`); params.push(statut); }
    const r = await pool.query(
      `SELECT dm.*,
              i.titre AS intervention_titre,
              t.titre AS ticket_titre,
              tr.titre AS travaux_titre,
              (
                SELECT json_agg(
                  DISTINCT jsonb_build_object(
                    'id', m.id,
                    'reference', m.reference,
                    'designation', m.designation,
                    'commande_status', m.commande_status,
                    'quantite', COALESCE(gdm.quantite_demandee, 1)
                  )
                )
                FROM (
                  SELECT m.*, gdm.quantite_demandee
                  FROM gestion_demande_materiel gdm
                  JOIN materiel m ON m.id = gdm.materiel_id
                  WHERE gdm.demande_materiel_id = dm.id
                  UNION ALL
                  SELECT m.*, NULL::int AS quantite_demandee
                  FROM materiel m
                  WHERE (LOWER(m.designation) = LOWER(dm.titre) OR LOWER(m.reference) = LOWER(dm.titre))
                ) AS m
                LEFT JOIN gestion_demande_materiel gdm ON gdm.materiel_id = m.id AND gdm.demande_materiel_id = dm.id
              ) AS materiels
       FROM demande_materiel dm
       LEFT JOIN intervention i ON dm.intervention_id = i.id
       LEFT JOIN ticket t ON dm.ticket_id = t.id
       LEFT JOIN travaux tr ON dm.travaux_id = tr.id
       ${where.length ? 'WHERE '+where.join(' AND ') : ''}
       ORDER BY dm.created_at DESC`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    console.error('Error fetching demande_materiel:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create demande
app.post('/api/demandes-materiel', authenticateToken, async (req, res) => {
  const { titre, commentaire, quantite, ticket_id, intervention_id, travaux_id } = req.body;
  if (!titre) return res.status(400).json({ error: 'titre is required' });
  try {
    const r = await pool.query(
      `INSERT INTO demande_materiel (titre, commentaire, quantite, ticket_id, intervention_id, travaux_id)
       VALUES ($1,$2,COALESCE($3,1),$4,$5,$6)
       RETURNING *`,
      [titre, commentaire || null, quantite || 1, ticket_id || null, intervention_id || null, travaux_id || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('Error creating demande_materiel:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update demande (statut / commande_complete / commentaire / quantite)
app.patch('/api/demandes-materiel/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { statut, commande_complete, commentaire, quantite } = req.body;
  try {
    const r = await pool.query(
      `UPDATE demande_materiel
       SET statut = COALESCE($1, statut),
           commande_complete = COALESCE($2, commande_complete),
           commentaire = COALESCE($3, commentaire),
           quantite = COALESCE($4, quantite),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [statut || null, commande_complete, commentaire || null, quantite || null, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('Error updating demande_materiel:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete demande
app.delete('/api/demandes-materiel/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM demande_materiel WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    console.error('Error deleting demande_materiel:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update catalogue materiel (admin)
app.put('/api/catalogue/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif } = req.body;
  try {
    const r = await pool.query(
      'UPDATE materiel_catalogue SET titre=$1, reference=$2, designation=$3, categorie=$4, fabricant=$5, fournisseur=$6, remise_fournisseur=$7, classe_materiel=$8, prix_achat=$9, commentaire=$10, metier=$11, actif=$12 WHERE id=$13 RETURNING *',
      [titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { 
      if (e.code === '23505') return res.status(409).json({ error: 'An item with this reference already exists.' });
      console.error('Error updating materiel catalogue item:', e); res.status(500).json({ error: 'Internal Server Error' }); 
  }
});

// Delete catalogue materiel (admin)
app.delete('/api/catalogue/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM materiel_catalogue WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) { 
      if (e.code === '23503') return res.status(409).json({ error: 'Cannot delete item, it is referenced by an order.' });
      console.error('Error deleting materiel catalogue item:', e); res.status(500).json({ error: 'Internal Server Error' }); 
  }
});


// -------------------- Matériels API --------------------
// List all materiels (filters: intervention_id, categorie/metier, commande_status)
app.get('/api/materiels', authenticateToken, async (req, res) => {
  try {
    const { intervention_id, categorie, metier, commande_status } = req.query;
    const params = [];
    const where = [];
    let paramIndex = 1;

    if (intervention_id) {
      where.push(`m.id IN (SELECT materiel_id FROM intervention_materiel WHERE intervention_id = $${paramIndex++})`);
      params.push(intervention_id);
    }
    if (categorie) {
      where.push(`m.categorie = $${paramIndex++}`);
      params.push(categorie);
    }
    if (metier) {
      where.push(`m.metier = $${paramIndex++}`);
      params.push(metier);
    }
    if (commande_status) {
      where.push(`m.commande_status = $${paramIndex++}`);
      params.push(commande_status);
    }

    const sql = `
      SELECT
          m.*,
          COALESCE(SUM(im.quantite), 0) AS total_quantite_used_in_interventions
      FROM materiel m
      LEFT JOIN intervention_materiel im ON m.id = im.materiel_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY m.id
      ORDER BY m.id DESC`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { console.error('Error fetching materiels:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Get one materiel
app.get('/api/materiels/:id', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM materiel WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { console.error('Error fetching materiel:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Get materiel with relations
app.get('/api/materiels/:id/relations', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const materielResult = await pool.query('SELECT * FROM materiel WHERE id = $1', [id]);
        const materiel = materielResult.rows[0];
        if (!materiel) {
            return res.status(404).json({ error: 'Materiel not found' });
        }

        const documentsResult = await pool.query(
            "SELECT * FROM documents_repertoire WHERE cible_type = 'Materiel' AND cible_id = $1 ORDER BY id DESC",
            [id]
        );
        materiel.documents = documentsResult.rows;

        res.json(materiel);
    } catch (err) {
        console.error(`Error fetching relations for materiel ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create materiel (order) from a catalogue item (admin)
app.post('/api/materiels', authenticateToken, authorizeAdmin, async (req, res) => {
  const { catalogue_id } = req.body;

  try {
    if (catalogue_id) {
      // 1) Création depuis le catalogue (logique existante)
      const catalogueItemResult = await pool.query('SELECT * FROM materiel_catalogue WHERE id = $1', [catalogue_id]);
      const item = catalogueItemResult.rows[0];
      if (!item) {
          return res.status(404).json({ error: 'Catalogue item not found.' });
      }

      const r = await pool.query(
        `INSERT INTO materiel (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, commande_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'A commander'::commande_status_type) RETURNING *`,
        [item.titre, item.reference, item.designation, item.categorie, item.fabricant, item.fournisseur, item.remise_fournisseur, item.classe_materiel, item.prix_achat, item.commentaire, item.metier]
      );
      const created = r.rows[0];
      // liaison éventuelle à une demande
      if (req.body.demande_materiel_id) {
        await pool.query(
          `INSERT INTO gestion_demande_materiel (demande_materiel_id, materiel_id, quantite_demandee)
           VALUES ($1,$2,COALESCE($3,1))
           ON CONFLICT (demande_materiel_id, materiel_id) DO UPDATE SET quantite_demandee = EXCLUDED.quantite_demandee`,
          [req.body.demande_materiel_id, created.id, req.body.quantite_demandee || 1]
        );
        await linkMaterielToDemande(req.body.demande_materiel_id, created.id, req.body.quantite_demandee || 1);
      }
      return res.status(201).json(created);
    }

    // 2) Création manuelle (pas de catalogue)
    const {
      titre,
      reference,
      designation,
      categorie,
      fabricant,
      fournisseur,
      remise_fournisseur,
      classe_materiel,
      prix_achat,
      commentaire,
      metier,
      commande_status,
      demande_materiel_id,
      quantite_demandee
    } = req.body;

    if (!reference || !designation) {
      return res.status(400).json({ error: 'Référence et désignation sont obligatoires.' });
    }

    const r = await pool.query(
      `INSERT INTO materiel (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, commande_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12::commande_status_type,'A commander')) RETURNING *`,
      [titre || designation, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, commande_status]
    );
    const created = r.rows[0];
    if (demande_materiel_id) {
      await pool.query(
        `INSERT INTO gestion_demande_materiel (demande_materiel_id, materiel_id, quantite_demandee)
         VALUES ($1,$2,COALESCE($3,1))
         ON CONFLICT (demande_materiel_id, materiel_id) DO UPDATE SET quantite_demandee = EXCLUDED.quantite_demandee`,
        [demande_materiel_id, created.id, quantite_demandee || 1]
      );
      await linkMaterielToDemande(demande_materiel_id, created.id, quantite_demandee || 1);
    }
    return res.status(201).json(created);

  } catch (e) { 
      console.error('Error creating materiel order from catalogue:', e); 
      res.status(500).json({ error: 'Internal Server Error' }); 
  }
});

// Update materiel (order) (admin)
app.put('/api/materiels/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  // Only allow updating order-specific fields
  const { fournisseur, prix_achat, remise_fournisseur, commentaire } = req.body;
  let { commande_status } = req.body;
  // Normalise statut pour respecter l'ENUM
  const allowedStatuses = ['A commander', 'Commande', 'En livraison', 'Reçu', 'Installé'];
  const normalizeMap = {
    'Commande en cours': 'Commande',
    'Commandé': 'Commande',
    'En cours': 'En livraison'
  };
  if (commande_status && normalizeMap[commande_status]) commande_status = normalizeMap[commande_status];
  if (commande_status && !allowedStatuses.includes(commande_status)) {
    return res.status(400).json({ error: `Statut de commande invalide (valeurs autorisées: ${allowedStatuses.join(', ')})` });
  }
  try {
    const r = await pool.query(
      'UPDATE materiel SET fournisseur=$1, prix_achat=$2, remise_fournisseur=$3, commentaire=$4, commande_status=$5 WHERE id=$6 RETURNING *',
      [fournisseur, prix_achat, remise_fournisseur, commentaire, commande_status, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { console.error('Error updating materiel order:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Delete materiel (admin)
app.delete('/api/materiels/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM materiel WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { console.error('Error deleting materiel:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Relations: Agent --------------------
app.get('/api/agents/:matricule/relations', authenticateToken, async (req, res) => {
  const { matricule } = req.params;

  try {
    // 1) Agent principal
    const agentResult = await pool.query('SELECT * FROM agent WHERE matricule = $1', [matricule]);
    const agent = agentResult.rows[0];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // 2) Passeport lié à l’agent
    const passeportResult = await pool.query(
      'SELECT * FROM passeport WHERE agent_matricule = $1',
      [matricule]
    );
    const passeport = passeportResult.rows[0] || null;

    // 3) Formations de l’agent
    const formationsResult = await pool.query(
      'SELECT * FROM formation WHERE agent_matricule = $1 ORDER BY id DESC',
      [matricule]
    );
    const formations = formationsResult.rows;

    // 4) Interventions liées via tickets dont l’agent est responsable
    const interventionsResult = await pool.query(
      `
      SELECT i.*, 
             t.id AS ticket_id, 
             t.titre AS ticket_titre, 
             s.id AS site_id, 
             s.nom_site AS site_nom
      FROM intervention i
      JOIN ticket t ON i.ticket_id = t.id
      JOIN ticket_responsable tr ON tr.ticket_id = t.id
      LEFT JOIN site s ON t.site_id = s.id
      WHERE tr.agent_matricule = $1
      ORDER BY i.date_debut DESC NULLS LAST, i.id DESC
      `,
      [matricule]
    );
    const interventions = interventionsResult.rows;

    // 5) Sites distincts associés à ces tickets
    const sitesResult = await pool.query(
      `
      SELECT DISTINCT s.*
      FROM site s
      JOIN ticket t ON t.site_id = s.id
      JOIN ticket_responsable tr ON tr.ticket_id = t.id
      WHERE tr.agent_matricule = $1
      ORDER BY s.id ASC
      `,
      [matricule]
    );
    const sites = sitesResult.rows;

    // ✅ Réponse complète
    res.json({ agent, passeport, formations, interventions, sites });
  } catch (err) {
    console.error('❌ Error fetching agent relations:', err);
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
    const result = await pool.query('SELECT c.*, a.libelle as adresse_libelle, a.ligne1, a.ligne2, a.code_postal, a.ville, a.pays FROM client c LEFT JOIN adresse a ON c.adresse_id = a.id ORDER BY c.nom_client ASC');
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
app.put('/api/clients/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { nom_client, representant_nom, representant_email, representant_tel, commentaire, adresse_ligne1, adresse_ligne2, adresse_code_postal, adresse_ville, adresse_pays } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Capture old email to propagate to users if changed
    let oldEmail = null;
    try {
      const rOld = await client.query('SELECT representant_email FROM client WHERE id=$1', [id]);
      oldEmail = (rOld.rows[0] || {}).representant_email || null;
    } catch (_) {}
    let adresseId = null;

    // Check if address details are provided
    if (adresse_ligne1 || adresse_ligne2 || adresse_code_postal || adresse_ville || adresse_pays) {
        // Try to find an existing address for the client
        const existingClient = await client.query('SELECT adresse_id FROM client WHERE id=$1', [id]);
        const existingAdresseId = existingClient.rows[0]?.adresse_id;

        if (existingAdresseId) {
            // Update existing address
            const adresseResult = await client.query(
                'UPDATE adresse SET ligne1=$1, ligne2=$2, code_postal=$3, ville=$4, pays=$5 WHERE id=$6 RETURNING id',
                [adresse_ligne1 || null, adresse_ligne2 || null, adresse_code_postal || null, adresse_ville || null, adresse_pays || null, existingAdresseId]
            );
            adresseId = adresseResult.rows[0].id;
        } else {
            // Create new address
            const adresseResult = await client.query(
                'INSERT INTO adresse (ligne1, ligne2, code_postal, ville, pays) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [adresse_ligne1 || null, adresse_ligne2 || null, adresse_code_postal || null, adresse_ville || null, adresse_pays || null]
            );
            adresseId = adresseResult.rows[0].id;
        }
    }

    const result = await client.query(
      'UPDATE client SET nom_client=$1, representant_nom=$2, representant_email=$3, representant_tel=$4, adresse_id=$5, commentaire=$6 WHERE id=$7 RETURNING *',
      [nom_client, representant_nom || null, representant_email || null, representant_tel || null, adresseId, commentaire || null, id]
    );
    // Propagate email change to users.email if a matching user exists
    try {
      if (oldEmail && representant_email && String(oldEmail).trim().toLowerCase() !== String(representant_email).trim().toLowerCase()) {
        await client.query('UPDATE users SET email=$1 WHERE email=$2', [representant_email, oldEmail]);
      }
    } catch (eUp) {
      if (eUp && eUp.code === '23505') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Email already in use' });
      }
      throw eUp;
    }
    await client.query('COMMIT');
    res.json(result.rows[0] || null);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
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

// -------------------- Client Representatives API (Junction) --------------------

// List representatives (users) for a client
app.get('/api/clients/:id/representants', authenticateToken, async (req, res) => {
    const { id: clientId } = req.params;
    try {
        const result = await pool.query(
            `SELECT cr.id as client_representant_id,
                    cr.client_id,
                    cr.user_id,
                    COALESCE(cr.nom, a.nom) as nom,
                    a.prenom,
                    COALESCE(cr.email, u.email) as email,
                    COALESCE(cr.tel, a.tel) as tel,
                    cr.fonction
             FROM client_representant cr
             LEFT JOIN users u ON u.id = cr.user_id
             LEFT JOIN agent a ON u.id = a.user_id
             WHERE cr.client_id = $1
             ORDER BY COALESCE(cr.nom, a.nom, u.email)`,
            [clientId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(`Error fetching representatives for client ${clientId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Link a user to a client as a representative
app.post('/api/clients/:id/representants', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id: clientId } = req.params;
    const { user_id, nom, email, tel, fonction } = req.body;

    if (!user_id && !email) { // user_id or email must be provided to identify the user
        return res.status(400).json({ error: 'user_id or email is required' });
    }

    let actualUserId = user_id;

    // If email is provided but user_id is not, try to find user by email
    if (!actualUserId && email) {
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userResult.rows.length > 0) {
            actualUserId = userResult.rows[0].id;
        } else {
            return res.status(404).json({ error: 'User with provided email not found. Please create the user first.' });
        }
    } else if (!actualUserId) { // If neither user_id nor email
        return res.status(400).json({ error: 'user_id or email is required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO client_representant (client_id, user_id, nom, email, tel, fonction) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [clientId, actualUserId, nom || null, email || null, tel || null, fonction || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'This user is already a representative for this client.' });
        }
        console.error(`Error adding representative to client ${clientId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update a representative (junction + custom fields)
app.put('/api/client_representant/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { fonction=null, nom=null, email=null, tel=null } = req.body || {};

    try {
        const result = await pool.query(
            'UPDATE client_representant SET fonction = $1, nom = $2, email = $3, tel = $4 WHERE id = $5 RETURNING *',
            [fonction, nom, email, tel, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Representative link not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating client_representant ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete a representative
app.delete('/api/client_representant/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM client_representant WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Representative link not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting client_representant ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Contrats API --------------------

// List all contracts
app.get('/api/contrats', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.*,
                cl.nom_client,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', s.id, 'nom_site', s.nom_site))
                     FROM contrat_site_association csa JOIN site s ON csa.site_id = s.id
                     WHERE csa.contrat_id = c.id),
                    '[]'::json
                ) AS sites_linked,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', unique_asso.id, 'titre', unique_asso.titre))
                     FROM (
                        SELECT DISTINCT asso.id, asso.titre
                        FROM contrat_site_association csa
                        JOIN association_site asi ON csa.site_id = asi.site_id
                        JOIN association asso ON asi.association_id = asso.id
                     WHERE csa.contrat_id = c.id
                     ) AS unique_asso),
                    '[]'::json
                ) AS associations
            FROM contrat c
            LEFT JOIN client cl ON cl.id = c.client_id
            ORDER BY c.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching contracts:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get a single contract by ID
app.get('/api/contrats/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM contrat WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error fetching contract ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create a contract
app.post('/api/contrats', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, date_debut, date_fin, client_id, site_id } = req.body;
    if (!titre || !date_debut) {
        return res.status(400).json({ error: 'Title and start date are required' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO contrat (titre, date_debut, date_fin, client_id, site_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [titre, date_debut, date_fin || null, client_id || null, site_id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating contract:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update a contract
app.put('/api/contrats/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { titre, date_debut, date_fin, client_id, site_id } = req.body;
    if (!titre || !date_debut) {
        return res.status(400).json({ error: 'Title and start date are required' });
    }
    try {
        const result = await pool.query(
            'UPDATE contrat SET titre = $1, date_debut = $2, date_fin = $3, client_id = $4, site_id = $5 WHERE id = $6 RETURNING *',
            [titre, date_debut, date_fin || null, client_id || null, site_id || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating contract ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete a contract
app.delete('/api/contrats/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM contrat WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting contract ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Contrat-Site Association API --------------------

// List sites for a specific contract
app.get('/api/contrats/:id/sites', authenticateToken, async (req, res) => {
    const { id: contratId } = req.params;
    try {
        const result = await pool.query(
            `SELECT cs.id as association_id, s.id as site_id, s.nom_site, s.adresse_id, s.commentaire
             FROM contrat_site_association cs
             JOIN site s ON cs.site_id = s.id
             WHERE cs.contrat_id = $1
             ORDER BY s.nom_site`,
            [contratId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(`Error fetching sites for contract ${contratId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Link a site to a contract
app.post('/api/contrats/:id/sites', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id: contratId } = req.params;
    const { site_id } = req.body;

    if (!site_id) {
        return res.status(400).json({ error: 'site_id is required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO contrat_site_association (contrat_id, site_id) VALUES ($1, $2) RETURNING *',
            [contratId, site_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'This site is already linked to this contract.' });
        }
        console.error(`Error linking site ${site_id} to contract ${contratId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Unlink a site from a contract (deletes the association record)
app.delete('/api/contrat_site_association/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM contrat_site_association WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contract-site association not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error(`Error unlinking site from contract ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Associations API --------------------

// List all associations
app.get('/api/associations', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT a.*, ad.ligne1, ad.code_postal, ad.ville FROM association a LEFT JOIN adresse ad ON a.adresse_id = ad.id ORDER BY a.created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching associations:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Associations liées à un contrat
// NOTE: En production (Heroku), la table `contrat_association` n'existe pas.
// On remonte donc les associations via le client du contrat:
// - contrat.client_id (si la colonne existe)
// - sinon via client_contrat (contrat_id -> client_id)
async function getClientIdForContrat(contratId) {
  // 1) Essayer contrat.client_id si la colonne existe
  try {
    const r = await pool.query('SELECT client_id FROM contrat WHERE id = $1', [contratId]);
    const clientId = r.rows?.[0]?.client_id;
    if (clientId) return clientId;
  } catch (e) {
    // colonne absente sur certains schémas -> fallback
    if (!/column .*client_id.* does not exist/i.test(String(e?.message || ''))) {
      throw e;
    }
  }

  // 2) Fallback via client_contrat
  const r2 = await pool.query(
    'SELECT client_id FROM client_contrat WHERE contrat_id = $1 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1',
    [contratId]
  );
  return r2.rows?.[0]?.client_id || null;
}

app.get('/api/contrats/:id/associations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const clientId = await getClientIdForContrat(id);
    if (!clientId) return res.json([]);

    const result = await pool.query(
      `
        SELECT a.*, ad.ligne1, ad.code_postal, ad.ville
        FROM client_association ca
        JOIN association a ON a.id = ca.association_id
        LEFT JOIN adresse ad ON a.adresse_id = ad.id
        WHERE ca.client_id = $1
        ORDER BY ca.created_at DESC NULLS LAST, ca.id DESC
      `,
      [clientId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching associations for contract:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Associer une association à un contrat (via le client du contrat)
app.post('/api/contrats/:id/associations', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { association_id } = req.body;
  if (!association_id) return res.status(400).json({ error: 'association_id is required' });

  try {
    const clientId = await getClientIdForContrat(id);
    if (!clientId) {
      return res.status(400).json({ error: "Ce contrat n'est rattaché à aucun client (impossible d'associer une association)." });
    }

    await pool.query(
      'INSERT INTO client_association (client_id, association_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [clientId, association_id]
    );
    const result = await pool.query(
      'SELECT a.*, ad.ligne1, ad.code_postal, ad.ville FROM association a LEFT JOIN adresse ad ON a.adresse_id=ad.id WHERE a.id=$1',
      [association_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error linking association to contract:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Dissocier une association d'un contrat (via le client du contrat)
app.delete('/api/contrats/:id/associations/:association_id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id, association_id } = req.params;
  try {
    const clientId = await getClientIdForContrat(id);
    if (!clientId) return res.status(404).json({ error: 'Association link not found' });

    const result = await pool.query(
      'DELETE FROM client_association WHERE client_id = $1 AND association_id = $2 RETURNING id',
      [clientId, association_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Association link not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Error unlinking association from contract:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get a single association
app.get('/api/associations/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM association WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Association not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error fetching association ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Associations liées à un client (client_association)
app.get('/api/clients/:id/associations', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
          SELECT a.* 
          FROM client_association ca 
          JOIN association a ON a.id = ca.association_id 
          WHERE ca.client_id = $1
          ORDER BY a.titre ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching client associations:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create an association
app.post('/api/associations', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, email_comptabilite, adresse_id } = req.body;
    if (!titre) {
        return res.status(400).json({ error: 'Titre is required' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO association (titre, email_comptabilite, adresse_id) VALUES ($1, $2, $3) RETURNING *',
            [titre, email_comptabilite || null, adresse_id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating association:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update an association
app.put('/api/associations/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { titre, email_comptabilite, adresse_id } = req.body;
    if (!titre) {
        return res.status(400).json({ error: 'Titre is required' });
    }
    try {
        const result = await pool.query(
            'UPDATE association SET titre = $1, email_comptabilite = $2, adresse_id = $3 WHERE id = $4 RETURNING *',
            [titre, email_comptabilite || null, adresse_id || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Association not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating association ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete an association
app.delete('/api/associations/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM association WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Association not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting association ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/associations/:id/relations', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const associationRes = await pool.query('SELECT * FROM association WHERE id = $1', [id]);
        const association = associationRes.rows[0];
        if (!association) {
            return res.status(404).json({ error: 'Association not found' });
        }

        const address = association.adresse_id ? (await pool.query('SELECT * FROM adresse WHERE id = $1', [association.adresse_id])).rows[0] : null;
        const responsables = (await pool.query("SELECT a.* FROM agent a JOIN association_responsable ar ON a.matricule = ar.agent_matricule WHERE ar.association_id = $1", [id])).rows;
        const agents = (await pool.query("SELECT a.* FROM agent a JOIN association_agent aa ON a.matricule = aa.agent_matricule WHERE aa.association_id = $1", [id])).rows;
        const sites = (await pool.query("SELECT s.* FROM site s JOIN association_site asi ON s.id = asi.site_id WHERE asi.association_id = $1", [id])).rows;
        // Certaines bases n'ont pas la colonne date_emission : tentative, sinon fallback
        let factures = [];
        try {
          factures = (await pool.query("SELECT * FROM facture WHERE association_id = $1 ORDER BY date_emission DESC", [id])).rows;
        } catch (_) {
          try {
            factures = (await pool.query("SELECT * FROM facture WHERE association_id = $1 ORDER BY COALESCE(created_at, id) DESC", [id])).rows;
          } catch {
            factures = [];
          }
        }
        const devis = (await pool.query("SELECT * FROM devis WHERE association_id = $1 ORDER BY created_at DESC", [id])).rows;

        res.json({ association, address, responsables, agents, sites, factures, devis });

    } catch (err) {
        console.error(`Error fetching relations for association ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// -------------------- Association Relationships API --------------------

// --- Responsables ---
app.get('/api/associations/:id/responsables', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT a.* FROM agent a JOIN association_responsable ar ON a.matricule = ar.agent_matricule WHERE ar.association_id = $1", [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching association responsables:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.post('/api/associations/:id/responsables', authenticateToken, authorizeAdmin, async (req, res) => {
    const { agent_matricule } = req.body;
    try {
        const result = await pool.query('INSERT INTO association_responsable (association_id, agent_matricule) VALUES ($1, $2) RETURNING *', [req.params.id, agent_matricule]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Responsable already assigned' });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.delete('/api/associations/:id/responsables/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM association_responsable WHERE association_id = $1 AND agent_matricule = $2', [req.params.id, req.params.matricule]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Agents ---
app.get('/api/associations/:id/agents', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT a.* FROM agent a JOIN association_agent aa ON a.matricule = aa.agent_matricule WHERE aa.association_id = $1", [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching association agents:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.post('/api/associations/:id/agents', authenticateToken, authorizeAdmin, async (req, res) => {
    const { agent_matricule } = req.body;
    try {
        const result = await pool.query('INSERT INTO association_agent (association_id, agent_matricule) VALUES ($1, $2) RETURNING *', [req.params.id, agent_matricule]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Agent already assigned' });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.delete('/api/associations/:id/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM association_agent WHERE association_id = $1 AND agent_matricule = $2', [req.params.id, req.params.matricule]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Sites ---
app.get('/api/associations/:id/sites', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT s.* FROM site s JOIN association_site asi ON s.id = asi.site_id WHERE asi.association_id = $1", [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching association sites:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.post('/api/associations/:id/sites', authenticateToken, authorizeAdmin, async (req, res) => {
    const { site_id } = req.body;
    try {
        const result = await pool.query('INSERT INTO association_site (association_id, site_id) VALUES ($1, $2) RETURNING *', [req.params.id, site_id]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Site already associated' });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.delete('/api/associations/:id/sites/:site_id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM association_site WHERE association_id = $1 AND site_id = $2', [req.params.id, req.params.site_id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Devis API --------------------

// List all devis, optionally filtered by association_id
app.get('/api/devis', authenticateToken, async (req, res) => {
    const { association_id } = req.query;
    try {
        let query = 'SELECT * FROM devis';
        const params = [];
        if (association_id) {
            query += ' WHERE association_id = $1';
            params.push(association_id);
        }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching devis:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get a single devis
app.get('/api/devis/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM devis WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Devis not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error fetching devis ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create a devis
app.post('/api/devis', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, description, montant, status, association_id } = req.body;
    if (!titre) {
        return res.status(400).json({ error: 'Titre is required' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO devis (titre, description, montant, status, association_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [titre, description || null, montant || null, status || 'Brouillon', association_id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating devis:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update a devis
app.put('/api/devis/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { titre, description, montant, status, association_id } = req.body;
    if (!titre) {
        return res.status(400).json({ error: 'Titre is required' });
    }
    try {
        const result = await pool.query(
            'UPDATE devis SET titre = $1, description = $2, montant = $3, status = $4, association_id = $5 WHERE id = $6 RETURNING *',
            [titre, description || null, montant || null, status || 'Brouillon', association_id || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Devis not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating devis ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete a devis
app.delete('/api/devis/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM devis WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Devis not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting devis ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});




// Client relations: include sites and demandes
app.get('/api/clients/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const c = (await pool.query('SELECT c.*, a.libelle AS adresse_libelle FROM client c LEFT JOIN adresse a ON c.adresse_id = a.id WHERE c.id=$1', [id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Not found' });
    const sites = (await pool.query('SELECT * FROM site WHERE client_id=$1 ORDER BY id DESC', [id])).rows;
    const demandes = (await pool.query('SELECT d.*, s.nom_site FROM demande_client d LEFT JOIN site s ON s.id=d.site_id WHERE d.client_id=$1 ORDER BY d.created_at DESC', [id])).rows;
    const contrats = (await pool.query('SELECT id, titre, date_debut, date_fin FROM contrat WHERE client_id=$1 ORDER BY created_at DESC', [id])).rows;
    const representants = (await pool.query(`
      SELECT
        cr.id AS client_representant_id,
        cr.client_id,
        cr.user_id,
        COALESCE(cr.nom, a.nom, u.email) AS nom,
        COALESCE(cr.email, u.email) AS email,
        COALESCE(cr.tel, a.tel, '') AS tel,
        cr.fonction
      FROM client_representant cr
      LEFT JOIN users u ON u.id = cr.user_id
      LEFT JOIN agent a ON a.user_id = u.id
      WHERE cr.client_id = $1
      ORDER BY COALESCE(cr.nom, a.nom, u.email)
    `, [id])).rows;
    // Associations liées : direct par client_id ou via les contrats du client
    const assocRows = (await pool.query(
      `SELECT DISTINCT a.*, ct.titre AS contrat_titre
       FROM association a
       LEFT JOIN association_site asi ON asi.association_id = a.id
       LEFT JOIN site s ON s.id = asi.site_id
       LEFT JOIN contrat_site_association csa ON csa.site_id = s.id
       LEFT JOIN contrat ct ON ct.id = csa.contrat_id
       WHERE s.client_id = $1 OR ct.client_id = $1
       ORDER BY a.id DESC`,
      [id]
    )).rows;

    res.json({ client: c, sites, demandes, contrats, representants, associations: assocRows });
  } catch (err) {
    console.error('Error fetching client relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Ajouter un représentant (compte utilisateur) à un client existant + lier dans client_representant
app.post('/api/clients/:id/representant', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, password, nom, tel, fonction } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const existingClient = (await pool.query('SELECT id, user_id FROM client WHERE id=$1', [id])).rows[0];
  if (!existingClient) return res.status(404).json({ error: 'Client not found' });

  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const alreadyUser = await cx.query('SELECT id FROM users WHERE email=$1', [email]);
    if (alreadyUser.rows[0]) { await cx.query('ROLLBACK'); return res.status(409).json({ error: 'User already exists' }); }

    const hashed = await bcrypt.hash(password, 10);
    const ures = await cx.query('INSERT INTO users (email, password, roles) VALUES ($1,$2,$3) RETURNING id,email,roles', [email, hashed, JSON.stringify(['ROLE_CLIENT'])]);
    const u = ures.rows[0];
    const cres = await cx.query(
      'UPDATE client SET representant_email=$1, representant_nom=COALESCE($2, representant_nom), representant_tel=COALESCE($3, representant_tel), user_id=$4 WHERE id=$5 RETURNING *',
      [email, nom || null, tel || null, u.id, id]
    );
    // Lier dans client_representant avec les champs supplémentaires
    try {
      await cx.query('INSERT INTO client_representant (client_id, user_id, nom, email, tel, fonction) VALUES ($1,$2,$3,$4,$5,$6)', [id, u.id, nom || null, email || null, tel || null, fonction || null]);
    } catch (_) {}

    await cx.query('COMMIT');
    return res.status(201).json({ user: u, client: cres.rows[0] });
  } catch (e) {
    try { await cx.query('ROLLBACK'); } catch(_) {}
    console.error('clients/add-representant failed:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    cx.release();
  }
});

// Admin: create demande for a specific client (optional site)
app.post('/api/clients/:id/demandes', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { site_id=null, description } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description is required' });
  try {
    const c = (await pool.query('SELECT id FROM client WHERE id=$1', [id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Client not found' });
    if (site_id) {
      const s = (await pool.query('SELECT id FROM site WHERE id=$1 AND client_id=$2', [site_id, id])).rows[0];
      if (!s) return res.status(403).json({ error: 'Site does not belong to client' });
    }
    const r = await pool.query('INSERT INTO demande_client (client_id, site_id, description) VALUES ($1,$2,$3) RETURNING *', [id, site_id || null, description]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Error creating demande for client:', err);
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
    const result = await pool.query(`
      SELECT 
        s.*, 
        ad.libelle as adresse_libelle, ad.ligne1, ad.ligne2, ad.code_postal, ad.ville, ad.pays,
        COALESCE(
          (SELECT json_agg(json_build_object('id', asso.id, 'titre', asso.titre))
           FROM association_site asi JOIN association asso ON asi.association_id = asso.id
           WHERE asi.site_id = s.id),
          '[]'
        ) AS associations
      FROM site s
      LEFT JOIN adresse ad ON s.adresse_id = ad.id 
      ORDER BY s.id DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sites:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/sites/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log(`Fetching site with ID: ${id}`); // Debug log
  const siteId = parseInt(id, 10);
  if (isNaN(siteId)) {
    return res.status(400).json({ error: 'Invalid site ID' });
  }
  try {
    const r = await pool.query('SELECT * FROM site WHERE id=$1', [siteId]);
    console.log(`Query for site ID ${siteId} returned ${r.rowCount} rows.`);
    if (r.rows[0]) {
        console.log('Row data:', r.rows[0]);
    }
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error fetching site:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/sites', authenticateToken, authorizeAdmin, async (req, res) => {
  const { nom_site, adresse_id, commentaire, client_id, statut } = req.body; // Add statut
  if (statut && !['Actif', 'Inactif'].includes(statut)) {
    return res.status(400).json({ error: 'Invalid value for statut. Must be "Actif" or "Inactif".' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO site (nom_site, adresse_id, commentaire, client_id, statut) VALUES ($1,$2,$3,$4,$5) RETURNING *', // Add statut to INSERT
      [nom_site, adresse_id || null, commentaire || null, client_id || null, statut || 'Actif'] // Add statut value, default to 'Actif'
    );
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
  const { nom_affaire, numero_affaire, client_id, description } = req.body;
  try {
    const result = await pool.query('INSERT INTO affaire (nom_affaire, numero_affaire, client_id, description) VALUES ($1,$2,$3,$4) RETURNING *', [nom_affaire, numero_affaire || null, client_id || null, description || null]);
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

// Get Affaire relations
app.get('/api/affaires/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const affaireRes = await pool.query('SELECT * FROM affaire WHERE id = $1', [id]);
    const affaire = affaireRes.rows[0];
    if (!affaire) {
      return res.status(404).json({ error: 'Affaire not found' });
    }

    let client = null;
    if (affaire.client_id) {
      const clientRes = await pool.query('SELECT * FROM client WHERE id = $1', [affaire.client_id]);
      client = clientRes.rows[0];
    }

    const ticketsRes = await pool.query('SELECT * FROM ticket WHERE affaire_id = $1 ORDER BY id DESC', [id]);
    const tickets = ticketsRes.rows;

    res.json({ affaire, client, tickets });
  } catch (err) {
    console.error(`Error fetching relations for affaire ${id}:`, err);
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

app.get('/api/agents/:matricule', authenticateToken, async (req, res) => {
    const { matricule } = req.params;
    try {
        const result = await pool.query('SELECT agent.*, agence.titre as agence_titre FROM agent JOIN agence ON agent.agence_id = agence.id WHERE agent.matricule = $1', [matricule]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Agent not found' });
        }
    } catch (err) {
        console.error(`Error fetching agent with matricule ${matricule}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/agents', authenticateToken, authorizeAdmin, async (req, res) => {
    const { matricule, nom, prenom, email, tel, agence_id, actif, admin } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1) Associer ou créer un user si email fourni
        let userId = null;
        if (email) {
            const existingUser = await client.query('SELECT id, roles FROM users WHERE email = $1 LIMIT 1', [email]);
            if (existingUser.rows.length) {
                userId = existingUser.rows[0].id;
                // Aligne les rôles si besoin
                let roles = [];
                try { roles = JSON.parse(existingUser.rows[0].roles || '[]'); } catch { roles = []; }
                if (!roles.includes('ROLE_USER')) roles.push('ROLE_USER');
                const hasAdmin = roles.includes('ROLE_ADMIN');
                if (admin && !hasAdmin) roles.push('ROLE_ADMIN');
                if (!admin && hasAdmin) roles = roles.filter(r => r !== 'ROLE_ADMIN');
                await client.query('UPDATE users SET roles = $1 WHERE id = $2', [JSON.stringify(roles), userId]);
            } else {
                // Crée un user avec mot de passe par défaut
                const pwdPlain = process.env.DEFAULT_USER_PASSWORD || 'changeme';
                const hash = await bcrypt.hash(pwdPlain, 10);
                let roles = ['ROLE_USER'];
                if (admin) roles.push('ROLE_ADMIN');
                const insUser = await client.query(
                  'INSERT INTO users (email, roles, password) VALUES ($1, $2, $3) RETURNING id',
                  [email, JSON.stringify(roles), hash]
                );
                userId = insUser.rows[0].id;
            }
        }

        // 2) Crée l’agent
        const result = await client.query(
            'INSERT INTO agent (matricule, nom, prenom, email, tel, agence_id, actif, admin, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [matricule, nom, prenom, email, tel, agence_id, actif, admin, userId]
        );

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating agent:', err);
        if (err.code === '23505') {
          return res.status(409).json({ error: 'Matricule ou email déjà utilisé.' });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

app.put('/api/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
    const { matricule } = req.params;
    console.log('Received body for agent update:', req.body);
    const { nom, prenom, email, tel, agence_id, actif, admin, fonction, agence } = req.body;
    try {
        const result = await pool.query(
            'UPDATE agent SET nom = $1, prenom = $2, email = $3, tel = $4, agence_id = $5, actif = $6, admin = $7, fonction = $8, agence = $9 WHERE matricule = $10 RETURNING *',
            [nom, prenom, email, tel, agence_id, actif, admin, fonction, agence, matricule]
        );
        if (result.rows.length > 0) {
            const updatedAgent = result.rows[0];

            // --- Synchronise roles dans la table users si l'agent a un compte lié ---
            try {
              // Cherche par user_id si présent, sinon par email
              let userRow = null;
              if (updatedAgent.user_id) {
                const uRes = await pool.query('SELECT id, roles, email FROM users WHERE id = $1', [updatedAgent.user_id]);
                userRow = uRes.rows[0];
              } else if (email) {
                const uRes = await pool.query('SELECT id, roles, email FROM users WHERE email = $1 LIMIT 1', [email]);
                userRow = uRes.rows[0];
              }

              if (userRow) {
                let roles = [];
                try { roles = JSON.parse(userRow.roles || '[]'); } catch { roles = []; }
                const hasAdmin = roles.includes('ROLE_ADMIN');
                if (admin === true && !hasAdmin) roles.push('ROLE_ADMIN');
                if (admin === false && hasAdmin) roles = roles.filter(r => r !== 'ROLE_ADMIN');

                // Mise à jour email si différent
                if (email && email !== userRow.email) {
                  try {
                    await pool.query('UPDATE users SET email = $1, roles = $2 WHERE id = $3', [email, JSON.stringify(roles), userRow.id]);
                  } catch (emailErr) {
                    if (emailErr.code === '23505') {
                      console.warn(`Email déjà utilisé, impossible de mettre à jour l'utilisateur lié à l'agent ${matricule}`);
                    } else {
                      throw emailErr;
                    }
                  }
                } else {
                  await pool.query('UPDATE users SET roles = $1 WHERE id = $2', [JSON.stringify(roles), userRow.id]);
                }
              }
            } catch (syncErr) {
              console.warn('Sync agent->users roles/email failed:', syncErr.message);
            }

            res.json(updatedAgent);
        } else {
            res.status(404).json({ error: 'Agent not found' });
        }
    } catch (err) {
        console.error(`Error updating agent with matricule ${matricule}:`, err);
        if (err.code === '23505') { // Unique violation
            return res.status(409).json({ error: `L\'email ou le matricule est déjà utilisé.` });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
  const { matricule } = req.params;

  try {
    console.log(`🗑️ Tentative de suppression de l'agent ${matricule}...`);

    // Vérifie si l’agent existe
    const existing = await pool.query('SELECT matricule FROM agent WHERE matricule = $1', [matricule]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: `Agent ${matricule} introuvable` });
    }

    // Supprime d’abord les relations liées (si pas de CASCADE en DB)
    await pool.query('DELETE FROM ticket_responsable WHERE agent_matricule = $1', [matricule]);
    await pool.query('DELETE FROM agence_membre WHERE agent_matricule = $1', [matricule]);
    await pool.query('DELETE FROM agent_fonction WHERE agent_matricule = $1', [matricule]);
    await pool.query('DELETE FROM formation WHERE agent_matricule = $1', [matricule]);
    await pool.query('DELETE FROM passeport WHERE agent_matricule = $1', [matricule]);

    // Supprime l’agent
    const result = await pool.query('DELETE FROM agent WHERE matricule = $1', [matricule]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: `Aucun agent trouvé avec le matricule ${matricule}` });
    }

    console.log(`✅ Agent ${matricule} supprimé avec succès`);
    res.status(200).json({ message: `Agent ${matricule} supprimé avec succès` });

  } catch (err) {
    console.error(`❌ Erreur lors de la suppression de ${matricule}:`, err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});


// API Route for inviting agents and assigning to intervention
app.post('/api/invite-agent', authenticateToken, authorizeAdmin, async (req, res) => {
    const { email, intervention_id, expires_at } = req.body;
    if (!email || !intervention_id) {
        return res.status(400).json({ error: 'Email and intervention_id are required' });
    }
    // Basic email format validation to avoid SMTP attempts with invalid addresses
    try {
      const em = String(email || '').trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
      if (!emailOk) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    } catch (_) {}

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find or create user
        let userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        let userId;
        let tempPassword = null;
        if (userResult.rows.length === 0) {
            // User does not exist, create a new one with a temporary password
            tempPassword = Math.random().toString(36).slice(-8); // Generate a random password
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

        // Create a password reset token to let the agent define a password via UI
        try {
          const resetToken = crypto.randomBytes(32).toString('hex');
          const exp = (() => {
            if (expires_at) {
              // expect ISO string like 2025-01-30T23:59:00
              const d = new Date(expires_at);
              if (!isNaN(d.getTime())) return d;
            }
            // default: 48h validity
            return new Date(Date.now() + 48 * 3600 * 1000);
          })();
          await client.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [userId, resetToken, exp]
          );
          const host = (req.get && req.get('host')) || 'localhost:'+String(port);
          const proto = (req.headers && req.headers['x-forwarded-proto']) || req.protocol || 'http';
          const resetLink = `${proto}://${host}/reset-password.html?token=${resetToken}`;
          try {
            await sendMail({
              to: email,
              subject: 'Invitation à définir votre mot de passe',
              text: `Bonjour,\n\nVous avez été invité(e) à accéder à la plateforme. Définissez votre mot de passe via ce lien: ${resetLink}\n\nCe lien expire le ${exp.toISOString()}.`,
              html: `<p>Bonjour,</p><p>Vous avez été invité(e) à accéder à la plateforme.</p><p>Pour définir votre mot de passe, cliquez <a href="${resetLink}">ici</a>.</p><p>Ce lien expire le <strong>${exp.toISOString()}</strong>.</p>`
            });
          } catch (mailErr) {
            console.warn('invite-agent: email send failed; falling back to console log:', mailErr.message);
            console.log(`Invitation link for ${email}: ${resetLink}`);
          }
        } catch (e) {
          console.warn('invite-agent: could not create/send reset token:', e.message);
        }

        // 2. Find or create agent and link to user
        let agentResult = await client.query('SELECT matricule FROM agent WHERE email = $1', [email]);
        let agentMatricule;
        if (agentResult.rows.length === 0) {
            // No agent found by email, try by user_id
            agentResult = await client.query('SELECT matricule FROM agent WHERE user_id = $1', [userId]);
            if (agentResult.rows.length === 0) {
                // Agent does not exist, create a new one
                const newMatricule = `AGT${Math.floor(100 + Math.random() * 900)}`; // Simple random matricule
                const newAgent = await client.query(
                    'INSERT INTO agent (matricule, nom, prenom, email, agence_id, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING matricule',
                    [newMatricule, 'InvitÃ©', 'Agent', email, 1, userId] // Assuming agence_id 1 exists
                );
                agentMatricule = newAgent.rows[0].matricule;
            } else {
                agentMatricule = agentResult.rows[0].matricule;
            }
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
            [1, 1, newTicketTitle, 'Nouvelle tÃ¢che pour agent invitÃ©', 'Pas_commence', agentMatricule] // Assuming doe_id 1 and affaire_id 1 exist
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
        const newTicketDescription = `L'agent ${agentMatricule} (${userEmail}) demande Ã  Ãªtre affiliÃ© Ã  l'intervention ${intervention_id}.`;

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
// Admin: Create a new client
app.post('/api/clients', authenticateToken, authorizeAdmin, async (req, res) => {
    const { nom_client, representant_nom, representant_email, representant_tel, commentaire, adresse_ligne1, adresse_ligne2, adresse_code_postal, adresse_ville, adresse_pays } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let adresseId = null;
        if (adresse_ligne1 && adresse_code_postal && adresse_ville && adresse_pays) {
            const adresseResult = await client.query(
                'INSERT INTO adresse (ligne1, ligne2, code_postal, ville, pays) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [adresse_ligne1, adresse_ligne2 || null, adresse_code_postal, adresse_ville, adresse_pays]
            );
            adresseId = adresseResult.rows[0].id;
        }

        const result = await client.query(
            'INSERT INTO client (nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [nom_client, representant_nom || null, representant_email || null, representant_tel || null, adresseId, commentaire || null]
        );
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating client:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
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



app.put('/api/sites/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { nom_site, adresse_id, commentaire, ticket, responsable_matricule, statut, client_id } = req.body; // Add client_id

    if (!nom_site || typeof nom_site !== 'string' || nom_site.trim() === '') {
        return res.status(400).json({ error: 'Le champ nom_site est obligatoire.' });
    }
    if (statut && !['Actif', 'Inactif'].includes(statut)) { // Add statut validation
      return res.status(400).json({ error: 'Invalid value for statut. Must be "Actif" or "Inactif".' });
    }

    try {
        const result = await pool.query(
            'UPDATE site SET nom_site = $1, adresse_id = $2, commentaire = $3, ticket = $4, responsable_matricule = $5, statut = COALESCE($6::site_status, statut), client_id = COALESCE($7, client_id) WHERE id = $8 RETURNING *', // Use site_status ENUM
            [nom_site, adresse_id, commentaire, ticket, responsable_matricule, statut || null, client_id || null, id] // Add client_id value
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

// Helper: récupérer les agents associés au ticket (agents assignés ou responsable principal)
async function getAgentsForTicket(ticketId) {
  const agents = [];
  const assignRes = await pool.query('SELECT agent_matricule FROM ticket_agent WHERE ticket_id=$1', [ticketId]);
  assignRes.rows.forEach(r => agents.push(r.agent_matricule));
  if (!agents.length) {
    const respRes = await pool.query('SELECT responsable FROM ticket WHERE id=$1', [ticketId]);
    if (respRes.rows.length && respRes.rows[0].responsable) agents.push(respRes.rows[0].responsable);
  }
  // Uniques
  return [...new Set(agents.filter(Boolean))];
}

// Helper: créer/mettre à jour les événements d'intervention par agent
async function syncInterventionEvents(interventionRow) {
  if (!interventionRow || !interventionRow.id || !interventionRow.ticket_id) return;
  const agentMatricules = await getAgentsForTicket(interventionRow.ticket_id);
  if (!agentMatricules.length) return;
  const titre = interventionRow.titre || `Intervention #${interventionRow.id}`;
  const desc  = interventionRow.description || '';
  const dateDebut = interventionRow.date_debut;
  const dateFinPrevue = interventionRow.date_fin || null;
  const dateFinReelle = interventionRow.date_fin || null;
  const mapStatut = (s) => {
    switch ((s || '').toLowerCase()) {
      case 'en_cours': return 'En_cours';
      case 'termine': return 'Termine';
      case 'annulee':
      case 'annule':
      case 'annulée': return 'Annule';
      default: return 'Planifie';
    }
  };
  const statutEvent = mapStatut(interventionRow.status);

  for (const m of agentMatricules) {
    const existing = await pool.query(
      'SELECT id FROM intervention_event WHERE intervention_id=$1 AND agent_matricule=$2 LIMIT 1',
      [interventionRow.id, m]
    );
    if (existing.rows.length) {
      await pool.query(
        `UPDATE intervention_event
         SET titre=$1,
             description=$2,
             date_heure_debut_prevue=$3,
             date_heure_fin_prevue=$4,
             date_heure_fin_reelle=COALESCE(date_heure_fin_reelle, $5),
             statut=$6,
             updated_at=NOW()
         WHERE id=$7`,
        [titre, desc, dateDebut, dateFinPrevue, dateFinReelle, statutEvent, existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO intervention_event (intervention_id, agent_matricule, titre, description, date_heure_debut_prevue, date_heure_fin_prevue, statut, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())`,
        [interventionRow.id, m, titre, desc, dateDebut, dateFinPrevue, statutEvent]
      );
    }
  }
}

// Ensure intervention_event has statut column (for legacy schemas)
async function ensureInterventionEventSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE intervention_event
      ADD COLUMN IF NOT EXISTS statut intervention_event_statut DEFAULT 'Planifie'
    `);
  } catch (e) {
    console.warn('ensureInterventionEventSchema failed:', e.message);
  } finally {
    client.release();
  }
}

// Helper: lier un matériel créé à une demande (et donc à l'intervention associée)
async function linkMaterielToDemande(demandeMaterielId, materielId, quantite) {
  if (!demandeMaterielId || !materielId) return;
  // récupérer la demande pour connaître l'intervention
  const dRes = await pool.query('SELECT id, intervention_id, ticket_id, quantite FROM demande_materiel WHERE id=$1', [demandeMaterielId]);
  const demande = dRes.rows[0];
  if (!demande) return;
  let interventionId = demande.intervention_id;
  // fallback: si pas d'intervention attachée à la demande, prendre la dernière intervention du ticket
  if (!interventionId && demande.ticket_id) {
    const iRes = await pool.query('SELECT id FROM intervention WHERE ticket_id=$1 ORDER BY date_debut DESC NULLS LAST, id DESC LIMIT 1', [demande.ticket_id]);
    if (iRes.rows[0]) interventionId = iRes.rows[0].id;
  }
  if (!interventionId) return;
  const qty = quantite || demande.quantite || 1;
  // Upsert dans intervention_materiel
  const existing = await pool.query(
    'SELECT id FROM intervention_materiel WHERE intervention_id=$1 AND materiel_id=$2 LIMIT 1',
    [interventionId, materielId]
  );
  if (existing.rows.length) {
    await pool.query(
      'UPDATE intervention_materiel SET quantite=$1 WHERE id=$2',
      [qty, existing.rows[0].id]
    );
  } else {
    await pool.query(
      'INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite) VALUES ($1,$2,$3)',
       [interventionId, materielId, qty]
    );
  }
}

// -------------------- RÃ¨glements --------------------
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
// Ensure assignment tables for responsables/agents assignés
async function ensureAssignmentTables() {
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS ticket_agent (id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES ticket(id) ON DELETE CASCADE, agent_matricule TEXT NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE, date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP, date_fin TIMESTAMP WITHOUT TIME ZONE NULL, created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_ticket_agent_ticket ON ticket_agent(ticket_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_ticket_agent_agent ON ticket_agent(agent_matricule)");
    await client.query("CREATE TABLE IF NOT EXISTS site_responsable (id SERIAL PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES site(id) ON DELETE CASCADE, agent_matricule TEXT NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE, role TEXT DEFAULT 'Responsable', date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, date_fin TIMESTAMP WITHOUT TIME ZONE NULL, created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_site_responsable_site ON site_responsable(site_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_site_responsable_agent ON site_responsable(agent_matricule)");
    await client.query("CREATE TABLE IF NOT EXISTS site_agent (id SERIAL PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES site(id) ON DELETE CASCADE, agent_matricule TEXT NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE, date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, date_fin TIMESTAMP WITHOUT TIME ZONE NULL, created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_site_agent_site ON site_agent(site_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_site_agent_agent ON site_agent(agent_matricule)");

    // New tables for travaux assignments and satisfaction
    await client.query("CREATE TABLE IF NOT EXISTS travaux_agent (id SERIAL PRIMARY KEY, travaux_id BIGINT NOT NULL REFERENCES travaux(id) ON DELETE CASCADE, agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE, date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP, date_fin TIMESTAMP WITHOUT TIME ZONE NULL)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_travaux_agent_travaux ON travaux_agent(travaux_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_travaux_agent_agent ON travaux_agent(agent_matricule)");

    await client.query("CREATE TABLE IF NOT EXISTS travaux_responsable (id SERIAL PRIMARY KEY, travaux_id BIGINT NOT NULL REFERENCES travaux(id) ON DELETE CASCADE, agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE, role TEXT DEFAULT 'Secondaire', date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, date_fin TIMESTAMP WITHOUT TIME ZONE NULL, created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_travaux_responsable_travaux ON travaux_responsable(travaux_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_travaux_responsable_agent ON travaux_responsable(agent_matricule)");

    await client.query("CREATE TABLE IF NOT EXISTS travaux_satisfaction (id SERIAL PRIMARY KEY, travaux_id BIGINT NOT NULL UNIQUE REFERENCES travaux(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, rating INT, comment TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, envoieok BOOLEAN DEFAULT FALSE)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_travaux_satisfaction_travaux ON travaux_satisfaction(travaux_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_travaux_satisfaction_user ON travaux_satisfaction(user_id)");

    // New table for travaux tache
    await client.query("CREATE TABLE IF NOT EXISTS travaux_tache (id SERIAL PRIMARY KEY, travaux_id BIGINT NOT NULL REFERENCES travaux(id) ON DELETE CASCADE, titre VARCHAR(255) NOT NULL, description TEXT, etat etat_travaux DEFAULT 'A_faire', priorite VARCHAR(50) DEFAULT 'Moyenne', date_echeance TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_travaux_tache_travaux ON travaux_tache(travaux_id)");

  } catch (e) { console.warn('ensureAssignmentTables failed:', e.message); } finally { client.release(); }
}
ensureAssignmentTables();

// Validator: Chef + admin
async function assertAgentIsChef(matricule) {
  const a = (await pool.query('SELECT admin, email, nom FROM agent WHERE matricule=$1', [matricule])).rows[0];
  if (!a) throw new Error('Agent not found');
  if (!a.admin) throw new Error('Agent must be admin');
  try {
    const r = await pool.query("SELECT 1 FROM agent_fonction af JOIN fonction f ON f.id=af.fonction_id WHERE af.agent_matricule=$1 AND (LOWER(f.nom)='chef' OR LOWER(COALESCE(f.titre,''))='chef') LIMIT 1", [matricule]);
    if (r.rows.length === 0) throw new Error('Agent must have fonction Chef');
  } catch (_) { /* tolerate environment without fonction tables */ }
}

// Sites: assign agent
app.post('/api/sites/:id/agents', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agent_matricule, date_debut=null, date_fin=null } = req.body;
  if (!agent_matricule) return res.status(400).json({ error: 'agent_matricule is required' });
  try {
    const s = (await pool.query('SELECT id FROM site WHERE id=$1', [id])).rows[0]; if (!s) return res.status(404).json({ error: 'Site not found' });
    const a = (await pool.query('SELECT matricule FROM agent WHERE matricule=$1', [agent_matricule])).rows[0]; if (!a) return res.status(404).json({ error: 'Agent not found' });
    const r = await pool.query('INSERT INTO site_agent (site_id, agent_matricule, date_debut, date_fin) VALUES ($1,$2,$3,$4) RETURNING *', [id, agent_matricule, date_debut, date_fin]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('site add agent:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/sites/:id/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
  try { const r = await pool.query('DELETE FROM site_agent WHERE site_id=$1 AND agent_matricule=$2 RETURNING id', [req.params.id, req.params.matricule]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json({ ok: true }); }
  catch (e) { console.error('site remove agent:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.post('/api/sites/:id/responsables', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agent_matricule, role='Responsable' } = req.body;
  if (!agent_matricule) return res.status(400).json({ error: 'agent_matricule is required' });
  try {
    await assertAgentIsChef(agent_matricule);
    const s = (await pool.query('SELECT id FROM site WHERE id=$1', [id])).rows[0]; if (!s) return res.status(404).json({ error: 'Site not found' });
    const r = await pool.query('INSERT INTO site_responsable (site_id, agent_matricule, role) VALUES ($1,$2,$3) RETURNING *', [id, agent_matricule, role]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('site add responsable:', e); res.status(400).json({ error: e.message || 'Bad Request' }); }
});

// Modular routes
app.use('/api', createTicketsRoutes({
  pool,
  authenticateToken,
  authorizeAdmin,
  logAudit,
  assertAgentIsChef
}));

app.use('/api', createTravauxRoutes({
  pool,
  authenticateToken,
  authorizeAdmin,
  renduUpload,
  assertAgentIsChef
}));

app.use('/api', createInterventionsRoutes({
  pool,
  authenticateToken,
  authorizeAdmin,
  renduUpload,
  syncInterventionEvents
}));
app.use('/api', createClientRoutes({
  pool,
  authenticateToken,
  authorizeAdmin,
  bcrypt,
  getClientIdsForUser,
  userOwnsClientId,
  logAudit
}));
app.use('/api', createMessagingRoutes({
  pool,
  authenticateToken,
  upload
}));

initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Serving static files from ${__dirname}/public`);
    });
});






