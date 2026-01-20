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

const app = express();
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

// -------------------- Relations: Ticket --------------------
app.get('/api/tickets/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const ticket = (await pool.query('SELECT * FROM ticket WHERE id=$1', [id])).rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const doe = ticket.doe_id ? (await pool.query('SELECT * FROM doe WHERE id=$1', [ticket.doe_id])).rows[0] : null;
    const affaire = ticket.affaire_id ? (await pool.query('SELECT * FROM affaire WHERE id=$1', [ticket.affaire_id])).rows[0] : null;
    
    let site = null;
    if (ticket.site_id) {
        site = (await pool.query('SELECT * FROM site WHERE id=$1', [ticket.site_id])).rows[0] || null;
    } else if (doe?.site_id) {
        site = (await pool.query('SELECT * FROM site WHERE id=$1', [doe.site_id])).rows[0] || null;
    }

    let demande = null; // NEW: Declare demande here
    if (ticket.demande_id) { // NEW: Fetch demande if ticket.demande_id is present
      demande = (await pool.query('SELECT * FROM demande_client WHERE id=$1', [ticket.demande_id])).rows[0] || null;
    }

    const interventions = (await pool.query('SELECT * FROM intervention WHERE ticket_id=$1 ORDER BY id DESC', [id])).rows;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Ticket' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Ticket' AND cible_id=$1 ORDER BY id DESC", [id])).rows;

    const responsables = (await pool.query(`
      SELECT tr.id,
             tr.role,
             tr.date_debut,
             tr.date_fin,
             tr.agent_matricule,
             a.nom,
             a.prenom,
             a.email
      FROM ticket_responsable tr
      LEFT JOIN agent a ON a.matricule = tr.agent_matricule
      WHERE tr.ticket_id = $1
      ORDER BY tr.id DESC
    `, [id])).rows;

    const agents_assignes = (await pool.query(`
      SELECT ta.agent_matricule, ta.date_debut, ta.date_fin,
             a.nom, a.prenom
      FROM ticket_agent ta
      JOIN agent a ON a.matricule = ta.agent_matricule
      WHERE ta.ticket_id=$1
      ORDER BY COALESCE(ta.date_debut, CURRENT_TIMESTAMP) DESC, ta.id DESC
    `, [id])).rows;

    // Fetch satisfaction data
    const satisfaction = (await pool.query('SELECT rating, comment, envoieok FROM ticket_satisfaction WHERE ticket_id=$1', [id])).rows[0] || null;

    res.json({ ticket, doe, affaire, site, demande, interventions, documents, images, responsables, agents_assignes, satisfaction });
  } catch (err) {
    console.error('Error fetching ticket relations:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});


// -------------------- Relations: Intervention --------------------

// Endpoint for calendar
app.get('/api/interventions/calendar', authenticateToken, async (req, res) => {
    try {
        const { agent_ids } = req.query;

        let query = `
            SELECT 
                i.id,
                i.titre,
                i.description,
                i.date_debut,
                i.date_fin,
                a.nom as agent_nom,
                a.prenom as agent_prenom,
                a.matricule as agent_matricule,
                s.nom_site
            FROM intervention i
            LEFT JOIN ticket t ON i.ticket_id = t.id
            LEFT JOIN agent a ON t.responsable = a.matricule
            LEFT JOIN site s ON i.site_id = s.id
        `;

        const params = [];
        if (agent_ids) {
            const agentIdsList = agent_ids.split(',');
            query += ` WHERE a.matricule = ANY($1)`;
            params.push(agentIdsList);
        }

        const result = await pool.query(query, params);

        const events = result.rows.map(row => ({
            id: row.id,
            title: row.titre || 'Intervention #' + row.id,
            start: row.date_debut,
            end: row.date_fin,
            extendedProps: {
                description: `${row.description || ''}<br><b>Agent:</b> ${row.agent_prenom} ${row.agent_nom}<br><b>Site:</b> ${row.nom_site || 'Non spécifié'}`,
                agent: `${row.agent_prenom} ${row.agent_nom}`,
                site: row.nom_site
            },
            // You can add more properties like 'color' based on agent, etc.
        }));

        res.json(events);
    } catch (err) {
        console.error('Error fetching interventions for calendar:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/interventions/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const intervention = (await pool.query('SELECT * FROM intervention WHERE id=$1', [id])).rows[0];
    if (!intervention) return res.status(404).json({ error: 'Intervention not found' });

    const ticket = intervention.ticket_id
      ? (await pool.query('SELECT t.*, d.id as demande_id FROM ticket t LEFT JOIN demande_client d ON t.id = d.ticket_id WHERE t.id = $1', [intervention.ticket_id])).rows[0]
      : null;
    let doe = null;
    let site = null;
    let demande = null; // NEW: Declare demande here
    let affaire = null;

    // Prioritize site_id from intervention itself
    if (intervention.site_id) {
      site = (await pool.query('SELECT * FROM site WHERE id=$1', [intervention.site_id])).rows[0] || null;
    } else if (ticket && ticket.doe_id) { // Fallback to ticket's doe's site
      doe = (await pool.query('SELECT * FROM doe WHERE id=$1', [ticket.doe_id])).rows[0] || null;
      if (doe && doe.site_id) {
        site = (await pool.query('SELECT * FROM site WHERE id=$1', [doe.site_id])).rows[0] || null;
      }
    }

    // NEW: Prioritize demande_id from intervention itself
    if (intervention.demande_id) {
      demande = (await pool.query('SELECT * FROM demande_client WHERE id=$1', [intervention.demande_id])).rows[0] || null;
    } else if (ticket && ticket.demande_id) { // Fallback to ticket's demande
      demande = (await pool.query('SELECT * FROM demande_client WHERE id=$1', [ticket.demande_id])).rows[0] || null;
    }

    if (ticket && ticket.affaire_id) {
      affaire = (await pool.query('SELECT * FROM affaire WHERE id=$1', [ticket.affaire_id])).rows[0] || null;
    }


    const rendezvous = (await pool.query('SELECT * FROM rendezvous WHERE intervention_id=$1 ORDER BY date_rdv DESC, id DESC', [id])).rows;
    const documents = (await pool.query("SELECT * FROM documents_repertoire WHERE cible_type='Intervention' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    const images = (await pool.query("SELECT id, nom_fichier, type_mime FROM images WHERE cible_type='Intervention' AND cible_id=$1 ORDER BY id DESC", [id])).rows;
    // Materiels liés directement + ceux liés via une demande pour ce ticket/intervention
    const materielsDirect = (await pool.query(
      "SELECT im.id, m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat, im.quantite, im.commentaire, m.commande_status " +
      "FROM intervention_materiel im JOIN materiel m ON m.id = im.materiel_id WHERE im.intervention_id=$1 ORDER BY im.id DESC",
      [id]
    )).rows;
    let materielsViaDemande = [];
    if (ticket) {
      const ticketId = ticket.id;
      const viaReq = await pool.query(
        `SELECT DISTINCT m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat,
                COALESCE(gdm.quantite_demandee, dm.quantite, 1) AS quantite,
                m.commentaire, m.commande_status
         FROM demande_materiel dm
         JOIN gestion_demande_materiel gdm ON gdm.demande_materiel_id = dm.id
         JOIN materiel m ON m.id = gdm.materiel_id
         WHERE dm.intervention_id=$1 OR dm.ticket_id = $2`,
        [id, ticketId]
      );
      materielsViaDemande = viaReq.rows;
    }
    const materiels = [...materielsDirect];
    materielsViaDemande.forEach(mv => {
      if (!materiels.find(md => md.materiel_id === mv.materiel_id)) materiels.push(mv);
    });

    const assigned_agent = intervention.ticket_agent_id
      ? (await pool.query(
          `SELECT a.nom, a.prenom, a.matricule 
           FROM agent a 
           JOIN ticket_agent ta ON a.matricule = ta.agent_matricule 
           WHERE ta.id = $1`,
          [intervention.ticket_agent_id]
        )).rows[0]
      : null;

    res.json({ intervention, ticket, doe, site, demande, affaire, rendezvous, documents, images, materiels, assigned_agent });
  } catch (err) {
    console.error('Error fetching intervention relations:', err);
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
          COALESCE(SUM(im.quantite), 0) AS total_quantite_used_in_interventions
      FROM materiel_catalogue mc
      LEFT JOIN materiel m ON mc.reference = m.reference -- Assuming materiel orders are linked by reference to catalogue
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
  const { ticket_id, intervention_id, statut } = req.query;
  try {
    const where = [];
    const params = [];
    let idx = 1;
    if (ticket_id) { where.push(`ticket_id = $${idx++}`); params.push(ticket_id); }
    if (intervention_id) { where.push(`intervention_id = $${idx++}`); params.push(intervention_id); }
    if (statut) { where.push(`statut = $${idx++}`); params.push(statut); }
    const r = await pool.query(
      `SELECT dm.*,
              i.titre AS intervention_titre,
              t.titre AS ticket_titre,
              (
                SELECT json_agg(json_build_object(
                  'id', m.id,
                  'reference', m.reference,
                  'designation', m.designation,
                  'commande_status', m.commande_status,
                  'quantite', gdm.quantite_demandee
                ))
                FROM gestion_demande_materiel gdm
                JOIN materiel m ON m.id = gdm.materiel_id
                WHERE gdm.demande_materiel_id = dm.id
              ) AS materiels
       FROM demande_materiel dm
       LEFT JOIN intervention i ON dm.intervention_id = i.id
       LEFT JOIN ticket t ON dm.ticket_id = t.id
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
  const { titre, commentaire, quantite, ticket_id, intervention_id } = req.body;
  if (!titre) return res.status(400).json({ error: 'titre is required' });
  try {
    const r = await pool.query(
      `INSERT INTO demande_materiel (titre, commentaire, quantite, ticket_id, intervention_id)
       VALUES ($1,$2,COALESCE($3,1),$4,$5)
       RETURNING *`,
      [titre, commentaire || null, quantite || 1, ticket_id || null, intervention_id || null]
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

// Link materiel to intervention (admin)
app.post('/api/interventions/:id/materiels', authenticateToken, authorizeAdmin, async (req, res) => {
  const interventionId = req.params.id;
  const { materiel_id, quantite, commentaire } = req.body;
  try {
    const chk = await pool.query('SELECT id FROM intervention WHERE id=$1', [interventionId]);
    if (!chk.rows[0]) return res.status(404).json({ error: 'Intervention not found' });
    const cm = await pool.query('SELECT id FROM materiel WHERE id=$1', [materiel_id]);
    if (!cm.rows[0]) return res.status(404).json({ error: 'Materiel not found' });
    const r = await pool.query('INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire) VALUES ($1,$2,COALESCE($3,1),$4) RETURNING *', [interventionId, materiel_id, Number.isFinite(quantite) ? quantite : null, commentaire || null]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('Error linking materiel:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// List materiels for an intervention
app.get('/api/interventions/:id/materiels', authenticateToken, async (req, res) => {
  try {
    const interventionId = req.params.id;
    // retrouver ticket pour fallback demande->ticket
    const it = (await pool.query('SELECT ticket_id FROM intervention WHERE id=$1', [interventionId])).rows[0];
    const ticketId = it ? it.ticket_id : null;

    const direct = (await pool.query(
      `SELECT im.id, m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat, im.quantite, im.commentaire, m.commande_status
       FROM intervention_materiel im
       JOIN materiel m ON m.id = im.materiel_id
       WHERE im.intervention_id=$1
       ORDER BY im.id DESC`,
      [interventionId]
    )).rows;

    let viaDemande = [];
    if (ticketId) {
      const r2 = await pool.query(
        `SELECT DISTINCT m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat,
                COALESCE(gdm.quantite_demandee, dm.quantite, 1) AS quantite,
                m.commentaire, m.commande_status
         FROM demande_materiel dm
         JOIN gestion_demande_materiel gdm ON gdm.demande_materiel_id = dm.id
         JOIN materiel m ON m.id = gdm.materiel_id
         WHERE dm.intervention_id=$1 OR dm.ticket_id = $2`,
        [interventionId, ticketId]
      );
      viaDemande = r2.rows;
    }

    const all = [...direct];
    viaDemande.forEach(mv => {
      if (!all.find(d => d.materiel_id === mv.materiel_id)) all.push(mv);
    });

    res.json(all);
  } catch (e) { console.error('Error fetching intervention materiels:', e); res.status(500).json({ error: 'Internal Server Error' }); }
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

// Associations liées à un contrat (via les sites associés)
app.get('/api/contrats/:id/associations', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT DISTINCT a.*, ad.ligne1, ad.code_postal, ad.ville
            FROM association a
            LEFT JOIN adresse ad ON a.adresse_id = ad.id
            JOIN association_site ats ON ats.association_id = a.id
            JOIN contrat_site_association csa ON csa.site_id = ats.site_id
            WHERE csa.contrat_id = $1
            ORDER BY a.created_at DESC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching associations for contract:', err);
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

// API Routes for Tickets (CRUD)
app.get('/api/tickets', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT t.*, dc.titre as demande_titre, s.nom_site as site_nom FROM ticket t LEFT JOIN demande_client dc ON t.demande_id = dc.id LEFT JOIN site s ON t.site_id = s.id ORDER BY t.id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching tickets:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get a single ticket by ID
app.get('/api/tickets/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM ticket WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching ticket with id ${id}:`, err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/tickets', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, description, doe_id, affaire_id, site_id, demande_id, etat, responsable, date_debut, date_fin } = req.body || {};
    try {
        if (!doe_id || !affaire_id) {
            return res.status(400).json({ error: 'Champs requis manquants: doe_id et affaire_id' });
        }
        // Determine site_id from DOE if not provided
        let siteIdVal = site_id || null;
        if (!siteIdVal && doe_id) {
            try { const d = await pool.query('SELECT site_id FROM doe WHERE id=$1', [doe_id]); siteIdVal = d.rows[0]?.site_id || null; } catch(_) {}
        }
        const result = await pool.query(
            // Cast explicit to enum type and timestamps; default date_debut to NOW if missing
            "INSERT INTO ticket (doe_id, affaire_id, site_id, demande_id, titre, description, etat, responsable, date_debut, date_fin) " +
            "VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::etat_rapport,'Pas_commence'::etat_rapport),$8,COALESCE($9::timestamp, CURRENT_TIMESTAMP),$10::timestamp) RETURNING *",
            [doe_id, affaire_id, siteIdVal, demande_id || null, titre || null, description || null, etat || null, responsable || null, date_debut || null, date_fin || null]
        );
        const created = result.rows[0];
        try { await logAudit('ticket', created?.id, 'CREATE', (req.user&&req.user.email)||req.headers['x-actor-email']||null, { doe_id, affaire_id, site_id: siteIdVal, demande_id, titre, description, etat, responsable }); } catch(_){}
        res.status(201).json(created);
    } catch (err) {
        console.error('Error creating ticket:', err);
        if (err && err.code && ['23502','23503','22P02'].includes(err.code)) {
            return res.status(400).json({ error: 'Données invalides pour la création du ticket' });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/tickets/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { titre, description, responsable, doe_id, affaire_id, site_id, demande_id, etat } = req.body; // demande_id added
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const oldTicketResult = await client.query('SELECT responsable FROM ticket WHERE id = $1', [id]);
        const oldResponsable = oldTicketResult.rows[0]?.responsable;

        const result = await client.query(
            'UPDATE ticket SET titre = COALESCE($1, titre), description = COALESCE($2, description), responsable = COALESCE($3, responsable), doe_id = COALESCE($4, doe_id), affaire_id = COALESCE($5, affaire_id), site_id = COALESCE($6, site_id), demande_id = COALESCE($7, demande_id), etat = COALESCE($8::etat_rapport, etat) WHERE id = $9 RETURNING *', // demande_id added, parameter indices shifted
            [titre, description, responsable, doe_id, affaire_id, site_id || null, demande_id || null, etat, id] // demande_id added
        );

        if (result.rows.length > 0) {
            if (oldResponsable !== responsable) {
                await client.query(
                    'INSERT INTO ticket_historique_responsable (ticket_id, ancien_responsable_matricule, nouveau_responsable_matricule, modifie_par_matricule) VALUES ($1, $2, $3, $4)',
                    [id, oldResponsable, responsable, req.user.matricule] // Assuming req.user.matricule holds the modifier's identifier
                );
            }
            await client.query('COMMIT');
            res.json(result.rows[0]);
        } else {
            await client.query('ROLLBACK');
            res.status(404).json({ error: 'Ticket not found' });
        }
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('Error rolling back client', rollbackErr);
        }
        console.error(`Error updating ticket with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

app.delete('/api/tickets/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { justification } = req.body;

    if (!justification) {
        return res.status(400).json({ error: 'Justification is required' });
    }

    try {
        await logAudit('ticket', id, 'DELETE', req.user.email, { justification });
        await pool.query('DELETE FROM ticket WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting ticket with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Admin takes a ticket as second responsible
app.post('/api/tickets/:id/take', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const actorEmail = (req.user && req.user.email) || req.headers['x-actor-email'] || null;
    let actorMatricule = req.user && req.user.matricule;
    if (!actorMatricule && actorEmail) {
      try {
        const lookup = await pool.query('SELECT matricule FROM agent WHERE email=$1 LIMIT 1', [actorEmail]);
        actorMatricule = lookup.rows[0] && lookup.rows[0].matricule;
      } catch (_) {}
    }
    if (!actorMatricule) return res.status(400).json({ error: 'Agent matricule missing for actor' });
    const actor = actorEmail;
    const { actor_name, date_debut, date_fin, commentaire } = req.body || {};
    if (!actor) return res.status(400).json({ error: 'Actor email missing' });
    // Block if ticket is already marked as Terminé (approximation of site closed)
    const t = await pool.query('SELECT etat FROM ticket WHERE id=$1', [id]);
    const etat = t.rows[0] && t.rows[0].etat;
    if (etat === 'Termine' || etat === 'Terminé') {
      return res.status(409).json({ error: 'Ticket terminé: prise non autorisée' });
    }
    // If no primary responsible on ticket, assign actor as primary responsible (for the intervention context)
    const cur = await pool.query('SELECT responsable FROM ticket WHERE id=$1', [id]);
    const currentResp = cur.rows[0] && cur.rows[0].responsable;
    if (!currentResp) {
      const up = await pool.query('UPDATE ticket SET responsable=$1 WHERE id=$2 RETURNING *', [actorMatricule, id]);
      try {
        await pool.query('INSERT INTO ticket_historique_responsable (ticket_id, ancien_responsable_matricule, nouveau_responsable_matricule, modifie_par_matricule) VALUES ($1,$2,$3,$4)', [id, null, actorMatricule, actorMatricule]);
      } catch(_){}
      try { await logAudit('ticket', id, 'TAKE_PRIMARY', actor, { actor_name, date_debut, date_fin, commentaire }); } catch(_){}
      return res.status(200).json({ message: 'Assigné comme responsable principal du ticket', assignment: 'primary', ticket: up.rows[0] });
    }

    // Otherwise, insert as secondary responsible (history kept)
    const r = await pool.query(
      "INSERT INTO ticket_responsable (ticket_id, agent_matricule, role, date_debut, date_fin) VALUES ($1,$2,'Secondaire',COALESCE($3, CURRENT_TIMESTAMP), $4) RETURNING *",
      [id, actorMatricule, date_debut || null, date_fin || null]
    );
    try { await logAudit('ticket', id, 'TAKE_SECONDARY', actor, { actor_name, date_debut, date_fin, commentaire }); } catch(_){}
    res.status(201).json({ message: 'Ajouté comme responsable secondaire', assignment: 'secondary', record: r.rows[0] });
  } catch (err) {
    console.error('Error taking ticket:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/tickets/:id/satisfaction', authenticateToken, async (req, res) => {
    const { id: ticketId } = req.params;
    const { note, commentaire } = req.body;
    const userId = req.user.id;

    // Basic validation
    const rating = Number(note);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    }

    try {
        // Authorization check: ensure the user is the client for this ticket
        const authQuery = `
            SELECT 1 FROM client c
            JOIN ticket t ON c.user_id = $2
            WHERE t.id = $1 AND (
                t.site_id IN (SELECT id FROM site WHERE client_id = c.id)
                OR
                t.demande_id IN (SELECT id FROM demande_client WHERE client_id = c.id)
            )
        `;
        const authCheck = await pool.query(authQuery, [ticketId, userId]);

        if (authCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Forbidden: You are not the client for this ticket.' });
        }
        
        const result = await pool.query(
            'INSERT INTO ticket_satisfaction (ticket_id, user_id, rating, comment, envoieok) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (ticket_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, envoieok = TRUE, created_at = CURRENT_TIMESTAMP RETURNING *',
            [ticketId, userId, rating, commentaire]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(`Error submitting satisfaction for ticket ${ticketId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Interventions (CRUD)
app.get('/api/interventions', authenticateToken, async (req, res) => {
  try {
    const { ticket_id, reference, q } = req.query;
    const params = [];
    const where = [];
    let joins = `
      JOIN ticket t ON i.ticket_id = t.id
      LEFT JOIN site s ON i.site_id = s.id
      LEFT JOIN demande_client dc ON i.demande_id = dc.id
    `;

    if (ticket_id) {
      params.push(ticket_id);
      where.push(`i.ticket_id = $${params.length}`);
    }

    // Filtre par référence ou recherche texte sur le matériel
    if (reference || q) {
      joins += ` LEFT JOIN intervention_materiel im ON im.intervention_id = i.id
                 LEFT JOIN materiel m ON m.id = im.materiel_id `;
    }

    if (reference) {
      params.push(`%${reference}%`);
      where.push(`(m.reference ILIKE $${params.length} OR m.designation ILIKE $${params.length})`);
    }

    if (q) {
      const term = `%${q}%`;
      params.push(term, term, term, term);
      const idx = params.length - 3;
      const cond = `
        ( CAST(i.id AS TEXT) ILIKE $${idx}
          OR COALESCE(i.titre,'') ILIKE $${idx + 1}
          OR COALESCE(i.description,'') ILIKE $${idx + 2}
          OR COALESCE(i.status,'') ILIKE $${idx + 3}
        )
      `;
      where.push(cond);
      // inclure référence/désignation matériel dans la recherche q
      params.push(term, term);
      where.push(`(m.reference ILIKE $${params.length - 1} OR m.designation ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(
      `
        SELECT i.*,
               t.titre as ticket_titre,
               s.nom_site as site_nom,
               dc.titre as demande_titre
        FROM intervention i
        ${joins}
        ${whereSql}
        ORDER BY i.date_debut DESC NULLS LAST, i.id DESC
      `,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching interventions:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Events d'intervention (par agent)
app.get('/api/interventions/:id/events', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const rows = (await pool.query('SELECT * FROM intervention_event WHERE intervention_id=$1 ORDER BY agent_matricule', [id])).rows;
    res.json(rows);
  } catch (err) {
    console.error('Error fetching intervention events:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Resynchroniser les événements d'intervention (admin)
app.post('/api/interventions/:id/events/sync', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const interRes = await pool.query('SELECT * FROM intervention WHERE id=$1', [id]);
    if (!interRes.rows.length) return res.status(404).json({ error: 'Intervention not found' });
    await syncInterventionEvents(interRes.rows[0]);
    const rows = (await pool.query('SELECT * FROM intervention_event WHERE intervention_id=$1 ORDER BY agent_matricule', [id])).rows;
    res.json(rows);
  } catch (err) {
    console.error('Error syncing intervention events:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get a single intervention by ID
app.get('/api/interventions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM intervention WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Intervention not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching intervention with id ${id}:`, err);
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

app.post('/api/interventions', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, description, date_debut, date_fin, ticket_id, site_id, demande_id, status, ticket_agent_id, metier } = req.body;
    if (!description || !date_debut || !ticket_id) {
        return res.status(400).json({ error: 'Description, date de début et ticket ID sont requis' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO intervention (titre, description, date_debut, date_fin, ticket_id, site_id, demande_id, status, ticket_agent_id, metier) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
            [titre || null, description, date_debut, date_fin, ticket_id, site_id || null, demande_id || null, status || 'En_attente', ticket_agent_id || null, metier || null]
        );
        // Sync événements par agent
        await syncInterventionEvents(result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating intervention:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/interventions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { description, date_debut, date_fin = null, ticket_id, site_id, demande_id, status, ticket_agent_id, metier } = req.body;
    try {
        const result = await pool.query(
            'UPDATE intervention SET description = $1, date_debut = $2, date_fin = $3, ticket_id = $4, site_id = $5, demande_id = $6, status = COALESCE($7::statut_intervention, status), ticket_agent_id = $8, metier = $9 WHERE id = $10 RETURNING *',
            [description, date_debut, date_fin, ticket_id, site_id || null, demande_id || null, status, ticket_agent_id || null, metier || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: `Intervention with id ${id} not found` });
        }
        await syncInterventionEvents(result.rows[0]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating intervention with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PATCH partiel (utilisé pour annulation/fin)
app.patch('/api/interventions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  const add = (col, val, cast = '') => { values.push(val); fields.push(`${col} = $${values.length}${cast}`); };

  if ('description' in req.body) add('description', req.body.description);
  if ('date_debut' in req.body) add('date_debut', req.body.date_debut);
  if ('date_fin' in req.body) add('date_fin', req.body.date_fin);
  if ('site_id' in req.body) add('site_id', req.body.site_id || null);
  if ('demande_id' in req.body) add('demande_id', req.body.demande_id || null);
  if ('status' in req.body) add('status', req.body.status, '::statut_intervention');
  if ('ticket_agent_id' in req.body) add('ticket_agent_id', req.body.ticket_agent_id || null);
  if ('metier' in req.body) add('metier', req.body.metier || null);

  if (!fields.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });

  const sql = `UPDATE intervention SET ${fields.join(', ')} WHERE id = $${values.length + 1} RETURNING *`;
  values.push(id);

  try {
    const result = await pool.query(sql, values);
    if (!result.rows.length) return res.status(404).json({ error: 'Intervention not found' });
    await syncInterventionEvents(result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error patching intervention:', err);
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
});

// Create a Rendu for an Intervention
app.post('/api/interventions/:id/rendus', authenticateToken, authorizeAdmin, renduUpload.array('image_files[]'), async (req, res) => {
    const { id: interventionId } = req.params;
    const { valeur, resume, image_commentaires, image_notes, image_titles } = req.body;
    const commentairesArr = Array.isArray(image_commentaires) ? image_commentaires : (image_commentaires ? [image_commentaires] : []);
    const notesArr = Array.isArray(image_notes) ? image_notes : (image_notes ? [image_notes] : []);
    const titlesArr = Array.isArray(image_titles) ? image_titles : (image_titles ? [image_titles] : []);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create the rendu_intervention record
        const renduResult = await client.query(
            'INSERT INTO rendu_intervention (intervention_id, valeur, resume) VALUES ($1, $2, $3) RETURNING id',
            [interventionId, valeur, resume]
        );
        const renduId = renduResult.rows[0].id;

        // 2. Handle file uploads
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const commentaire = commentairesArr[i] || null;
                const note = notesArr[i] || null;
                const fullComment = [commentaire, note].filter(Boolean).join('\\n\\n');
                const titre = titlesArr[i] || null;

                // Insert into images table
                const imageResult = await client.query(
                    `INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
                     VALUES ($1, $2, $3, $4, $5, $6, 'RenduIntervention', $7) RETURNING id`,
                    [file.originalname, file.mimetype, file.size, file.buffer, fullComment, req.user.matricule || null, renduId]
                );
                const imageId = imageResult.rows[0].id;

                // Link in rendu_intervention_image table
                await client.query(
                    'INSERT INTO rendu_intervention_image (rendu_intervention_id, image_id) VALUES ($1, $2)',
                    [renduId, imageId]
                );

                // Enregistrer aussi dans documents_repertoire pour conserver titre/commentaire
                await client.query(
                  `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, titre, commentaire)
                   VALUES ('RenduIntervention', $1, 'Document', $2, $3, $4, $5, $6)`,
                  [renduId, file.originalname, file.mimetype, file.size, titre || file.originalname, commentaire || null]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Rendu created successfully', renduId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error creating rendu for intervention ${interventionId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Get all Rendus for an Intervention
app.get('/api/interventions/:id/rendus', authenticateToken, async (req, res) => {
    const { id: interventionId } = req.params;
    try {
        const result = await pool.query(
            `SELECT r.*,
                    COALESCE(imgs.cnt,0) + COALESCE(docs.cnt,0) AS attachments_count
             FROM rendu_intervention r
             LEFT JOIN (
                SELECT rii.rendu_intervention_id, COUNT(*) AS cnt
                FROM rendu_intervention_image rii
                GROUP BY rii.rendu_intervention_id
             ) imgs ON imgs.rendu_intervention_id = r.id
             LEFT JOIN (
                SELECT cible_id, COUNT(*) AS cnt
                FROM documents_repertoire
                WHERE cible_type='RenduIntervention'
                GROUP BY cible_id
             ) docs ON docs.cible_id = r.id
             WHERE r.intervention_id = $1
             ORDER BY r.id DESC`,
            [interventionId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(`Error fetching rendus for intervention ${interventionId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get a single Rendu by its own ID, with its attachments
app.get('/api/rendus/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const renduResult = await pool.query('SELECT * FROM rendu_intervention WHERE id = $1', [id]);
        const rendu = renduResult.rows[0];

        if (!rendu) {
            return res.status(404).json({ error: 'Rendu not found' });
        }

        // Fetch associated images via the join table
        const imagesResult = await pool.query(`
            SELECT i.* FROM images i
            JOIN rendu_intervention_image rii ON i.id = rii.image_id
            WHERE rii.rendu_intervention_id = $1
            ORDER BY i.id DESC
        `, [id]);
        // Fetch associated documents (if any are linked via cible_type/cible_id) to récupérer titre/commentaire
        const documentsResult = await pool.query(
            "SELECT * FROM documents_repertoire WHERE cible_type = 'RenduIntervention' AND cible_id = $1 ORDER BY id DESC",
            [id]
        );
        // Associer des titres/commentaires éventuels depuis documents_repertoire (même cible, même nom de fichier)
        const documents = documentsResult.rows;
        const docMap = new Map((documents || []).map(d => [d.nom_fichier, d]));
        const images = imagesResult.rows.map(img => {
            const doc = docMap.get(img.nom_fichier);
            return doc ? { ...img, titre: doc.titre || doc.nom_fichier, commentaire_image: img.commentaire_image || doc.commentaire } : img;
        });
        
        // documents already fetched above

        // Fetch related message attachments for context
        let message_attachments = [];
        try {
            const interventionResult = await pool.query('SELECT ticket_id FROM intervention WHERE id = $1', [rendu.intervention_id]);
            const ticketId = interventionResult.rows[0]?.ticket_id;

            if (ticketId) {
                const demandeResult = await pool.query('SELECT id FROM demande_client WHERE ticket_id = $1', [ticketId]);
                const demandeId = demandeResult.rows[0]?.id;

                if (demandeId) {
                    const conversationId = `demande-${demandeId}`;
                    const messagesResult = await pool.query('SELECT id, body as message FROM messagerie WHERE conversation_id = $1', [conversationId]);
                    
                    for (const message of messagesResult.rows) {
                        const attachmentsResult = await pool.query(
                            'SELECT id, file_name, file_type, file_size FROM messagerie_attachment WHERE message_id = $1',
                            [message.id]
                        );
                        attachmentsResult.rows.forEach(att => {
                            message_attachments.push({
                                ...att,
                                message: message.message
                            });
                        });
                    }
                }
            }
        } catch (e) {
            console.warn(`Could not fetch message attachments for rendu ${id}:`, e.message);
        }

        res.json({ rendu, images, documents, message_attachments });

    } catch (err) {
        console.error(`Error fetching rendu ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.patch('/api/rendus/:id', authenticateToken, async (req, res) => { // authorizeAdmin removed
    const { id: renduId } = req.params;
    const { resume, valeur } = req.body;
    const { id: userId, roles } = req.user;

    try {
        const isAdmin = roles.includes('ROLE_ADMIN');
        
        // First, get the rendu to find the intervention_id
        const renduResult = await pool.query('SELECT intervention_id FROM rendu_intervention WHERE id = $1', [renduId]);
        const rendu = renduResult.rows[0];

        if (!rendu) {
            return res.status(404).json({ error: 'Rendu not found' });
        }

        if (!isAdmin) {
            const interventionResult = await pool.query('SELECT ticket_id FROM intervention WHERE id = $1', [rendu.intervention_id]);
            const ticketId = interventionResult.rows[0]?.ticket_id;
            
            if (!ticketId) {
                 return res.status(403).json({ error: 'Forbidden' });
            }

            const clientCheckQuery = `
                SELECT 1 FROM client c
                JOIN ticket t ON c.user_id = $2
                WHERE t.id = $1
            `;
            const clientCheck = await pool.query(clientCheckQuery, [ticketId, userId]);

            if (clientCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        if (resume === undefined && valeur === undefined) {
            return res.status(400).json({ error: 'At least one field (resume or valeur) is required for update.' });
        }

        const result = await pool.query(
            'UPDATE rendu_intervention SET resume = COALESCE($1, resume), valeur = COALESCE($2, valeur) WHERE id = $3 RETURNING *',
            [resume, valeur, renduId]
        );

        if (result.rows.length === 0) {
            // This case should be rare since we checked for rendu existence before
            return res.status(404).json({ error: 'Rendu not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating rendu ${renduId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete a Rendu and its associated images
app.delete('/api/rendus/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id: renduId } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find and delete associated images
        const imagesToDelete = await client.query(
            "SELECT id FROM images WHERE cible_type = 'RenduIntervention' AND cible_id = $1",
            [renduId]
        );
        for (const img of imagesToDelete.rows) {
            await client.query('DELETE FROM images WHERE id = $1', [img.id]);
        }

        // 2. Delete entries in the join table (rendu_intervention_image)
        // This might cascade automatically if FK is set with ON DELETE CASCADE, but explicit is safer
        await client.query('DELETE FROM rendu_intervention_image WHERE rendu_intervention_id = $1', [renduId]);

        // 3. Delete the rendu_intervention record
        const result = await client.query('DELETE FROM rendu_intervention WHERE id = $1 RETURNING id', [renduId]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Rendu not found' });
        }

        await client.query('COMMIT');
        res.status(204).send(); // No Content

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error deleting rendu ${renduId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
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
    // Variante simplifiée (utilisée par certaines pages legacy) avec enregistrement des champs titre/commentaire
    const { nom_fichier, cible_type, cible_id, nature, type_mime, titre, commentaire } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO documents_repertoire (nom_fichier, cible_type, cible_id, nature, type_mime, titre, commentaire)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [nom_fichier, cible_type, cible_id, nature || 'Document', type_mime || null, titre || null, commentaire || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/documents/:id', authenticateToken, async (req, res) => {
    // Variante legacy d'update en incluant titre/commentaire
    const { id } = req.params;
    const { nom_fichier, cible_type, cible_id, nature, type_mime, titre, commentaire } = req.body;
    try {
        const result = await pool.query(
            `UPDATE documents_repertoire
             SET nom_fichier = $1,
                 cible_type = $2,
                 cible_id = $3,
                 nature = $4,
                 type_mime = $5,
                 titre = COALESCE($6, titre),
                 commentaire = COALESCE($7, commentaire)
             WHERE id = $8 RETURNING *`,
            [nom_fichier, cible_type, cible_id, nature, type_mime, titre, commentaire, id]
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
// -------------------- Clients API (Client-side access) --------------------

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
    const { client_id, affaire_id, association_id } = req.query;
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    let sql = `
      SELECT
          f.*,
          f.titre,
          c.nom_client,
          af.nom_affaire,
          asso.titre AS association_titre,
          i.id AS intervention_id,
          i.titre AS intervention_titre
      FROM facture f
      LEFT JOIN client c ON f.client_id = c.id
      LEFT JOIN affaire af ON f.affaire_id = af.id
      LEFT JOIN association asso ON f.association_id = asso.id
      LEFT JOIN intervention i ON f.intervention_id = i.id
    `;

    if (client_id) {
      conditions.push(`f.client_id = $${paramIndex++}`);
      params.push(client_id);
    }
    if (affaire_id) {
      conditions.push(`f.affaire_id = $${paramIndex++}`);
      params.push(affaire_id);
    }
    if (association_id) {
      conditions.push(`f.association_id = $${paramIndex++}`);
      params.push(association_id);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += " ORDER BY f.id DESC";

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error('Error fetching factures:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/factures/:id', authenticateToken, async (req, res) => {
  const { id } = req.params; try { const r = await pool.query('SELECT * FROM facture WHERE id=$1', [id]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json(r.rows[0]); } catch (err) { console.error('Error fetching facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/factures/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `SELECT f.*, c.nom_client, af.nom_affaire
       FROM facture f
       LEFT JOIN client c ON f.client_id = c.id
       LEFT JOIN affaire af ON f.affaire_id = af.id
       WHERE f.id=$1`,
      [id]
    );
    const f = r.rows[0];
    if (!f) return res.status(404).json({ error: 'Facture not found' });

    // Si une intervention est liée, on récupère les infos nécessaires pour le détail facture
    let intervention = null;
    let materiels = [];
    let clientName = f.nom_client || null;
    let affaireName = f.nom_affaire || null;
    // Fallback client direct depuis facture.client_id
    if (!clientName && f.client_id) {
      try {
        const c = await pool.query('SELECT nom_client FROM client WHERE id=$1 LIMIT 1', [f.client_id]);
        clientName = (c.rows[0] || {}).nom_client || null;
      } catch (_) {}
    }
    if (f.intervention_id) {
      const intRes = await pool.query('SELECT * FROM intervention WHERE id=$1', [f.intervention_id]);
      intervention = intRes.rows[0] || null;
      // Compléter client/affaire via le site si nécessaire
      if ((!clientName || !affaireName) && intervention?.site_id) {
        try {
          const siteRes = await pool.query(`
            SELECT c.nom_client, a.nom_affaire
            FROM site s
            LEFT JOIN client c ON c.id = s.client_id
            LEFT JOIN contrat_site_association csa ON csa.site_id = s.id
            LEFT JOIN contrat ct ON ct.id = csa.contrat_id
            LEFT JOIN affaire a ON a.id = ct.affaire_id
            WHERE s.id = $1
            LIMIT 1
          `, [intervention.site_id]);
          const extra = siteRes.rows[0] || {};
          clientName = clientName || extra.nom_client || null;
          affaireName = affaireName || extra.nom_affaire || null;
        } catch (_) {}
      }
      const matRes = await pool.query(
        `SELECT m.reference, m.designation, im.quantite, m.prix_achat
         FROM intervention_materiel im
         JOIN materiel m ON m.id = im.materiel_id
         WHERE im.intervention_id=$1`,
        [f.intervention_id]
      );
      materiels = matRes.rows || [];
    }
    // Fallback via association si toujours pas de client
    if (!clientName && f.association_id) {
      try {
        const assoc = await pool.query(`
          SELECT c.nom_client
          FROM association a
          LEFT JOIN client c ON c.id = a.client_id
          WHERE a.id=$1
          LIMIT 1
        `, [f.association_id]);
        clientName = (assoc.rows[0] || {}).nom_client || clientName;
      } catch (_) {}
    }

    const fmt = (v, suffix=' €') => v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(2)}${suffix}`;

    // Récupération des valeurs stockées, sinon fallback calcul
    const rate = f.taux_horaire != null ? Number(f.taux_horaire) : 65;
    const matTaux = f.taux_majoration_materiel != null ? Number(f.taux_majoration_materiel) : 0;
    const deplQty = f.deplacement_qte != null ? Number(f.deplacement_qte) : 0;
    const deplPu  = f.deplacement_pu != null ? Number(f.deplacement_pu) : 0;
    const divers  = f.divers_ht != null ? Number(f.divers_ht) : 0;
    const tvaRate = f.tva_taux !== null && f.tva_taux !== undefined ? Number(f.tva_taux) : (f.tva !== null && f.tva !== undefined ? Number(f.tva) : 20);

    // Heures auto à partir des dates intervention (fallback)
    let hoursAuto = 0;
    if (intervention?.date_debut && intervention?.date_fin) {
      const start = new Date(intervention.date_debut).getTime();
      const end   = new Date(intervention.date_fin).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
        hoursAuto = (end - start) / 3600000; // en heures
      }
    }
    const heuresSaisies = f.heures_saisies != null ? Number(f.heures_saisies) : null;
    const heuresCalculees = f.heures_calculees != null ? Number(f.heures_calculees) : (hoursAuto || 0);
    const heuresAffichees = heuresSaisies != null ? heuresSaisies : heuresCalculees;
    const totalHeures = f.total_heures_ht != null ? Number(f.total_heures_ht) : (heuresAffichees * rate);

    const matTotalBrut = materiels.reduce((acc, m) => {
      const q = Number(m.quantite) || 0;
      const pu = Number(m.prix_achat) || 0;
      return acc + (q * pu);
    }, 0);
    const matTotalStored = f.total_materiel_ht != null ? Number(f.total_materiel_ht) : null;
    const matBase = matTotalStored != null ? matTotalStored : matTotalBrut;
    const matMaj = matBase * (matTaux/100);
    const totalMatHT = matBase + matMaj;

    const totalDepl = f.total_deplacement_ht != null ? Number(f.total_deplacement_ht) : (deplQty * deplPu);
    const totalHTCalc  = totalHeures + totalMatHT + totalDepl + divers;
    const totalTVACalc = totalHTCalc * (tvaRate/100);
    const totalTTCCalc = totalHTCalc + totalTVACalc;

    // Préférence aux montants de la table facture si présents
    const totalHT = f.total_ht != null ? Number(f.total_ht) : (f.montant_ht != null ? Number(f.montant_ht) : totalHTCalc);
    const totalTTC = f.total_ttc != null ? Number(f.total_ttc) : (f.montant_ttc != null ? Number(f.montant_ttc) : totalTTCCalc);
    const totalTVA = f.total_tva != null ? Number(f.total_tva) : (totalTTC - totalHT);

    const matListHtml = materiels.length
      ? materiels.map(m => {
          const q = Number(m.quantite) || 0;
          const pu = Number(m.prix_achat) || 0;
          const line = q * pu;
          return `<li>${m.designation || m.reference || 'Matériel'}${m.reference ? ' ('+m.reference+')' : ''} — ${q || 1} × ${pu ? pu.toFixed(2)+'€' : 'N/A'}${line ? ' = '+line.toFixed(2)+'€' : ''}</li>`;
        }).join('')
      : '<li class="text-muted">Aucun matériel validé</li>';

    const factTitle = f.titre || f.reference || '';
    const html = `<!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Facture #${f.id}${factTitle ? ' – '+factTitle : ''}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; background:#f7f7fb; color:#333; }
        .card { background:#fff; border-radius:10px; padding:20px; box-shadow:0 10px 25px rgba(0,0,0,0.08); }
        h1 { margin:0 0 8px 0; color:#4a4fa3; }
        .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px,1fr)); gap:12px; margin-top:12px; }
        .item { background:#f4f5ff; border-radius:8px; padding:10px 12px; }
        .label { font-size:12px; color:#667; text-transform:uppercase; letter-spacing:0.5px; }
        .value { font-weight:600; margin-top:4px; }
        table { width:100%; border-collapse:collapse; margin-top:14px; }
        th, td { border:1px solid #e5e7eb; padding:8px; font-size:14px; }
        th { background:#eef0ff; text-align:left; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Facture #${f.id} ${factTitle ? '– '+factTitle : ''}</h1>
        <div class="grid">
          <div class="item"><div class="label">Client</div><div class="value">${clientName || '—'}</div></div>
          <div class="item"><div class="label">Affaire</div><div class="value">${affaireName || '—'}</div></div>
          <div class="item"><div class="label">Statut</div><div class="value">${f.statut || '—'}</div></div>
          ${intervention ? `<div class="item"><div class="label">Intervention</div><div class="value">${intervention.titre || 'Intervention #'+intervention.id}</div></div>` : ''}
        </div>

        <h3 style="margin-top:18px;">Descriptif</h3>
        <div class="item" style="background:#fff; border:1px solid #e5e7eb;">
          <div class="label">Heures d'intervention</div>
          <div class="value">${heuresAffichees.toFixed(2)} h ${heuresSaisies != null ? '(saisies)' : '(auto)'} — Calcul auto : ${hoursAuto.toFixed(2)} h</div>
          <div class="label" style="margin-top:8px;">Matériel validé</div>
          <ul>${matListHtml}</ul>
          <div class="fw-bold">Matériel Total HT : ${fmt(matBase)}</div>
        </div>

        <h3 style="margin-top:18px;">Comptabilité</h3>
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px,1fr));">
          <div class="item">
            <div class="label">Heures intervention</div>
            <div class="value">${heuresAffichees.toFixed(2)} h × ${rate.toFixed(2)} €/h</div>
            <div class="label" style="margin-top:8px;">Total heures HT</div>
            <div class="value">${fmt(totalHeures)}</div>
          </div>
          <div class="item">
            <div class="label">Majoration matériel</div>
            <div class="value">${matTaux}%</div>
            <div class="label" style="margin-top:8px;">Total matériel HT</div>
            <div class="value">${fmt(totalMatHT)}</div>
          </div>
          <div class="item">
            <div class="label">Déplacement</div>
            <div class="value">${deplQty} × ${fmt(deplPu,' €')} = ${fmt(totalDepl)}</div>
            <div class="label" style="margin-top:8px;">Divers</div>
            <div class="value">${fmt(divers)}</div>
          </div>
          <div class="item">
            <div class="label">TVA</div>
            <div class="value">${tvaRate.toFixed(2)} %</div>
          </div>
        </div>

        <h3 style="margin-top:18px;">Montant total</h3>
        <table>
          <thead><tr><th>Total HT</th><th>TVA</th><th>Total TTC</th></tr></thead>
          <tbody><tr>
            <td>${fmt(totalHT)}</td>
            <td>${fmt(totalTVA)}</td>
            <td>${fmt(totalTTC)}</td>
          </tr></tbody>
        </table>
      </div>
    </body>
    </html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="facture_${id}.html"`);
    res.status(200).send(html);
  } catch (err) {
    console.error('Error downloading facture:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/api/factures', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    let { titre, reference, statut, date_emission, date_echeance, client_id, affaire_id, association_id,
      heures_saisies, heures_calculees, taux_horaire, total_heures_ht, taux_majoration_materiel, total_materiel_ht,
      deplacement_qte, deplacement_pu, divers_ht, tva_taux, total_deplacement_ht, total_tva, total_ht, total_ttc, intervention_id
    } = req.body;

    // Sécuriser les valeurs numériques
    const num = (v, def = 0) => (v === undefined || v === null || Number.isNaN(Number(v)) ? def : Number(v));
    heures_saisies = num(heures_saisies);
    heures_calculees = num(heures_calculees);
    taux_horaire = num(taux_horaire);
    total_heures_ht = num(total_heures_ht);
    taux_majoration_materiel = num(taux_majoration_materiel);
    total_materiel_ht = num(total_materiel_ht);
    deplacement_qte = num(deplacement_qte);
    deplacement_pu = num(deplacement_pu);
    divers_ht = num(divers_ht);
    tva_taux = num(tva_taux, 20);
    total_deplacement_ht = num(total_deplacement_ht);
    total_tva = num(total_tva);
    total_ht = num(total_ht);
    total_ttc = num(total_ttc);

    const r = await pool.query(
      `INSERT INTO facture (
        titre, reference, statut, date_emission, date_echeance, client_id, affaire_id, association_id,
        heures_saisies, heures_calculees, taux_horaire, total_heures_ht, taux_majoration_materiel, total_materiel_ht,
        deplacement_qte, deplacement_pu, divers_ht, tva_taux, total_deplacement_ht, total_tva, total_ht, total_ttc, intervention_id
      ) VALUES ($1, $2, COALESCE($3::statut_facture,'Brouillon'::statut_facture), $4,$5,$6,$7,$8,
                $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [
        titre||null, reference||null, statut||null, date_emission||null, date_echeance||null, client_id||null, affaire_id||null, association_id||null,
        heures_saisies, heures_calculees, taux_horaire, total_heures_ht, taux_majoration_materiel, total_materiel_ht,
        deplacement_qte, deplacement_pu, divers_ht, tva_taux, total_deplacement_ht, total_tva, total_ht, total_ttc, intervention_id||null
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error('Error creating facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.put('/api/factures/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try {
    let { titre, reference, statut, date_emission, date_echeance, client_id, affaire_id, association_id,
      heures_saisies, heures_calculees, taux_horaire, total_heures_ht, taux_majoration_materiel, total_materiel_ht,
      deplacement_qte, deplacement_pu, divers_ht, tva_taux, total_deplacement_ht, total_tva, total_ht, total_ttc, intervention_id
    } = req.body;
    const num = (v) => (v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));
    const r = await pool.query(
      `UPDATE facture SET
        titre = COALESCE($1, titre),
        reference = COALESCE($2, reference),
        statut = COALESCE($3::statut_facture, statut),
        date_emission = COALESCE($4, date_emission),
        date_echeance = COALESCE($5, date_echeance),
        client_id = COALESCE($6, client_id),
        affaire_id = COALESCE($7, affaire_id),
        association_id = COALESCE($8, association_id),
        heures_saisies = COALESCE($9, heures_saisies),
        heures_calculees = COALESCE($10, heures_calculees),
        taux_horaire = COALESCE($11, taux_horaire),
        total_heures_ht = COALESCE($12, total_heures_ht),
        taux_majoration_materiel = COALESCE($13, taux_majoration_materiel),
        total_materiel_ht = COALESCE($14, total_materiel_ht),
        deplacement_qte = COALESCE($15, deplacement_qte),
        deplacement_pu = COALESCE($16, deplacement_pu),
        divers_ht = COALESCE($17, divers_ht),
        tva_taux = COALESCE($18, tva_taux),
        total_deplacement_ht = COALESCE($19, total_deplacement_ht),
        total_tva = COALESCE($20, total_tva),
        total_ht = COALESCE($21, total_ht),
        total_ttc = COALESCE($22, total_ttc),
        intervention_id = COALESCE($23, intervention_id)
      WHERE id=$24 RETURNING *`,
      [
        titre||null, reference||null, statut||null, date_emission||null, date_echeance||null, client_id||null, affaire_id||null, association_id||null,
        num(heures_saisies), num(heures_calculees), num(taux_horaire), num(total_heures_ht), num(taux_majoration_materiel), num(total_materiel_ht),
        num(deplacement_qte), num(deplacement_pu), num(divers_ht), num(tva_taux), num(total_deplacement_ht), num(total_tva), num(total_ht), num(total_ttc),
        intervention_id||null,
        id
      ]
    );
    res.json(r.rows[0] || null);
  } catch (err) { console.error('Error updating facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/factures/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; try { await pool.query('DELETE FROM facture WHERE id=$1', [id]); res.status(204).send(); } catch (err) { console.error('Error deleting facture:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Travaux API --------------------
app.get('/api/travaux', authenticateToken, async (req, res) => {
  try {
    const { doe_id, affaire_id, site_id, demande_id, etat, priorite } = req.query;
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    let sql = `
      SELECT
          t.*,
          d.titre AS doe_titre,
          af.nom_affaire AS affaire_nom,
          s.nom_site AS site_nom,
          dc.titre AS demande_titre,
          resp.responsables,
          ags.agents_assignes
      FROM travaux t
      LEFT JOIN doe d ON t.doe_id = d.id
      LEFT JOIN affaire af ON t.affaire_id = af.id
      LEFT JOIN site s ON t.site_id = s.id
      LEFT JOIN demande_client dc ON t.demande_id = dc.id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'agent_matricule', tr.agent_matricule,
          'role', tr.role,
          'nom', ag.nom,
          'prenom', ag.prenom,
          'email', ag.email
        ) ORDER BY tr.id DESC) AS responsables
        FROM travaux_responsable tr
        LEFT JOIN agent ag ON ag.matricule = tr.agent_matricule
        WHERE tr.travaux_id = t.id
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'agent_matricule', ta.agent_matricule,
          'nom', ag.nom,
          'prenom', ag.prenom,
          'email', ag.email
        ) ORDER BY ta.id DESC) AS agents_assignes
        FROM travaux_agent ta
        LEFT JOIN agent ag ON ag.matricule = ta.agent_matricule
        WHERE ta.travaux_id = t.id
      ) ags ON true
    `;

    if (doe_id) {
      conditions.push(`t.doe_id = $${paramIndex++}`);
      params.push(doe_id);
    }
    if (affaire_id) {
      conditions.push(`t.affaire_id = $${paramIndex++}`);
      params.push(affaire_id);
    }
    if (site_id) {
      conditions.push(`t.site_id = $${paramIndex++}`);
      params.push(site_id);
    }
    if (demande_id) {
      conditions.push(`t.demande_id = $${paramIndex++}`);
      params.push(demande_id);
    }
    if (etat) {
      conditions.push(`t.etat = $${paramIndex++}::etat_travaux`);
      params.push(etat);
    }
    if (priorite) {
      conditions.push(`t.priorite ILIKE $${paramIndex++}`);
      params.push(`%${priorite}%`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += " ORDER BY t.created_at DESC";

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error('Error fetching travaux:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/travaux/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const travailRow = await pool.query(
      `SELECT t.*,
              s.nom_site,
              af.nom_affaire,
              d.titre AS doe_titre
       FROM travaux t
       LEFT JOIN site s ON s.id = t.site_id
       LEFT JOIN affaire af ON af.id = t.affaire_id
       LEFT JOIN doe d ON d.id = t.doe_id
       WHERE t.id = $1`,
      [id]
    );
    const travail = travailRow.rows[0];
    if (!travail) return res.status(404).json({ error: 'Not found' });

    const agents_assignes = (await pool.query(
      `SELECT ta.agent_matricule,
              ag.nom,
              ag.prenom,
              ag.email,
              ta.date_debut,
              ta.date_fin
       FROM travaux_agent ta
       LEFT JOIN agent ag ON ag.matricule = ta.agent_matricule
       WHERE ta.travaux_id = $1
       ORDER BY ta.id DESC`,
      [id]
    )).rows;

    const responsables = (await pool.query(
      `SELECT tr.agent_matricule,
              tr.role,
              tr.date_debut,
              tr.date_fin,
              tr.created_at,
              ag.nom,
              ag.prenom,
              ag.email
       FROM travaux_responsable tr
       LEFT JOIN agent ag ON ag.matricule = tr.agent_matricule
       WHERE tr.travaux_id = $1
       ORDER BY tr.id DESC`,
      [id]
    )).rows;

    res.json({ ...travail, agents_assignes, responsables });
  } catch (err) {
    console.error('Error fetching travaux by id:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/travaux', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    let { doe_id, affaire_id, site_id, demande_id, titre, description, etat, priorite, date_debut, date_fin, date_echeance, agent_matricule } = req.body;

    if (!titre) return res.status(400).json({ error: 'Titre is required' });

    const r = await pool.query(
      `INSERT INTO travaux (
        doe_id, affaire_id, site_id, demande_id, titre, description, etat, priorite, date_debut, date_fin, date_echeance, agent_matricule
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::etat_travaux, 'A_faire'::etat_travaux), $8, COALESCE($9::timestamp, CURRENT_TIMESTAMP), $10, $11, $12) RETURNING *`,
      [
        doe_id || null, affaire_id || null, site_id || null, demande_id || null, titre, description || null, etat || null, priorite || null, date_debut || null, date_fin || null, date_echeance || null, agent_matricule || null
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error('Error creating travaux:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.put('/api/travaux/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    let { doe_id, affaire_id, site_id, demande_id, titre, description, etat, priorite, date_debut, date_fin, date_echeance, agent_matricule } = req.body;

    if (!titre) return res.status(400).json({ error: 'Titre is required' });

    const r = await pool.query(
      `UPDATE travaux SET
        doe_id = COALESCE($1, doe_id),
        affaire_id = COALESCE($2, affaire_id),
        site_id = COALESCE($3, site_id),
        demande_id = COALESCE($4, demande_id),
        titre = COALESCE($5, titre),
        description = COALESCE($6, description),
        etat = COALESCE($7::etat_travaux, etat),
        priorite = COALESCE($8, priorite),
        date_debut = COALESCE($9, date_debut),
        date_fin = COALESCE($10, date_fin),
        date_echeance = COALESCE($11, date_echeance),
        agent_matricule = COALESCE($12, agent_matricule),
        updated_at = CURRENT_TIMESTAMP
      WHERE id=$13 RETURNING *`,
      [
        doe_id || null, affaire_id || null, site_id || null, demande_id || null, titre || null, description || null, etat || null, priorite || null, date_debut || null, date_fin || null, date_echeance || null,
        agent_matricule || null,
        id
      ]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error('Error updating travaux:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.delete('/api/travaux/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM travaux WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) { console.error('Error deleting travaux:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Travaux Tache API --------------------

// List all tasks for a specific travaux
app.get('/api/travaux/:travauxId/taches', authenticateToken, async (req, res) => {
  const { travauxId } = req.params;
  try {
    const r = await pool.query('SELECT * FROM travaux_tache WHERE travaux_id=$1 ORDER BY id DESC', [travauxId]);
    res.json(r.rows);
  } catch (err) { console.error('Error fetching travaux taches:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Create a new task for a specific travaux
app.post('/api/travaux/:travauxId/taches', authenticateToken, authorizeAdmin, async (req, res) => {
  const { travauxId } = req.params;
  const { titre, description, etat, priorite, date_echeance } = req.body;
  if (!titre) return res.status(400).json({ error: 'Titre is required' });
  try {
    const r = await pool.query(
      `INSERT INTO travaux_tache (travaux_id, titre, description, etat, priorite, date_echeance)
       VALUES ($1, $2, $3, COALESCE($4::etat_travaux, 'A_faire'::etat_travaux), $5, $6) RETURNING *`,
      [travauxId, titre, description || null, etat || null, priorite || null, date_echeance || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error('Error creating travaux tache:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Get a single task by its ID
app.get('/api/travaux_taches/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM travaux_tache WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Travaux tache not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error('Error fetching travaux tache by id:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Update a task
app.put('/api/travaux_taches/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { titre, description, etat, priorite, date_echeance } = req.body;
  if (!titre) return res.status(400).json({ error: 'Titre is required' });
  try {
    const r = await pool.query(
      `UPDATE travaux_tache SET
        titre = COALESCE($1, titre),
        description = COALESCE($2, description),
        etat = COALESCE($3::etat_travaux, etat),
        priorite = COALESCE($4, priorite),
        date_echeance = COALESCE($5, date_echeance),
        updated_at = CURRENT_TIMESTAMP
      WHERE id=$6 RETURNING *`,
      [titre || null, description || null, etat || null, priorite || null, date_echeance || null, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Travaux tache not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error('Error updating travaux tache:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Delete a task
app.delete('/api/travaux_taches/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM travaux_tache WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) { console.error('Error deleting travaux tache:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// -------------------- Travaux Relations API --------------------

// Travaux: assign agent
app.post('/api/travaux/:id/agents', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agent_matricule, date_debut=null, date_fin=null } = req.body;
  if (!agent_matricule) return res.status(400).json({ error: 'agent_matricule is required' });
  try {
    const t = (await pool.query('SELECT id FROM travaux WHERE id=$1', [id])).rows[0]; if (!t) return res.status(404).json({ error: 'Travaux not found' });
    const a = (await pool.query('SELECT matricule FROM agent WHERE matricule=$1', [agent_matricule])).rows[0]; if (!a) return res.status(404).json({ error: 'Agent not found' });
    const r = await pool.query('INSERT INTO travaux_agent (travaux_id, agent_matricule, date_debut, date_fin) VALUES ($1,$2,$3,$4) RETURNING *', [id, agent_matricule, date_debut, date_fin]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('travaux add agent:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/travaux/:id/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { id, matricule } = req.params;
    const r = await pool.query('DELETE FROM travaux_agent WHERE travaux_id=$1 AND agent_matricule=$2 RETURNING id', [id, matricule]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }
  catch (e) { console.error('travaux remove agent:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Travaux: add responsable (Chef/admin)
app.post('/api/travaux/:id/responsables', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agent_matricule, role='Secondaire' } = req.body;
  if (!agent_matricule) return res.status(400).json({ error: 'agent_matricule is required' });
  try {
    await assertAgentIsChef(agent_matricule);
    const t = (await pool.query('SELECT id FROM travaux WHERE id=$1', [id])).rows[0]; if (!t) return res.status(404).json({ error: 'Travaux not found' });
    const r = await pool.query("INSERT INTO travaux_responsable (travaux_id, agent_matricule, role) VALUES ($1,$2,$3) RETURNING *", [id, agent_matricule, role]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('travaux add responsable:', e); res.status(400).json({ error: e.message || 'Bad Request' }); }
});

// Travaux: submit satisfaction
app.post('/api/travaux/:id/satisfaction', authenticateToken, async (req, res) => {
    const { id: travauxId } = req.params;
    const { note, commentaire } = req.body;
    const userId = req.user.id;

    const rating = Number(note);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    }

    try {
        // Authorization check: User must be associated with the travaux's ticket's client
        const authQuery = `
            SELECT 1 FROM client c
            JOIN users u ON c.user_id = u.id
            JOIN ticket tk ON tk.client_id = c.id
            JOIN travaux tr ON tr.ticket_id = tk.id
            WHERE tr.id = $1 AND u.id = $2
        `;
        const authCheck = await pool.query(authQuery, [travauxId, userId]);

        if (authCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Forbidden: You are not the client for this travaux.' });
        }
        
        const result = await pool.query(
            'INSERT INTO travaux_satisfaction (travaux_id, user_id, rating, comment, envoieok) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (travaux_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, envoieok = TRUE, created_at = CURRENT_TIMESTAMP RETURNING *',
            [travauxId, userId, rating, commentaire]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(`Error submitting satisfaction for travaux ${travauxId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create a Rendu for a Travaux
app.post('/api/travaux/:id/rendus', authenticateToken, authorizeAdmin, renduUpload.array('image_files[]'), async (req, res) => {
    const { id: travauxId } = req.params;
    const { valeur, resume, image_commentaires, image_notes, image_titles } = req.body;
    const commentairesArr = Array.isArray(image_commentaires) ? image_commentaires : (image_commentaires ? [image_commentaires] : []);
    const notesArr = Array.isArray(image_notes) ? image_notes : (image_notes ? [image_notes] : []);
    const titlesArr = Array.isArray(image_titles) ? image_titles : (image_titles ? [image_titles] : []);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create the rendu_travaux record
        const renduResult = await client.query(
            'INSERT INTO rendu_travaux (travaux_id, valeur, resume) VALUES ($1, $2, $3) RETURNING id',
            [travauxId, valeur, resume]
        );
        const renduId = renduResult.rows[0].id;

        // 2. Handle file uploads
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const commentaire = commentairesArr[i] || null;
                const note = notesArr[i] || null;
                const fullComment = [commentaire, note].filter(Boolean).join('\\n\\n');
                const titre = titlesArr[i] || null;

                // Insert into images table
                const imageResult = await client.query(
                    `INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
                     VALUES ($1, $2, $3, $4, $5, $6, 'RenduTravaux', $7) RETURNING id`,
                    [file.originalname, file.mimetype, file.size, file.buffer, fullComment, req.user.matricule || null, renduId]
                );
                const imageId = imageResult.rows[0].id;

                // Link in rendu_travaux_image table
                await client.query(
                    'INSERT INTO rendu_travaux_image (rendu_travaux_id, image_id) VALUES ($1, $2)',
                    [renduId, imageId]
                );

                // Enregistrer aussi dans documents_repertoire pour conserver titre/commentaire
                await client.query(
                  `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, titre, commentaire)
                   VALUES ('RenduTravaux', $1, 'Document', $2, $3, $4, $5, $6)`,
                  [renduId, file.originalname, file.mimetype, file.size, titre || file.originalname, commentaire || null]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Rendu created successfully', renduId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error creating rendu for travaux ${travauxId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Get all Rendus for a Travaux
app.get('/api/travaux/:id/rendus', authenticateToken, async (req, res) => {
    const { id: travauxId } = req.params;
    try {
        const result = await pool.query(
            `SELECT r.*,
                    COALESCE(imgs.cnt,0) + COALESCE(docs.cnt,0) AS attachments_count
             FROM rendu_travaux r
             LEFT JOIN (
                SELECT rti.rendu_travaux_id, COUNT(*) AS cnt
                FROM rendu_travaux_image rti
                GROUP BY rti.rendu_travaux_id
             ) imgs ON imgs.rendu_travaux_id = r.id
             LEFT JOIN (
                SELECT cible_id, COUNT(*) AS cnt
                FROM documents_repertoire
                WHERE cible_type='RenduTravaux'
                GROUP BY cible_id
             ) docs ON docs.cible_id = r.id
             WHERE r.travaux_id = $1
             ORDER BY r.id DESC`,
            [travauxId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(`Error fetching rendus for travaux ${travauxId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get a single RenduTravaux by its own ID, with its attachments
app.get('/api/rendu_travaux/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const renduResult = await pool.query('SELECT * FROM rendu_travaux WHERE id = $1', [id]);
        const rendu = renduResult.rows[0];

        if (!rendu) {
            return res.status(404).json({ error: 'Rendu travaux not found' });
        }

        // Fetch associated images via the join table
        const imagesResult = await pool.query(`
            SELECT i.* FROM images i
            JOIN rendu_travaux_image rti ON i.id = rti.image_id
            WHERE rti.rendu_travaux_id = $1
            ORDER BY i.id DESC
        `, [id]);
        // Fetch associated documents (if any are linked via cible_type/cible_id) to récupérer titre/commentaire
        const documentsResult = await pool.query(
            "SELECT * FROM documents_repertoire WHERE cible_type = 'RenduTravaux' AND cible_id = $1 ORDER BY id DESC",
            [id]
        );
        // Associer des titres/commentaires éventuels depuis documents_repertoire (même cible, même nom de fichier)
        const documents = documentsResult.rows;
        const docMap = new Map((documents || []).map(d => [d.nom_fichier, d]));
        const images = imagesResult.rows.map(img => {
            const doc = docMap.get(img.nom_fichier);
            return doc ? { ...img, titre: doc.titre || doc.nom_fichier, commentaire_image: img.commentaire_image || doc.commentaire } : img;
        });
        
        res.json({ rendu, images, documents });

    } catch (err) {
        console.error(`Error fetching rendu_travaux ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.patch('/api/rendu_travaux/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id: renduId } = req.params;
    const { resume, valeur } = req.body;
    
    try {
        if (resume === undefined && valeur === undefined) {
            return res.status(400).json({ error: 'At least one field (resume or valeur) is required for update.' });
        }

        const result = await pool.query(
            'UPDATE rendu_travaux SET resume = COALESCE($1, resume), valeur = COALESCE($2, valeur) WHERE id = $3 RETURNING *',
            [resume, valeur, renduId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Rendu travaux not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating rendu_travaux ${renduId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/rendu_travaux/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id: renduId } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find and delete associated images
        const imagesToDelete = await client.query(
            "SELECT id FROM images WHERE cible_type = 'RenduTravaux' AND cible_id = $1",
            [renduId]
        );
        for (const img of imagesToDelete.rows) {
            await client.query('DELETE FROM images WHERE id = $1', [img.id]);
        }

        // 2. Delete entries in the join table (rendu_travaux_image)
        await client.query('DELETE FROM rendu_travaux_image WHERE rendu_travaux_id = $1', [renduId]);

        // 3. Delete the rendu_travaux record
        const result = await pool.query('DELETE FROM rendu_travaux WHERE id = $1 RETURNING id', [renduId]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Rendu travaux not found' });
        }

        await client.query('COMMIT');
        res.status(204).send(); // No Content

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error deleting rendu_travaux ${renduId}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

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

// Tickets: assign agent
app.post('/api/tickets/:id/agents', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agent_matricule, date_debut=null, date_fin=null } = req.body;
  if (!agent_matricule) return res.status(400).json({ error: 'agent_matricule is required' });
  try {
    const t = (await pool.query('SELECT id FROM ticket WHERE id=$1', [id])).rows[0]; if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const a = (await pool.query('SELECT matricule FROM agent WHERE matricule=$1', [agent_matricule])).rows[0]; if (!a) return res.status(404).json({ error: 'Agent not found' });
    const r = await pool.query('INSERT INTO ticket_agent (ticket_id, agent_matricule, date_debut, date_fin) VALUES ($1,$2,$3,$4) RETURNING *', [id, agent_matricule, date_debut, date_fin]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('ticket add agent:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.delete('/api/tickets/:id/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { id, matricule } = req.params;
    const r = await pool.query('DELETE FROM ticket_agent WHERE ticket_id=$1 AND agent_matricule=$2 RETURNING id', [id, matricule]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    // This part of the propagation logic is removed as agent_matricule no longer exists on intervention
    res.json({ ok: true });
  }
  catch (e) { console.error('ticket remove agent:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Tickets: add responsable (Chef/admin)
app.post('/api/tickets/:id/responsables', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params; const { agent_matricule, role='Secondaire' } = req.body;
  if (!agent_matricule) return res.status(400).json({ error: 'agent_matricule is required' });
  try {
    await assertAgentIsChef(agent_matricule);
    const t = (await pool.query('SELECT id FROM ticket WHERE id=$1', [id])).rows[0]; if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const r = await pool.query("INSERT INTO ticket_responsable (ticket_id, agent_matricule, role) VALUES ($1,$2,$3) RETURNING *", [id, agent_matricule, role]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('ticket add responsable:', e); res.status(400).json({ error: e.message || 'Bad Request' }); }
});

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

// --- Client registration: create user with ROLE_CLIENT and linked client ---
app.post('/api/clients/register', authenticateToken, authorizeAdmin, async (req, res) => {
  const { email, password, nom_client, representant_nom, representant_tel, adresse_id, commentaire } = req.body || {};
  if (!email || !password || !nom_client) return res.status(400).json({ error: 'email, password, nom_client are required' });
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const exists = await cx.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows[0]) { await cx.query('ROLLBACK'); return res.status(409).json({ error: 'User already exists' }); }
    const hashed = await bcrypt.hash(password, 10);
    const ures = await cx.query('INSERT INTO users (email, password, roles) VALUES ($1,$2,$3) RETURNING id,email,roles', [email, hashed, JSON.stringify(['ROLE_CLIENT'])]);
    const u = ures.rows[0];
    const cres = await cx.query(
      'INSERT INTO client (nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [nom_client, representant_nom || null, email, representant_tel || null, adresse_id || null, commentaire || null, u.id]
    );
    const cli = cres.rows[0];
    try { await cx.query('UPDATE client SET user_id=$1 WHERE id=$2', [u.id, cli.id]); } catch(_) {}
    await cx.query('COMMIT');
    return res.status(201).json({ user: u, client: cli });
  } catch (e) {
    try { await cx.query('ROLLBACK'); } catch(_) {}
    console.error('clients/register failed:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally { cx.release(); }
});

// --- Client profile ---
app.get('/api/client/profile', authenticateToken, async (req, res) => {
  try {
    const email = req.user && req.user.email;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    // Direct match on client
    const c = (await pool.query('SELECT * FROM client WHERE representant_email=$1 OR user_id=$2 LIMIT 1', [email, req.user.id || null])).rows[0];
    if (c) return res.json(c);
    // Fallback via client_representant
    const rep = (await pool.query(
      `SELECT c.* FROM client c
       JOIN client_representant cr ON cr.client_id = c.id
       LEFT JOIN users u ON u.id = cr.user_id
       WHERE cr.user_id=$1 OR LOWER(cr.email)=LOWER($2) OR LOWER(u.email)=LOWER($2)
       LIMIT 1`,
      [req.user.id || null, email]
    )).rows[0];
    if (!rep) return res.status(404).json({ error: 'Client record not found for this user' });
    return res.json(rep);
  } catch (e) { console.error('client profile fetch:', e); return res.status(500).json({ error: 'Internal Server Error' }); }
});

// --- Client-owned sites ---
const getClientIdFromUser = async (pool, user) => {
    if (!user) return null;
    // 1) direct link on client
    const byClient = await pool.query('SELECT id FROM client WHERE user_id=$1 OR LOWER(representant_email)=LOWER($2) LIMIT 1', [user.id || null, user.email || null]);
    if (byClient.rows[0]) return byClient.rows[0].id;
    // 2) link via client_representant (user_id or email match)
    const byRep = await pool.query(
        `SELECT client_id FROM client_representant cr
         LEFT JOIN users u ON u.id = cr.user_id
         WHERE cr.user_id = $1 OR LOWER(cr.email) = LOWER($2) OR LOWER(u.email) = LOWER($2)
         LIMIT 1`,
        [user.id || null, user.email || null]
    );
    return byRep.rows[0] ? byRep.rows[0].client_id : null;
};

app.get('/api/client/sites', authenticateToken, async (req, res) => {
  try {
    const clientId = await getClientIdFromUser(pool, req.user);
    if (!clientId) return res.json([]);
    const r = await pool.query('SELECT * FROM site WHERE client_id=$1 ORDER BY id DESC', [clientId]);
    return res.json(r.rows);
  } catch (e) { console.error('client sites list:', e); return res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/api/client/sites', authenticateToken, async (req, res) => {
  try {
    const clientId = await getClientIdFromUser(pool, req.user);
    if (!clientId) return res.status(400).json({ error: 'Client record not found for this user' });
    const { nom_site, adresse_id, commentaire } = req.body || {};
    if (!nom_site) return res.status(400).json({ error: 'nom_site is required' });
    const r = await pool.query('INSERT INTO site (nom_site, adresse_id, client_id, commentaire) VALUES ($1,$2,$3,$4) RETURNING *', [nom_site, adresse_id || null, clientId, commentaire || null]);
    return res.status(201).json(r.rows[0]);
  } catch (e) { console.error('client site create:', e); return res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/client/sites/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const clientId = await getClientIdFromUser(pool, req.user);
        if (!clientId) return res.status(403).json({ error: 'Client not found for user.' });

        const siteResult = await pool.query('SELECT * FROM site WHERE id = $1 AND client_id = $2', [id, clientId]);
        const site = siteResult.rows[0];

        if (!site) return res.status(404).json({ error: 'Site not found or access denied.' });
        
        res.json(site);
    } catch (err) {
        console.error(`Error fetching client site ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/client/sites/:id/relations', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const clientId = await getClientIdFromUser(pool, req.user);
        if (!clientId) return res.status(403).json({ error: 'Client not found for user.' });

        const siteResult = await pool.query('SELECT * FROM site WHERE id = $1 AND client_id = $2', [id, clientId]);
        const site = siteResult.rows[0];

        if (!site) return res.status(404).json({ error: 'Site not found or access denied.' });
        
        const tickets = (await pool.query('SELECT t.id, t.titre, t.etat, t.created_at FROM ticket t WHERE t.site_id = $1 ORDER BY t.created_at DESC', [id])).rows;
        
        res.json({ site, tickets });
    } catch (err) {
        console.error(`Error fetching client site relations ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/client/sites/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { nom_site, commentaire } = req.body;

    if (!nom_site) return res.status(400).json({ error: 'Le nom du site est obligatoire.' });

    try {
        const clientId = await getClientIdFromUser(pool, req.user);
        if (!clientId) return res.status(403).json({ error: 'Client not found for user.' });

        const siteCheck = await pool.query('SELECT id FROM site WHERE id = $1 AND client_id = $2', [id, clientId]);
        if (siteCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Site not found or access denied.' });
        }

        const result = await pool.query(
            'UPDATE site SET nom_site = $1, commentaire = $2 WHERE id = $3 AND client_id = $4 RETURNING *',
            [nom_site, commentaire, id, clientId]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error updating client site ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Client demandes (requests) ---
app.get('/api/demandes_client/mine', authenticateToken, async (req, res) => {
    try {
      const email = req.user && req.user.email;
      if (!email) return res.status(401).json({ error: 'Unauthorized' });

      // Identify the client linked to the logged in user (case-insensitive)
      const clientRow = (await pool.query(
        'SELECT id FROM client WHERE user_id=$1 OR LOWER(representant_email)=LOWER($2) LIMIT 1',
        [req.user.id || null, email]
      )).rows[0];
      if (!clientRow) return res.json([]);

      const demandes = (await pool.query(
        `SELECT d.*, s.nom_site AS site_nom
         FROM demande_client d
         LEFT JOIN site s ON s.id = d.site_id
         WHERE d.client_id = $1
           AND (d.status IS NULL OR d.status <> 'Supprimée')
         ORDER BY d.id DESC`,
        [clientRow.id]
      )).rows;

      res.json(demandes);
    } catch (err) {
      console.error('Error loading demandes_client/mine:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/demandes_client/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const demand = (await pool.query('SELECT * FROM demande_client WHERE id = $1', [id])).rows[0];
        if (!demand) {
            return res.status(404).json({ error: 'Demande client not found' });
        }

        // Authorization check: Admin or owner of the demand
        const isAdmin = req.user.roles.includes('ROLE_ADMIN');
        if (!isAdmin) {
            const client = (await pool.query('SELECT id, representant_email, user_id FROM client WHERE id=$1', [demand.client_id])).rows[0];
            const owns = client && (
              (client.user_id && client.user_id === req.user.id) ||
              (client.representant_email && req.user.email && client.representant_email.toLowerCase() === req.user.email.toLowerCase())
            );
            if (!owns) {
                return res.status(403).json({ error: 'Forbidden: You do not own this demand or lack admin privileges' });
            }
        }
        res.status(200).json(demand);
    } catch (err) {
        console.error(`Error fetching demande client ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.post('/api/demandes_client', authenticateToken, async (req, res) => {
    const { site_id, titre, description, client_id } = req.body;
    if (!titre || !description) {
        return res.status(400).json({ error: 'Titre and Description are required' });
    }

    const isAdmin = req.user.roles.includes('ROLE_ADMIN');
    let finalClientId;

    if (isAdmin && client_id) {
        finalClientId = client_id;
    } else {
        const email = req.user.email;
        if (!email) {
            return res.status(401).json({ error: 'Unauthorized: User email not found in token' });
        }
        const client = (await pool.query('SELECT id FROM client WHERE user_id=$1 OR LOWER(representant_email)=LOWER($2) LIMIT 1', [req.user.id || null, email])).rows[0];
        if (!client) {
            return res.status(403).json({ error: 'Forbidden: No client associated with this user' });
        }
        finalClientId = client.id;
    }

    // Verify site_id belongs to the client if provided
    if (site_id) {
        const site = (await pool.query('SELECT id FROM site WHERE id=$1 AND client_id=$2', [site_id, finalClientId])).rows[0];
        if (!site) {
            return res.status(403).json({ error: 'Forbidden: Site does not belong to this client' });
        }
    }
    
    try {
        const result = await pool.query(
            'INSERT INTO demande_client (client_id, site_id, titre, description) VALUES ($1, $2, $3, $4) RETURNING *',
            [finalClientId, site_id || null, titre, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating client demand:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/demandes_client/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { site_id, titre, description } = req.body;

    if (!titre || !description) {
        return res.status(400).json({ error: 'Titre and Description are required' });
    }

    const isAdmin = req.user.roles.includes('ROLE_ADMIN');
    let demandOwnerClientId = null;

    try {
        // Get existing demand to check ownership and ticket_id
        const existingDemand = (await pool.query('SELECT client_id, ticket_id FROM demande_client WHERE id = $1', [id])).rows[0];
        if (!existingDemand) {
            return res.status(404).json({ error: 'Demande client not found' });
        }
        demandOwnerClientId = existingDemand.client_id;
        
        // Prevent editing if it's already converted to a ticket
        if (existingDemand.ticket_id) {
            return res.status(409).json({ error: 'Cannot edit a client demand that has been converted to a ticket.' });
        }

        // Authorization check
        if (!isAdmin) {
            const client = (await pool.query('SELECT id, representant_email, user_id FROM client WHERE id=$1', [demandOwnerClientId])).rows[0];
            const owns = client && (
              (client.user_id && client.user_id === req.user.id) ||
              (client.representant_email && req.user.email && client.representant_email.toLowerCase() === req.user.email.toLowerCase())
            );
            if (!owns) {
                return res.status(403).json({ error: 'Forbidden: You do not own this demand or lack admin privileges' });
            }
        }

        // Verify site_id belongs to the demand owner if provided
        if (site_id) {
            const site = (await pool.query('SELECT id FROM site WHERE id=$1 AND client_id=$2', [site_id, demandOwnerClientId])).rows[0];
            if (!site) {
                return res.status(403).json({ error: 'Forbidden: Site does not belong to this client' });
            }
        }

        const result = await pool.query(
            'UPDATE demande_client SET site_id=$1, titre=$2, description=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *',
            [site_id || null, titre, description, id]
        );
        res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error(`Error updating client demand ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Client: Get single demand details for tracking ---
app.get('/api/client/demandes/:id', authenticateToken, async (req, res) => {
  try {
    const email = req.user && req.user.email;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    const clientResult = await pool.query('SELECT id FROM client WHERE representant_email=$1 OR user_id=$2 LIMIT 1', [email, req.user.id || null]);
    const client = clientResult.rows[0];
    if (!client) return res.status(404).json({ error: 'Client record not found for this user' });

    const { id } = req.params;
    const demandeResult = await pool.query(
      "SELECT d.*, s.nom_site FROM demande_client d LEFT JOIN site s ON d.site_id = s.id WHERE d.id=$1 AND d.client_id=$2",
      [id, client.id]
    );
    const demande = demandeResult.rows[0];

    if (!demande) {
      return res.status(404).json({ error: 'Demande not found or access denied' });
    }

    let ticket = null;
    let responsable = null;
    let interventions = [];

    if (demande.ticket_id) {
      const ticketResult = await pool.query('SELECT * FROM ticket WHERE id=$1', [demande.ticket_id]);
      ticket = ticketResult.rows[0];

      if (ticket) {
        if (ticket.responsable) {
          const responsableResult = await pool.query('SELECT user_id, matricule, nom, prenom, email, tel FROM agent WHERE matricule=$1', [ticket.responsable]);
          responsable = responsableResult.rows[0];
        }
        const interventionsResult = await pool.query('SELECT * FROM intervention WHERE ticket_id=$1 ORDER BY date_debut DESC', [ticket.id]);
        interventions = interventionsResult.rows;
      }
    }

    // Fallback: ensure there is always a responsable (default admin) for messaging
    if (!responsable) {
      const adminUserResult = await pool.query("SELECT user_id, matricule, nom, prenom, email, tel FROM agent WHERE email = 'maboujunior777@gmail.com' LIMIT 1");
      responsable = adminUserResult.rows[0] || null;
      // Try to populate user_id if missing
      if (responsable && !responsable.user_id && responsable.email) {
        try {
          const u = await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [responsable.email]);
          responsable.user_id = (u.rows[0] || {}).id || null;
        } catch (_) {}
      }
    }

    res.json({ demande, ticket, responsable, interventions });

  } catch (e) {
    console.error(`Error fetching details for demand ${req.params.id}:`, e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// --- Admin: demandes listing and workflow ---
// List all demandes with client/site (admin)
app.get('/api/demandes_client', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { client, status, sort, direction, include_deleted } = req.query;
    let query = `
      SELECT d.*, c.nom_client, c.representant_email, s.nom_site
      FROM demande_client d
      LEFT JOIN client c ON d.client_id=c.id
      LEFT JOIN site s   ON d.site_id=s.id
    `;
    const params = [];
    const conditions = [];

    if (client) {
      conditions.push(`(c.nom_client ILIKE $${params.length + 1} OR c.representant_email ILIKE $${params.length + 1})`);
      params.push(`%${client}%`);
    }
    if (status) {
      conditions.push(`d.status = $${params.length + 1}`);
      params.push(status);
    } else if (!String(include_deleted || '').toLowerCase().startsWith('t')) {
      conditions.push(`d.status <> 'Supprimée'`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    let orderBy = 'd.created_at';
    let orderDirection = 'DESC';

    if (sort) {
      const allowedSortColumns = ['id', 'nom_client', 'site_id', 'status', 'created_at'];
      if (allowedSortColumns.includes(sort)) {
        orderBy = `d.${sort}`;
      }
    }
    if (direction && ['asc', 'desc'].includes(direction.toLowerCase())) {
      orderDirection = direction.toUpperCase();
    }

    query += ` ORDER BY ${orderBy} ${orderDirection}`;

    const r = await pool.query(query, params);
    return res.json(r.rows);
  } catch (e) { console.error('demandes list:', e); return res.status(500).json({ error: 'Internal Server Error' }); }
});

// Update demande status (admin)
app.put('/api/demandes_client/:id/status', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, commentaire } = req.body || {};
    const allowed = ['En cours de traitement', 'Traité', 'En attente', 'Annulé'];
    if (!allowed.includes(String(status || '').trim())) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateFields = ['status=$1', 'updated_at=CURRENT_TIMESTAMP'];
    const queryParams = [status];

    if ((status === 'Rejeté' || status === 'Annulé')) {
        updateFields.push(`commentaire=$${queryParams.length + 1}`);
        queryParams.push(commentaire || null); // Ensure comment can be null
    }

    queryParams.push(id);
    const finalQuery = `UPDATE demande_client SET ${updateFields.join(', ')} WHERE id=$${queryParams.length} RETURNING *`;

    const r = await pool.query(finalQuery, queryParams);

    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.json(r.rows[0]);
  } catch (e) {
    console.error('demande status update:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete a client demand (admin)
app.delete('/api/demandes_client/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { justification } = req.body;

  if (!justification) {
      return res.status(400).json({ error: 'Justification is required' });
  }

  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    // Check if the demand has been converted to a ticket
    const d = (await cx.query('SELECT ticket_id FROM demande_client WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!d) {
      await cx.query('ROLLBACK');
      return res.status(404).json({ error: 'Demande not found' });
    }
    if (d.ticket_id) {
      await cx.query('ROLLBACK');
      return res.status(409).json({ error: 'This demand cannot be deleted because it has been converted into a ticket.' });
    }

    await logAudit('demande_client', id, 'DELETE', req.user.email, { justification });
    // Soft delete: mark as Supprimée and store justification in commentaire
    await cx.query("UPDATE demande_client SET status='Supprimée', commentaire=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [justification, id]);
    await cx.query('COMMIT');
    res.status(200).json({ message: 'Demand marked as deleted.' });
  } catch (e) {
    try { await cx.query('ROLLBACK'); } catch (_) {}
    console.error('Error deleting client demand:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    cx.release();
  }
});

// Deleted demandes (audit log) - admin
app.get('/api/demandes_client/deleted', authenticateToken, authorizeAdmin, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT d.id, d.commentaire, d.status, d.updated_at, c.nom_client, c.representant_email, s.nom_site, a.actor_email, a.details
       FROM demande_client d
       LEFT JOIN client c ON c.id=d.client_id
       LEFT JOIN site s ON s.id=d.site_id
       LEFT JOIN audit_log a ON a.entity='demande_client' AND a.action='DELETE' AND a.entity_id=CAST(d.id AS TEXT)
       WHERE d.status='Supprimée'
       ORDER BY d.updated_at DESC
       LIMIT 200`
    );
    const rows = (r.rows || []).map(row => {
      let justification = row.commentaire || null;
      if (!justification) {
        try {
          const d = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
          justification = d && d.justification ? d.justification : null;
        } catch(_) {}
      }
      return {
        id: row.id,
        actor_email: row.actor_email,
        justification,
        nom_client: row.nom_client,
        representant_email: row.representant_email,
        nom_site: row.nom_site,
        updated_at: row.updated_at
      };
    });
    res.json(rows);
  } catch (e) {
    console.error('Error fetching deleted demandes:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Restore a soft-deleted demand
app.post('/api/demandes_client/:id/restore', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query("UPDATE demande_client SET status='En cours de traitement', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='Supprimée' RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Demande not found or not deleted' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('Error restoring demand:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Convert demande -> Ticket (admin)
app.post('/api/demandes_client/:id/convert-to-ticket', authenticateToken, authorizeAdmin, async (req, res) => {
  const cx = await pool.connect();
  try {
    const { id } = req.params;
    const connectedUserMatricule = req.user.matricule;

    await cx.query('BEGIN');
    
    // 1. Fetch the original request
    const d = (await cx.query('SELECT * FROM demande_client WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!d) {
      await cx.query('ROLLBACK');
      return res.status(404).json({ error: 'Demande not found' });
    }

    // 2. Find related DOE/Affaire from the site
    let doe_id = null, affaire_id = null;
    if (d.site_id) {
      const rel = (await cx.query('SELECT id, affaire_id FROM doe WHERE site_id=$1 ORDER BY id ASC LIMIT 1', [d.site_id])).rows[0];
      if (rel) { doe_id = rel.id; affaire_id = rel.affaire_id || null; }
    }

    // 3. Create the new ticket, setting the legacy 'responsable' field
    const titre = `Demande client #${d.id}`;
    const desc = d.description || null;
    const t = (await cx.query(
      'INSERT INTO ticket (doe_id, affaire_id, site_id, responsable, titre, description, etat) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [doe_id, affaire_id, d.site_id || null, connectedUserMatricule, titre, desc, 'Pas_commence']
    )).rows[0];

    // 4. Assign the current user as the primary responsible person in the dedicated table
    if (connectedUserMatricule) {
      await cx.query(
        "INSERT INTO ticket_responsable (ticket_id, agent_matricule, role) VALUES ($1, $2, $3)",
        [t.id, connectedUserMatricule, 'Principal']
      );
    }

    // 5. Update the original request to link it to the new ticket (status aligné sur le ticket)
    await cx.query("UPDATE demande_client SET status=$1, updated_at=CURRENT_TIMESTAMP, ticket_id=$2 WHERE id=$3", [t.etat || 'Traité', t.id, id]);
    
    await cx.query('COMMIT');
    
    return res.status(201).json({ ticket: t, demande: { id: d.id, status: 'Traité', ticket_id: t.id } });
  } catch (e) {
    try { await cx.query('ROLLBACK'); } catch(_) {}
    console.error('demande convert:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    cx.release();
  }
});

// -------------------- Messagerie API --------------------

async function canAccessDemandConversation(conversation_id, user) {
  const match = /^demande-(\d+)$/.exec(conversation_id || '');
  if (!match) return false;
  const demandId = Number(match[1]);
  if (!Number.isFinite(demandId)) return false;
  try {
    const d = (await pool.query(`
      SELECT d.id, d.client_id, d.ticket_id, c.representant_email, t.responsable
      FROM demande_client d
      LEFT JOIN client c ON c.id=d.client_id
      LEFT JOIN ticket t ON t.id=d.ticket_id
      WHERE d.id=$1
      LIMIT 1
    `, [demandId])).rows[0];
    if (!d) return false;
    const email = (user && user.email || '').toLowerCase();
    const isClient = email && d.representant_email && d.representant_email.toLowerCase() === email;
    const isAdmin = Array.isArray(user && user.roles) && user.roles.includes('ROLE_ADMIN');
    const isResponsable = !!(user && user.matricule && d.responsable && d.responsable === user.matricule);
    return isAdmin || isClient || isResponsable;
  } catch (e) {
    console.warn('canAccessDemandConversation failed:', e.message);
    return false;
  }
}

// Create a new conversation
app.post('/api/conversations/new', authenticateToken, async (req, res) => {
    const { message_body, recipient_email } = req.body;
    const sender_id = req.user.id;

    if (!message_body || !recipient_email) {
        return res.status(400).json({ error: 'Message body and recipient email are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const recipientResult = await client.query('SELECT id FROM users WHERE email = $1', [recipient_email]);
        if (recipientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Recipient not found' });
        }
        const receiver_id = recipientResult.rows[0].id;

        if (sender_id === receiver_id) {
            return res.status(400).json({ error: 'Cannot start a conversation with yourself' });
        }
        
        // Create a consistent conversation ID
        const user1 = Math.min(sender_id, receiver_id);
        const user2 = Math.max(sender_id, receiver_id);
        const conversation_id = `user${user1}-user${user2}`;

        const messageResult = await client.query(
            'INSERT INTO messagerie (conversation_id, sender_id, receiver_id, body) VALUES ($1, $2, $3, $4) RETURNING *',
            [conversation_id, sender_id, receiver_id, message_body]
        );
        const newMessage = messageResult.rows[0];

        await client.query('COMMIT');
        res.status(201).json(newMessage);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating new conversation:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

// Get all conversations for a user, with server-side filtering
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = Array.isArray(req.user?.roles) && req.user.roles.includes('ROLE_ADMIN');
        const { search, site, client: clientName } = req.query;
        
        let query = `
            SELECT DISTINCT ON (m.conversation_id) 
                m.conversation_id, m.body, m.created_at, m.sender_id, m.receiver_id,
                u_sender.email as sender_email,
                u_receiver.email as receiver_email
            FROM messagerie m
            LEFT JOIN users u_sender ON m.sender_id = u_sender.id
            LEFT JOIN users u_receiver ON m.receiver_id = u_receiver.id
            LEFT JOIN (
                SELECT id, site_id, client_id, titre, ('demande-' || id) as conversation_id_str 
                FROM demande_client
            ) AS dc ON m.conversation_id = dc.conversation_id_str
            LEFT JOIN site s ON dc.site_id = s.id
            LEFT JOIN client cl ON dc.client_id = cl.id
        `;
        
        const params = [];
        const conditions = [];
        if (!isAdmin) {
            params.push(userId);
            conditions.push(`(m.sender_id = $${params.length} OR m.receiver_id = $${params.length})`);
        }

        if (site) {
            params.push(`%${site}%`);
            conditions.push(`s.nom_site ILIKE $${params.length}`);
        }
        if (clientName) {
            params.push(`%${clientName}%`);
            conditions.push(`cl.nom_client ILIKE $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(
                m.body ILIKE $${params.length} OR 
                m.conversation_id ILIKE $${params.length} OR 
                dc.titre ILIKE $${params.length} OR
                u_sender.email ILIKE $${params.length} OR
                u_receiver.email ILIKE $${params.length}
            )`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        query += ' ORDER BY m.conversation_id, m.created_at DESC';

        const result = await pool.query(query, params);

        const conversations = result.rows.map((convo) => {
            const other_user_email = convo.sender_id === userId ? convo.receiver_email : convo.sender_email;
            return {
                ...convo,
                other_user_email
            };
        });

        res.json(conversations);
    } catch (err) {
        console.error('Error fetching conversations:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get messages for a conversation
app.get('/api/conversations/:conversation_id', authenticateToken, async (req, res) => {
    const { conversation_id } = req.params;
    try {
        const result = await pool.query(
            `SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.ticket_id, m.demande_id, m.client_id, m.body, m.is_read, m.created_at,
                    (SELECT json_agg(json_build_object('id', ma.id, 'file_name', ma.file_name, 'file_type', ma.file_type, 'file_size', ma.file_size))
                     FROM messagerie_attachment ma WHERE ma.message_id = m.id) as attachments
             FROM messagerie m
             WHERE m.conversation_id = $1
             ORDER BY m.created_at ASC`,
            [conversation_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching conversation:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Send a message
app.post('/api/conversations/:conversation_id/messages', authenticateToken, upload.array('attachments'), async (req, res) => {
    const { conversation_id } = req.params;
    const { sender_id, receiver_id, body } = req.body;
    const files = req.files;

    if (!sender_id || !receiver_id || (!body && (!files || files.length === 0))) {
        return res.status(400).json({ error: 'Sender, receiver, and message body or attachments are required.' });
    }

    let ticketId = null;
    let demandeId = null;
    let clientId = null;

    // Parse conversation_id to extract relevant IDs
    const parts = conversation_id.split('-');
    if (parts.length === 2) {
        const type = parts[0];
        const id = parseInt(parts[1], 10);
        if (!isNaN(id)) {
            if (type === 'ticket') {
                ticketId = id;
                // Try to get client_id from ticket
                try {
                    const ticketResult = await pool.query('SELECT site_id, demande_id FROM ticket WHERE id = $1', [ticketId]);
                    if (ticketResult.rows.length > 0) {
                        demandeId = ticketResult.rows[0].demande_id;
                        const siteId = ticketResult.rows[0].site_id;
                        if (siteId) {
                            const siteResult = await pool.query('SELECT client_id FROM site WHERE id = $1', [siteId]);
                            if (siteResult.rows.length > 0) {
                                clientId = siteResult.rows[0].client_id;
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`Could not derive client_id/demande_id from ticket ${ticketId}:`, err.message);
                }
            } else if (type === 'demande') {
                demandeId = id;
                // Try to get client_id from demande_client
                try {
                    const demandeResult = await pool.query('SELECT client_id FROM demande_client WHERE id = $1', [demandeId]);
                    if (demandeResult.rows.length > 0) {
                        clientId = demandeResult.rows[0].client_id;
                    }
                } catch (err) {
                    console.warn(`Could not derive client_id from demande_client ${demandeId}:`, err.message);
                }
            } else if (type === 'client') {
                clientId = id;
            }
        }
    }


    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert message with new FKs
        const messageResult = await client.query(
            'INSERT INTO messagerie (conversation_id, sender_id, receiver_id, ticket_id, demande_id, client_id, body) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [conversation_id, sender_id, receiver_id, ticketId, demandeId, clientId, body || null]
        );
        const messageId = messageResult.rows[0].id;

        // Handle attachments if any
        if (files && files.length > 0) {
            for (const file of files) {
                await client.query(
                    'INSERT INTO messagerie_attachment (message_id, file_blob, file_name, file_type, file_size) VALUES ($1, $2, $3, $4, $5)',
                    [messageId, file.buffer, file.originalname, file.mimetype, file.size]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Message sent', messageId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error sending message:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Serving static files from ${__dirname}/public`);
    });
});
