# Contexte du Projet : projet_var_v4 (Sessions 7+)

## Situation actuelle
- Fonctionnalités clients (ROLE_CLIENT) en place : dashboard client, demandes d’intervention, conversion admin → ticket.
- Messagerie contextualisée par demande : les messages sont liés à `conversation_id=demande-<id>` avec destinataire garanti (responsable ou admin par défaut).
- Prise/affectation tickets alignées sur `ticket_responsable` (`agent_matricule`), assignation auto lors de la conversion d’une demande en ticket.
- Pages tickets/sites/interventions migrées vers données API; affichage sites/DOE/affaires/agents/responsables.

## Derniers correctifs
- Téléversement PJ messagerie : stockage dans `public/uploads/attachments`, lien web relatif (`uploads/attachments/<file>`), dossier créé au démarrage.
- `client-demand-view.html` : fetch avec credentials same-origin, fallback responsable admin, liens PJ corrigés.
- `messagerie.html` : filtres de conversation (search) pris en charge côté API, liens PJ corrigés.
- Dashboard : redesign des cartes métriques + fond dégradé; la carte “Demandes client” affiche désormais “en file vs converties” (pending = sans ticket_id, converties = avec ticket_id).
- Demandes client (admin) : bouton “Voir demandes supprimées” + modal qui liste les suppressions (justification, auteur, date) via `GET /api/demandes_client/deleted` (audit_log action DELETE).
- Demandes client (admin) : suppression logique (status=Supprimée + justification), restauration possible via `POST /api/demandes_client/:id/restore`; le listing exclut les supprimées sauf si `include_deleted=true`.

## Branches de travail
- `feat/dashboard` : mergée avec `origin/main` (local). À pousser si besoin.
- `feat/agents` : mergée avec `origin/main` (local). À pousser si besoin.
- `feat/sites` : mergée avec `origin/main` (local). À pousser si besoin.
- Branches locales (non poussées) : `gitup-client`, `gitup-ticket`.
- Stash en attente : `wip-before-feat-dashboard-update` (travaux précédents de la branche `ticket`).

## Points de vigilance / à faire
- Vérifier déploiement Heroku : quelques commits récents (messagerie/PJ, responsables ticket) ne sont pas encore poussés.
- Tester le téléchargement des PJ en prod (chemins `uploads/attachments`).
- Verrouiller l’accès aux endpoints sensibles pour les clients (sites/tickets/relations) si non fait.

## Tests rapides recommandés
- Messagerie demande : envoi de message + PJ, téléchargement du fichier.
- Conversion demande→ticket : responsable principal enregistré, visible dans `ticket-view.html`.
- Prise de ticket admin : insertion dans `ticket_responsable` (`agent_matricule`).
- Filtre messagerie : recherche par email/conversation affiche seulement les résultats pertinents.

## Mises à jour effectuées par l'agent (Recent Changes)

*   **Clients Page (`public/clients.html`)**:
    *   **Modals for Create/View/Edit Clients**: The "Nouveau Client" button, and the "Voir" and "Modifier" buttons for each client, now open modals (`#createClientModal`, `#viewClientModal`, `#editClientModal`) with `iframe`s pointing to the respective `client-new.html`, `client-view.html`, and `client-edit.html` pages.

*   **Tickets Page (`public/tickets.html`)**:
    *   **Modal for Client Requests**: The "Demandes clients" button now opens a modal containing an `iframe` of the `demandes-client-admin.html` page.
    *   **Modals for View/Edit Tickets**: The "Voir" and "Modifier" buttons for each ticket now open modals (`#viewTicketModal`, `#editTicketModal`) with `iframe`s pointing to the respective `ticket-view.html` and `ticket-edit.html` pages.
    *   **Mandatory Justification for Ticket Deletion**: A new modal (`#deleteTicketModal`) is now used to collect a mandatory justification when deleting a ticket. This justification is sent to the API and logged.
    *   **Bug Fix**: Moved all modal HTML to the end of the `<body>` tag to resolve a JavaScript error related to DOM loading.

*   **Ticket View Page (`public/ticket-view.html`)**:
    *   **New Modal for Adding Interventions**: Replaced the "Ajouter une intervention" link with a button that triggers a new modal (`#createInterventionModal`).
    *   **Intervention Form Fields**: The modal includes input fields for `Titre`, `Description`, `Date Début`, `Date Fin`, `Statut`, and `Intervention précédente`. The `ticket_id` is automatically linked.
    *   **"Numéro d'affaire" for Affaires**:
        *   Added an input field for "Numéro de l'affaire" in the "Créer une nouvelle affaire" modal.
        *   Updated the display of the associated Affaire on `ticket-view.html` to show the "numéro d'affaire".

*   **Agents Page (`public/agents.html`)**:
    *   **Modals for Create/View/Edit Agents**: The "Créer un nouvel agent" button, and the "Voir" and "Modifier" buttons for each agent, now open modals (`#createAgentModal`, `#viewAgentModal`, `#editAgentModal`) with `iframe`s pointing to the respective `agent-new.html`, `agent-view.html`, and `agent-edit.html` pages.

*   **Sites Page (`public/sites.html`)**:
    *   **Modals for Create/View/Edit Sites**: The "Créer un nouveau site" button, and the "Voir" and "Modifier" buttons for each site, now open modals (`#createSiteModal`, `#viewSiteModal`, `#editSiteModal`) with `iframe`s pointing to the respective `site-new.html`, `site-view.html`, and `site-edit.html` pages.

*   **Backend Changes (`server.js`)**:
    *   **`POST /api/demandes_client` Endpoint**: Modified to allow admins to create requests on behalf of a client.
    *   **`DELETE /api/demandes_client/:id` Endpoint**: Modified to require a `justification` for deletion, which is logged to the `audit_log` table.
    *   **`DELETE /api/tickets/:id` Endpoint**: Modified to require a `justification` for deletion, which is logged to the `audit_log` table.
    *   **`POST /api/affaires` Endpoint**: Modified to accept and save the new `numero_affaire` field.
    *   **`POST /api/interventions` Endpoint**: Modified to accept and save the new `titre` field.

*   **Database Schema Updates (`database_correction/init_fixed.sql`)**:
    *   **`affaire` table**: Added a `numero_affaire` column (`VARCHAR(255) UNIQUE`).
    *   **`intervention` table**: Added a `titre` column (`VARCHAR(255)`).

*   **Database Migration on Heroku**:
    *   Manually applied `ALTER TABLE` commands via `heroku pg:psql` to add `numero_affaire` to `affaire` and `titre` to `intervention` due to existing schema on the Heroku database.

*   **Messagerie (`public/messagerie.html`)**:
    *   Added filters for conversations by demande client (checkbox + dropdown).
    *   Conversations linked to demandes now display the demande label (ex: `Demande #ID — titre`) instead of the email.
    *   Demand labels are loaded from `/api/demandes_client` (fallback `/api/demandes_client/mine`) to drive the dropdown and titles.
    *   Supports `?conversation=demande-<id>` to auto-open the targeted conversation (used by dashboard notifications).

*   **Backend Fix**:
    *   Implemented `/api/demandes_client/mine` to return the current client’s demandes (excluding `Supprimée`), preventing request timeouts.

*   **Dashboard Notifications (`public/dashboard.html`)**:
    *   Notification “Ouvrir” buttons now close the dropdown and redirect directly to the related conversation in `messagerie.html` via `conversation=demande-<id>`.
