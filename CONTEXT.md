# Project Context: projet_var_v4

This project (`projet_var_v4`) is structured as a Node.js/Express.js application primarily serving static HTML files from its `public` directory. Frontend styling is handled using Bootstrap 5.3.3, Bootstrap Icons, and custom CSS (`custom.css`). Tailwind CSS is also indicated in `package.json` but its direct usage in the HTML files I've modified is minimal, relying more on Bootstrap classes.

## Key Directories & Technologies:
- **`public/`**: Contains all static HTML pages, CSS, and client-side JavaScript.
- **`server.js`**: Main entry point for the Node.js/Express.js backend.
- **`scripts/`**: Contains seeding scripts (`seed.js`, `seed_year.js`), indicating a database interaction layer.
- **`package.json`**: Lists Node.js dependencies (Express, TailwindCSS, PostCSS, etc.).
- **`composer.json`**: Indicates a Symfony project, but the current working directory (`projet_var_v4`) is being treated as a Node.js/Express.js static file server based on the `package.json` and lack of Symfony-specific directories like `templates/` within `projet_var_v4`.

## Work Completed:

### 1. Agent Management (`agents.html`, `agent-new.html`, `agent-view.html`, `agent-edit.html`)
- **`agents.html`**: Lists agents in a table with client-side seeded data. Includes links to create, view, and edit agents.
- **`agent-new.html`**: Form for creating a new agent. Includes fields for matricule, nom, prénom, email, téléphone, titre, agence (dropdown), fonction (dropdown), actif (checkbox), administrateur (checkbox).
- **`agent-view.html`**: Displays details of a single agent based on URL parameter. Includes general info and links to view passport and formations.
- **`agent-edit.html`**: Form for editing agent details, pre-filled with data based on URL parameter.
- **Passport & Formations**: Separate pages for passport creation/viewing (`agent-passport-new.html`, `agent-passport-view.html`) and formation viewing/editing (`agent-formation-view.html`, `agent-formation-edit.html`). These include dynamic file upload sections with metadata (type, dates, comments).

### 2. Intervention Management (`interventions.html`, `intervention-new.html`, `intervention-view.html`, `intervention-edit.html`)
- **`interventions.html`**: Lists interventions in a table with client-side seeded data. Includes links to create, view, and edit interventions.
- **`intervention-new.html`**: Form for creating a new intervention. Includes fields for maintenance_id, description, date_debut, date_fin, intervention_precedente_id. Also includes a dynamic section for uploading multiple associated files with comments.
- **`intervention-view.html`**: Displays details of a single intervention based on URL parameter.
- **`intervention-edit.html`**: Form for editing intervention details, pre-filled with data based on URL parameter.

### 3. Site Management (`sites.html`, `site-new.html`, `site-view.html`, `site-edit.html`)
- **`sites.html`**: Lists sites in a table with client-side seeded data. Includes search and status filters. Each site has a `statut` (en attente, prise en charge, en cour, fini, sous devis), a `ticket` status (boolean), and a `responsable_matricule`.
- **`site-new.html`**: Form for creating a new site. Includes fields for nom_site, adresse_id, commentaire, and statut (dropdown).
- **`site-view.html`**: Displays details of a single site, including its `ticket` status and responsible agent.
- **`site-edit.html`**: Form for editing site details, pre-filled with data. Includes a checkbox for `ticket` status and a dropdown for `responsable_matricule`.

## Important Notes & Limitations:
- **Frontend Only**: All modifications are to the frontend (HTML, CSS, client-side JavaScript for data seeding and form pre-filling). No backend logic (e.g., saving form data to a database, handling actual file uploads, dynamic data fetching from a real API) has been implemented in the Node.js/Express.js backend.
- **Seed Data**: Data displayed in tables and forms is client-side seeded for demonstration purposes. Real data would come from a backend API.
- **File Uploads**: The UI for file uploads is present, but the actual file handling and storage in `documents_repertoire` would require backend implementation.
- **`logo_logicielle.png`**: This image is used in the project for branding.
- **Styling**: Uses Bootstrap 5.3.3, Bootstrap Icons, and `custom.css`.

To continue development, focus should be on implementing the Node.js/Express.js backend API endpoints to handle CRUD operations for Agents, Interventions, Sites, Passports, Formations, and Document uploads, connecting to a database (e.g., PostgreSQL as suggested by `pg` dependency in `package.json`).