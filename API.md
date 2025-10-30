# API Reference (Core)

This file documents the primary endpoints relevant to Admin and Client workflows. All JSON bodies and responses use `application/json`.

Auth
- POST `/api/login`
  - Body: `{ email, password }`
  - Response: `{ message, token, session: true }`
- GET `/api/me`
  - Returns current user (from session; falls back to JWT Authorization header)

Admin: Clients
- POST `/api/clients/register`
  - Requires: Admin
  - Body: `{ email, password, nom_client, representant_nom?, representant_tel?, adresse_id?, commentaire? }`
  - Creates a user with `ROLE_CLIENT` and a linked `client` record

Client: Sites
- GET `/api/client/sites`
  - Requires: logged-in client (JWT/Session)
  - Returns sites owned by the current client
- POST `/api/client/sites`
  - Body: `{ nom_site, adresse_id?, commentaire? }`
  - Creates a site for the current client

Client: Demandes (intervention requests)
- GET `/api/demandes_client/mine`
  - Lists demandes for the current client
- POST `/api/demandes_client`
  - Body: `{ site_id?, description }`
  - Creates a demande; validates ownership when `site_id` provided

Admin: Demandes Workflow
- GET `/api/demandes_client`
  - Lists all demandes (with client/site info)
- PUT `/api/demandes_client/:id/status`
  - Body: `{ status }` where status in `En_attente | En_cours | Traitee | Rejetee`
- POST `/api/demandes_client/:id/convert-to-ticket`
  - Converts a demande to a Ticket with `etat = 'Pas_commence'`
  - If a DOE exists for the demande's site, tries to link `doe_id/affaire_id`

Tickets/Sites/Other
- Additional CRUD and relation endpoints exist in `server.js` (sites, tickets, interventions, achats, etc.). See file for details.

Errors
- JSON error format: `{ error: string }` (in some areas; normalization in progress)

Auth Notes
- Provide `Authorization: Bearer <JWT>` when calling APIs from the front
- CSRF is simplified for JSON + Bearer; `/api/csrf-token` exists and may be used by forms

