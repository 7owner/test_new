require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(express.static('public')); // Serve static files from 'public' directory

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
    try {
        const client = await pool.connect();
        const schemaSql = fs.readFileSync(path.join(__dirname, 'db', 'init.sql')).toString();
        await client.query(schemaSql);
        console.log('Database schema initialized successfully.');
        client.release();
    } catch (err) {
        console.error('Error initializing database schema:', err);
        // process.exit(-1); // Exit if schema creation fails critically
    }
}

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // if there isn't any token

    jwt.verify(token, 'your_jwt_secret', (err, user) => {
        if (err) return res.sendStatus(403); // if the token is no longer valid
        req.user = user;
        next(); // proceed to the next middleware or route handler
    });
};

// Serve login and register pages
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// API Route for user registration
app.post('/api/register', async (req, res) => {
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

        const token = jwt.sign({ id: user.id, email: user.email, roles: user.roles }, 'your_jwt_secret', { expiresIn: '1h' });

        res.json({ message: 'Login successful', token });
    } catch (err) {
        console.error('Error logging in:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Dashboard API Route
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const activeMaintenances = (await pool.query("SELECT COUNT(*) FROM maintenance WHERE etat = 'En_cours'")).rows[0].count;
        const ongoingInterventions = (await pool.query('SELECT COUNT(*) FROM intervention')).rows[0].count;
        const activeAgents = (await pool.query("SELECT COUNT(*) FROM agent WHERE actif = true")).rows[0].count;
        const sitesUnderContract = (await pool.query('SELECT COUNT(*) FROM site')).rows[0].count;
        const urgentMaintenances = (await pool.query("SELECT * FROM maintenance WHERE etat = 'Bloque'")).rows;

        const monthlyMaintenanceData = (await pool.query("SELECT TO_CHAR(date_debut, 'YYYY-MM') as month, COUNT(id) as count FROM maintenance GROUP BY month ORDER BY month ASC")).rows;

        const chartLabels = monthlyMaintenanceData.map(d => d.month);
        const chartData = monthlyMaintenanceData.map(d => d.count);

        const chart = {
            labels: chartLabels,
            datasets: [{
                label: 'Nombre de maintenances',
                data: chartData,
                backgroundColor: 'rgba(108, 99, 255, 0.6)',
                borderColor: 'rgba(108, 99, 255, 1)',
                borderWidth: 1
            }]
        };

        res.json({
            activeMaintenances,
            ongoingInterventions,
            activeAgents,
            sitesUnderContract,
            urgentMaintenances,
            chartData: chart
        });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
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

app.post('/api/agences', authenticateToken, async (req, res) => {
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

app.put('/api/agences/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/agences/:id', authenticateToken, async (req, res) => {
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

app.post('/api/agents', authenticateToken, async (req, res) => {
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

app.put('/api/agents/:matricule', authenticateToken, async (req, res) => {
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

app.delete('/api/agents/:matricule', authenticateToken, async (req, res) => {
    const { matricule } = req.params;
    try {
        await pool.query('DELETE FROM agent WHERE matricule = $1', [matricule]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting agent with matricule ${matricule}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
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

app.post('/api/adresses', authenticateToken, async (req, res) => {
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

app.delete('/api/adresses/:id', authenticateToken, async (req, res) => {
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

// API Routes for Maintenances (CRUD)
app.get('/api/maintenances', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM maintenance ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching maintenances:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/maintenances', authenticateToken, async (req, res) => {
    const { titre, description } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO maintenance (titre, description) VALUES ($1, $2) RETURNING *',
            [titre, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating maintenance:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/maintenances/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { titre, description } = req.body;
    try {
        const result = await pool.query(
            'UPDATE maintenance SET titre = $1, description = $2 WHERE id = $3 RETURNING *',
            [titre, description, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Maintenance not found' });
        }
    } catch (err) {
        console.error(`Error updating maintenance with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/maintenances/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM maintenance WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting maintenance with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Interventions (CRUD)
app.get('/api/interventions', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT intervention.*, maintenance.titre as maintenance_titre FROM intervention JOIN maintenance ON intervention.maintenance_id = maintenance.id ORDER BY intervention.id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching interventions:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/interventions', authenticateToken, async (req, res) => {
    const { description, date_debut, maintenance_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO intervention (description, date_debut, maintenance_id) VALUES ($1, $2, $3) RETURNING *',
            [description, date_debut, maintenance_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating intervention:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/interventions/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { description, date_debut, maintenance_id } = req.body;
    try {
        const result = await pool.query(
            'UPDATE intervention SET description = $1, date_debut = $2, maintenance_id = $3 WHERE id = $4 RETURNING *',
            [description, date_debut, maintenance_id, id]
        );
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Intervention not found' });
        }
    } catch (err) {
        console.error(`Error updating intervention with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/interventions/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM intervention WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(`Error deleting intervention with id ${id}:`, err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Routes for Rendezvous (CRUD)
app.get('/api/rendezvous', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT rendezvous.*, intervention.description as intervention_description, site.nom_site as site_nom FROM rendezvous JOIN intervention ON rendezvous.intervention_id = intervention.id JOIN site ON rendezvous.site_id = site.id ORDER BY rendezvous.date_rdv ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching rendezvous:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/rendezvous', authenticateToken, async (req, res) => {
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

app.put('/api/rendezvous/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/rendezvous/:id', authenticateToken, async (req, res) => {
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

app.post('/api/passeports', authenticateToken, async (req, res) => {
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

app.put('/api/passeports/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/passeports/:id', authenticateToken, async (req, res) => {
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

app.post('/api/formations', authenticateToken, async (req, res) => {
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

app.put('/api/formations/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/formations/:id', authenticateToken, async (req, res) => {
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

// Start the server
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Serving static files from ${__dirname}/public`);
    });
});
