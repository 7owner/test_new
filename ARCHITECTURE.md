# Architecture Overview

This project is an Express (Node.js) monolith with a static front-end served from the `public/` folder and a PostgreSQL database. It uses both session cookies (server-side) and JWT (client-side convenience) concurrently.

## Backend

- Entry: `server.js`
- Framework: Express 5
- DB: PostgreSQL via `pg` Pool
- Session store: `express-session` + `connect-pg-simple`
- Security:
  - CORS enabled
  - Static assets served with proper charset and cache headers
  - Simplified CSRF (JSON + Bearer bypass); `/api/csrf-token` available
- Initialization:
  - `initializeDatabase()` loads schema and seed from `database_correction` directory
  - Idempotent-ish SQL parsing (split by `;`) – OK for current schema

### Domain Areas (in server.js)

- Auth & Session: `/api/login`, `/api/logout`, `/api/me`, `/api/register`
- Users & Agents: coherence helpers, example seeds
- Clients: CRUD + admin creation (`/api/clients/register`) that provisions `ROLE_CLIENT` users
- Sites: CRUD + relations; client-owned endpoints `/api/client/sites`
- Demandes (Client Requests): client endpoints + admin workflow
  - Client: `/api/demandes_client/mine` (GET), `/api/demandes_client` (POST)
  - Admin: `/api/demandes_client` (GET), `/api/demandes_client/:id/status` (PUT), convert to ticket (POST)
- Tickets, Interventions, Rendezvous, Achats, Factures, Documents, Materiel: endpoints grouped in same file

### Auth Model

- JWT issued on login; front reads roles/email from JWT for UX (redirects, menu injection)
- Session cookie also created; `/api/me` prefers session; fallbacks to JWT Authorization header
- Roles used: `ROLE_ADMIN`, `ROLE_USER`, `ROLE_CLIENT`

## Frontend

- Static HTML pages in `public/`
- Per-page scripts under `public/js/`
- Shared script: `public/nav.js`
  - Performs basic session/JWT checks
  - Injects client link when `ROLE_CLIENT`
- Styling: PostCSS/Tailwind pipeline (`npm run build-css`) producing `public/style.css`

### Key Pages

- Admin Dashboard: `public/dashboard.html` (offcanvas menu)
  - Includes link to `demandes-client-admin.html`
- Client Dashboard: `public/client-dashboard.html`
  - Manage own sites
  - Create intervention requests (demandes)
  - View demandes history
- Admin Demandes: `public/demandes-client-admin.html`
  - List demandes
  - Change status
  - Convert to ticket

## Data Layer

- Schema: `database_correction/init_fixed.sql`
  - Core entities: users, client, site, affaire, doe, ticket, intervention, etc.
  - Demandes: `demande_client` (id, client_id, site_id, description, status, timestamps)
- Seed: `database_correction/seed_fixed.sql`
  - Includes an example client user (`ROLE_CLIENT`), a client, a site, and demandes

## Running Locally

- Install deps: `npm install`
- Start dev: `npm run dev` (or `npm start`)
- Build CSS: `npm run build-css`

## Notes & Caveats

- `server.js` is large; plan is to progressively extract routes/middlewares by domain
- Error format partially normalized; aim for `{ error, details?, code? }`
- Consider formal CSRF strategy for JSON APIs

