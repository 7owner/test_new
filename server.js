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

// Ensure core reference data (agents coherent with users) on startup
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
app.post('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { cible_type, cible_id, nom_fichier, type_mime, base64, auteur_matricule } = req.body || {};
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
      `INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier, type_mime, taille_octets, chemin_fichier, checksum_sha256, auteur_matricule)
       VALUES ($1,$2,$3::doc_nature,$4,$5,$6,$7,$8,$9) RETURNING *`,
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
    const satisfaction = (await pool.query('SELECT rating, comment FROM ticket_satisfaction WHERE ticket_id=$1', [id])).rows[0] || null;

    res.json({ ticket, doe, affaire, site, demande, interventions, documents, images, responsables, agents_assignes, satisfaction });
  } catch (err) {
    console.error('Error fetching ticket relations:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});


// -------------------- Relations: Intervention --------------------
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
    const materiels = (await pool.query("SELECT im.id, m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat, im.quantite, im.commentaire FROM intervention_materiel im JOIN materiel m ON m.id = im.materiel_id WHERE im.intervention_id=$1 ORDER BY im.id DESC", [id])).rows;

    res.json({ intervention, ticket, doe, site, demande, affaire, rendezvous, documents, images, materiels });
  } catch (err) {
    console.error('Error fetching intervention relations:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -------------------- Matériels API --------------------
// List all materiels
app.get('/api/materiels', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM materiel ORDER BY id DESC');
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

// Create materiel (admin)
app.post('/api/materiels', authenticateToken, authorizeAdmin, async (req, res) => {
  const { reference, designation, categorie, fabricant, prix_achat, commentaire } = req.body;
  try {
    const r = await pool.query('INSERT INTO materiel (reference, designation, categorie, fabricant, prix_achat, commentaire) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [reference || null, designation || null, categorie || null, fabricant || null, prix_achat || null, commentaire || null]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('Error creating materiel:', e); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Update materiel (admin)
app.put('/api/materiels/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { reference, designation, categorie, fabricant, prix_achat, commentaire } = req.body;
  try {
    const r = await pool.query('UPDATE materiel SET reference=$1, designation=$2, categorie=$3, fabricant=$4, prix_achat=$5, commentaire=$6 WHERE id=$7 RETURNING *', [reference || null, designation || null, categorie || null, fabricant || null, prix_achat || null, commentaire || null, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { console.error('Error updating materiel:', e); res.status(500).json({ error: 'Internal Server Error' }); }
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
    const r = await pool.query("SELECT im.id, m.id as materiel_id, m.reference, m.designation, m.categorie, m.fabricant, m.prix_achat, im.quantite, im.commentaire FROM intervention_materiel im JOIN materiel m ON m.id = im.materiel_id WHERE im.intervention_id=$1 ORDER BY im.id DESC", [req.params.id]);
    res.json(r.rows);
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
        const result = await pool.query('SELECT * FROM contrat ORDER BY created_at DESC');
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
    const { titre, date_debut, date_fin } = req.body;
    if (!titre || !date_debut) {
        return res.status(400).json({ error: 'Title and start date are required' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO contrat (titre, date_debut, date_fin) VALUES ($1, $2, $3) RETURNING *',
            [titre, date_debut, date_fin || null]
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
    const { titre, date_debut, date_fin } = req.body;
    if (!titre || !date_debut) {
        return res.status(400).json({ error: 'Title and start date are required' });
    }
    try {
        const result = await pool.query(
            'UPDATE contrat SET titre = $1, date_debut = $2, date_fin = $3 WHERE id = $4 RETURNING *',
            [titre, date_debut, date_fin || null, id]
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

// Client relations: include sites and demandes
app.get('/api/clients/:id/relations', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const c = (await pool.query('SELECT c.*, a.libelle AS adresse_libelle FROM client c LEFT JOIN adresse a ON c.adresse_id = a.id WHERE c.id=$1', [id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Not found' });
    const sites = (await pool.query('SELECT * FROM site WHERE client_id=$1 ORDER BY id DESC', [id])).rows;
    const demandes = (await pool.query('SELECT d.*, s.nom_site FROM demande_client d LEFT JOIN site s ON s.id=d.site_id WHERE d.client_id=$1 ORDER BY d.created_at DESC', [id])).rows;
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
    res.json({ client: c, sites, demandes, representants });
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
    const result = await pool.query('SELECT s.*, a.libelle as adresse_libelle, a.ligne1, a.ligne2, a.code_postal, a.ville, a.pays FROM site s LEFT JOIN adresse a ON s.adresse_id = a.id ORDER BY s.id DESC');
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
    try {
        const result = await pool.query(
            'INSERT INTO agent (matricule, nom, prenom, email, tel, agence_id, actif, admin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [matricule, nom, prenom, email, tel, agence_id, actif, admin]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating agent:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/agents/:matricule', authenticateToken, authorizeAdmin, async (req, res) => {
    const { matricule } = req.params;
    console.log('Received body for agent update:', req.body);
    const { nom, prenom, email, tel, agence_id, actif, admin } = req.body;
    try {
        const result = await pool.query(
            'UPDATE agent SET nom = $1, prenom = $2, email = $3, tel = $4, agence_id = $5, actif = $6, admin = $7 WHERE matricule = $8 RETURNING *',
            [nom, prenom, email, tel, agence_id, actif, admin, matricule]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
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
            'INSERT INTO ticket_satisfaction (ticket_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) ON CONFLICT (ticket_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = CURRENT_TIMESTAMP RETURNING *',
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
        const result = await pool.query(
            'SELECT i.*, t.titre as ticket_titre, s.nom_site as site_nom, dc.titre as demande_titre FROM intervention i JOIN ticket t ON i.ticket_id = t.id LEFT JOIN site s ON i.site_id = s.id LEFT JOIN demande_client dc ON i.demande_id = dc.id ORDER BY i.id ASC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching interventions:', err);
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

app.post('/api/interventions', authenticateToken, authorizeAdmin, async (req, res) => {
    const { titre, description, date_debut, date_fin, ticket_id, site_id, demande_id, status } = req.body; // demande_id added
    if (!description || !date_debut || !ticket_id) {
        return res.status(400).json({ error: 'Description, date de début et ticket ID sont requis' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO intervention (titre, description, date_debut, date_fin, ticket_id, site_id, demande_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', // demande_id added, $7 becomes $8
            [titre || null, description, date_debut, date_fin, ticket_id, site_id || null, demande_id || null, status || 'En_attente'] // demande_id added
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating intervention:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/interventions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    const { description, date_debut, date_fin = null, ticket_id, site_id, demande_id, status } = req.body; // demande_id added
    try {
        const result = await pool.query(
            'UPDATE intervention SET description = $1, date_debut = $2, date_fin = $3, ticket_id = $4, site_id = $5, demande_id = $6, status = COALESCE($7::statut_intervention, status) WHERE id = $8 RETURNING *', // demande_id added, parameter indices shifted
            [description, date_debut, date_fin, ticket_id, site_id || null, demande_id || null, status, id] // demande_id added
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
});

// Create a Rendu for an Intervention
app.post('/api/interventions/:id/rendus', authenticateToken, authorizeAdmin, renduUpload.array('image_files[]'), async (req, res) => {
    const { id: interventionId } = req.params;
    const { valeur, resume, image_commentaires, image_notes } = req.body;
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
                const commentaire = (image_commentaires && image_commentaires[i]) ? image_commentaires[i] : null;
                const note = (image_notes && image_notes[i]) ? image_notes[i] : null;
                const fullComment = [commentaire, note].filter(Boolean).join('\\n\\n');

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
            'SELECT * FROM rendu_intervention WHERE intervention_id = $1 ORDER BY id DESC',
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
        const images = imagesResult.rows;
        
        // Fetch associated documents (if any are linked via cible_type/cible_id)
        const documentsResult = await pool.query(
            "SELECT * FROM documents_repertoire WHERE cible_type = 'RenduIntervention' AND cible_id = $1 ORDER BY id DESC",
            [id]
        );
        const documents = documentsResult.rows;
        
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
  try { const r = await pool.query('DELETE FROM ticket_agent WHERE ticket_id=$1 AND agent_matricule=$2 RETURNING id', [req.params.id, req.params.matricule]); if (!r.rows[0]) return res.status(404).json({ error: 'Not found' }); res.json({ ok: true }); }
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
        
        const params = [userId];
        const conditions = [`(m.sender_id = $1 OR m.receiver_id = $1)`];

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
