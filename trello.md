# Project Handover Document: projet_var_v4

This document outlines the development process and current state of the `projet_var_v4` project, serving as a guide for anyone taking over its development.

## 1. Project Overview
`projet_var_v4` is a web application primarily built with a Node.js/Express.js backend serving static HTML files from its `public` directory. The frontend is developed using HTML, CSS, and client-side JavaScript, leveraging Bootstrap 5.3.3, Bootstrap Icons, and custom CSS (`custom.css`) for styling. PostgreSQL is used as the database, with schema initialization and data seeding handled by SQL scripts.

## 2. Development Process & Key Implementations

### 2.1. Initial Setup & Project Understanding
- **Project Structure**: Identified `projet_var_v4` as the main working directory, containing `package.json` (Node.js/Express.js dependencies), `server.js` (backend entry point), `public/` (static frontend files), and `db/` (SQL schema and seed files).
- **Frontend Framework**: Established that the frontend uses Bootstrap for UI components, despite some initial Tailwind CSS classes in `login.html` (which were later converted for consistency).
- **Backend & Database**: Confirmed Node.js/Express.js backend with PostgreSQL (`pg` dependency) and the use of `scripts/seed.js` for database management.

### 2.2. Frontend UI Development (HTML/CSS/Client-side JS)
All frontend pages adhere to a consistent structure:
- **Header**: Includes the `logo_logicielle.png` (expected in `public/`), a link to the dashboard, and a Bootstrap offcanvas menu button.
- **Offcanvas Menu**: Provides navigation links to various sections (Dashboard, Agents, Sites, Interventions, Maintenances, Rendez-vous, Achats, Factures).
- **Main Content Area**: Contains breadcrumbs, page titles, and specific content for each view (lists, forms, detail displays).
- **Styling**: Primarily uses Bootstrap 5.3.3 classes and custom styles from `custom.css`.
- **Client-side JavaScript**: Used extensively for:
    - Populating tables and forms with **client-side seeded data** (simulating API responses).
    - Implementing search and filter functionalities for list pages.
    - Pre-filling form fields on edit/view pages based on URL parameters.
    - Dynamic UI elements (e.g., adding/removing file upload fields).
    - **Role-based UI control**: Hiding/disabling admin-specific actions (edit, delete, create buttons) for non-admin users, based on a `userRole` stored in `localStorage`.

#### Pages Created/Modified:
- **`dashboard.html`**: Main dashboard with metrics, chart (client-side), and urgent maintenances display. Chart.js conflict resolved by isolating its initialization.
- **Agent Management**: 
    - `agents.html` (list with filters, role-based actions)
    - `agent-new.html` (create form)
    - `agent-view.html` (details, role-based edit button)
    - `agent-edit.html` (edit form, role-based disable/hide)
    - `agent-passport-new.html` (create passport with dynamic file uploads)
    - `agent-passport-view.html` (view passport documents, role-based actions)
    - `agent-formation-view.html` (view formations, role-based actions)
    - `agent-formation-edit.html` (edit formation, role-based disable/hide)
- **Intervention Management**: 
    - `interventions.html` (list with filters, role-based actions)
    - `intervention-new.html` (create form with dynamic file uploads)
    - `intervention-view.html` (details, associated rendus, role-based actions)
    - `intervention-edit.html` (edit form, role-based disable/hide)
- **Rendu d'Intervention**: 
    - `rendu-intervention-new.html` (create form with dynamic image uploads)
    - `rendu-intervention-view.html` (details, associated images, role-based actions)
    - `rendu-intervention-edit.html` (edit form with dynamic image management, role-based disable/hide)
- **Site Management**: 
    - `sites.html` (list with filters, status, ticket status, responsible, role-based actions)
    - `site-new.html` (create form)
    - `site-view.html` (details, role-based edit button)
    - `site-edit.html` (edit form, role-based disable/hide)
- **Maintenance Management**: 
    - `maintenances.html` (list with filters, role-based actions)
    - `maintenance-new.html` (create form with DOE selection and file uploads)
    - `maintenance-view.html` (details, associated interventions, DOE link, role-based actions)
    - `maintenance-edit.html` (edit form, DOE selection, role-based disable/hide)
- **DOE Management**: 
    - `doe-view.html` (details, associated documents/images, role-based actions)
    - `doe-edit.html` (edit form, document/image management, role-based disable/hide)
- **Login Page**: `login.html` was improved for consistency and includes simulated role-based login.

### 2.3. Backend & Database Interaction (via `seed.js`)
- **`db/init.sql`**: Updated to include all necessary table and ENUM definitions (e.g., `site.ticket`, `site.responsable_matricule`, `intervention.status`, `rendu_intervention`, `rendu_intervention_image`, `documents_repertoire.commentaire`). Includes idempotent `ALTER TABLE` statements for schema evolution.
- **`db/seed.sql`**: Updated with comprehensive sample data for all entities, including `users` (admin/user), `agents` linked to users, and data for new fields/tables. SQL syntax errors (unescaped single quotes, typos) were identified and corrected.
- **`seed.js`**: This Node.js script executes `db/init.sql` (schema creation/update) and `db/seed.sql` (data population) sequentially.

## 3. Git Workflow
- All changes were committed to the `deploy-render-nav-ui` branch.
- A new branch `deploy_render` was created from `deploy-render-nav-ui` and pushed to remote.
- A new branch `deploy-render-v2` was created from `deploy_render` and pushed to remote.

## 4. Current State & Next Steps
- **Frontend**: The UI is feature-rich and demonstrates the intended functionalities. All data is currently client-side seeded.
- **Backend**: The Node.js/Express.js backend (`server.js`) is present and configured to serve static files. The database schema and initial data can be set up using `npm run seed`.
- **Key Missing Backend Functionality**: Actual API endpoints for CRUD operations (saving form data, fetching real data), user authentication/authorization (beyond simulation), token generation/validation, and file upload handling need to be implemented in `server.js`.
- **To Test**: 
    1. Ensure PostgreSQL is running and configured in `.env`.
    2. Navigate to `projet_var_v4` directory in terminal.
    3. Run `npm run seed` to initialize/reset the database with sample data.
    4. Run `npm start` to start the Node.js server.
    5. Open browser to `http://localhost:3000/login.html`.
    6. Use test credentials:
        - **Admin**: `maboujunior777@gmail.com` / `admin`
        - **User**: `takotuemabou@outlook.com` / `password`

## 5. Troubleshooting Notes
- **Chart.js Conflict**: Resolved by removing `script.js` inclusion from `dashboard.html` and handling Chart.js initialization solely within `dashboard.html`'s inline script.
- **SQL Syntax Errors**: Corrected unescaped single quotes and typos in SQL seed files.
- **Network Error for Placeholders**: `net::ERR_NAME_NOT_RESOLVED` for `via.placeholder.com` is an external network issue, not a code error.
