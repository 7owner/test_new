# Contexte du Projet : projet_var_v4 (Mises à jour récentes)

Ce document résume les correctifs et évolutions réalisés durant les dernières sessions.

## Améliorations majeures et nouvelles fonctionnalités

### 1. Refonte complète de la gestion des représentants de client
Le modèle de données pour les représentants a été entièrement revu pour les lier aux utilisateurs du système (`users`) et permettre une gestion plus flexible.

*   **Schema BDD**:
    *   Suppression de la table `representant`.
    *   Création de la table `client_representant` (table de jointure) liant `client` et `users`, incluant des champs spécifiques au rôle (`nom`, `email`, `tel`, `fonction`).
*   **API (`server.js`)**:
    *   Suppression des anciens endpoints CRUD pour `representant`.
    *   Nouveaux endpoints pour `client_representant`:
        *   `GET /api/clients/:id/representants`: Liste les représentants (utilisateurs) d'un client.
        *   `POST /api/clients/:id/representants`: Lie un utilisateur existant ou nouvellement créé à un client en tant que représentant.
        *   `PUT /api/client_representant/:id`: Met à jour les détails du lien (ex: `fonction`, `nom`, `email`, `tel`) entre un utilisateur et un client.
        *   `DELETE /api/client_representant/:id`: Supprime le lien entre un utilisateur et un client.
    *   Nouveaux endpoints génériques de gestion des utilisateurs (pour admins):
        *   `GET /api/users/search?email=...`: Recherche des utilisateurs par email.
        *   `POST /api/users`: Crée un nouvel utilisateur (avec rôle spécifié, ex: `ROLE_CLIENT`).
*   **Frontend**:
    *   **`clients.html`**: Amélioration de l'UI et ajout d'une barre de recherche/filtre.
    *   **`client-new.html`**: Simplifié pour la seule création du client, puis redirection vers `client-edit.html` pour la gestion des représentants.
    *   **`client-view.html`**: Affiche la liste des représentants liés, avec leurs détails complets.
    *   **`client-edit.html`**: Entièrement refactorisé pour une gestion complète des représentants via une modale (recherche, création, modification, suppression).

### 2. Gestion des Contrats
Introduction d'une nouvelle entité `contrat` avec une association multiple aux sites et gestion de fichiers.

*   **Schema BDD**:
    *   Ajout de `Contrat` à l'ENUM `doc_cible_type`.
    *   Création de la table `contrat` (`titre`, `date_debut`, `date_fin`, `created_at`).
    *   Création de la table `contrat_site_association` (table de jointure) liant `contrat` et `site` (relation N-N).
*   **API (`server.js`)**:
    *   Endpoints CRUD complets pour `contrat` (`GET`, `POST`, `PUT`, `DELETE /api/contrats`).
    *   Endpoints pour `contrat_site_association`:
        *   `GET /api/contrats/:id/sites`
        *   `POST /api/contrats/:id/sites`
        *   `DELETE /api/contrat_site_association/:id`
    *   Mise à jour de `GET /api/sites/:id/relations` pour inclure les contrats associés.

### 3. Fiabilisation du stockage des pièces jointes
Transition du stockage des pièces jointes des messages du système de fichiers éphémère vers la base de données (blob).

*   **Schema BDD**:
    *   `messagerie_attachment`: Remplacement de `file_path VARCHAR` par `file_blob BYTEA`.
*   **API (`server.js`)**:
    *   `multer` configuré pour `memoryStorage`.
    *   Endpoint `POST /api/conversations/:conversation_id/messages` mis à jour pour sauvegarder les blobs.
    *   Nouvel endpoint `GET /api/attachments/:id/view` pour servir les fichiers directement depuis la BDD.
    *   Modification des requêtes d'attachements pour ne plus renvoyer `file_path`.
*   **Frontend**: Mise à jour de toutes les pages concernées pour utiliser le nouvel endpoint `GET /api/attachments/:id/view` pour l'affichage/téléchargement des PJ.
*   **Placeholders**: Remplacement des URLs `via.placeholder.com` par des SVG Data URIs auto-contenues pour éviter les erreurs `ERR_NAME_NOT_RESOLVED`.

### 4. Robustesse des Entités principales (Site, Intervention, Ticket)

*   **Schema BDD**:
    *   `intervention`: Ajout des colonnes `site_id` et `demande_id`.
    *   `ticket`: Ajout de la colonne `demande_id`.
    *   `site`: La colonne `statut` utilise désormais un ENUM `site_status` ('Actif', 'Inactif').
    *   `ticket_satisfaction`: Nouvelle table pour les retours client sur les tickets.
*   **API (`server.js`)**:
    *   Endpoints CRUD pour `sites`, `interventions`, `tickets` mis à jour pour gérer ces nouvelles colonnes.
    *   Endpoint `GET /api/interventions/:id` et `GET /api/tickets/:id` ajoutés.
    *   Endpoint `GET /api/clients/:id/relations` mis à jour pour inclure les représentants.
    *   Nouvel endpoint `POST /api/tickets/:id/satisfaction` pour soumettre un avis client.
*   **Frontend**:
    *   `site-edit.html`: Mise à jour pour gérer le nouveau `statut` (dropdown) et la sélection de `client_id`. Correction de l'erreur `TypeError` due à un commentaire HTML.
    *   `client-new.html`: Simplifié pour la création de client, redirigeant vers l'édition pour les représentants.
    *   `client-view.html`: Affiche la liste des représentants.

### 5. Résolution d'erreurs diverses

*   Correction des erreurs `404 Not Found` pour les endpoints `GET /api/interventions/:id` et `GET /api/tickets/:id`.
*   Correction de l'erreur `403 Forbidden` sur `PATCH /api/rendus/:id` en implémentant une autorisation granulaire (Admin ou client propriétaire).
*   Correction de l'erreur `500 Internal Server Error` (colonne "valeur" manquante) sur `POST /api/interventions/:id/rendus` en ajoutant la colonne `valeur` à la table `rendu_intervention` et en exécutant l'ALTER TABLE sur Heroku.
*   Correction de `409 Conflict` (doublons) sur `POST /api/clients/:id/representants` en affichant l'état des utilisateurs déjà liés.
*   Correction de `TypeError: Cannot set properties of null` dans `site-edit.html` en rendant la case à cocher "Ticket Ouvert" visible.
*   Correction de `TypeError: Cannot set properties of null` dans `client-edit.html` en résolvant l'incohérence entre HTML et JS.
*   Correction d'erreur `invalid input value for enum site_status` lors de la migration du type `statut` de `site`.

Cette mise à jour a significativement enrichi les fonctionnalités et stabilisé l'application.

### 6. Dernières intégrations (sites/clients/tickets/interventions)

* `ticket-view.html` : bloc Site associé enrichi via `/api/sites/{id}/relations` (nom client, statut, adresse, contact, représentants), lien client en modal, bouton "Voir messages" redirige vers `messagerie.html?conversation_id=demande-{id}`. Représentants admin CRUD, bouton visible en admin.
* `intervention-view.html` : ajout d'une carte Site associé (mêmes infos et lien client modal) alimentée par `/api/sites/{id}/relations`.
* `client-demand-view.html` : l'envoi de message inclut désormais `demande_id` dans le FormData pour associer la conversation à la demande.

## Mises à jour effectuées par l'agent (Current Session)

*   **`public/client-demand-view.html`**:
    *   Fixed `400 Bad Request` error for message sending: ensured `sender_id` is always sent with `FormData` by explicitly casting `userId` and `receiver_id` to `String()` and adding robust client-side checks for their presence.

*   **`public/ticket-view.html`**:
    *   Modified "Voir messages" button to open a modal (`#messagesModal`) displaying the demand's conversation.
    *   Logic for displaying messages in the modal: prioritizes `demande_id` conversation, falls back to `ticket_id` conversation.
    *   Ensured the "Voir messages" button is always visible if a `ticketId` is present.
    *   Added `userId` extraction at the top of the `DOMContentLoaded` listener for message styling.

*   **`server.js`**:
    *   Increased JSON payload size limit to `50mb` to resolve `PayloadTooLargeError` on `POST /api/documents`.
    *   Corrected `GET /api/sites` endpoint to return detailed address fields (`ligne1`, `ligne2`, `code_postal`, `ville`, `pays`) from the `adresse` table.
    *   Removed duplicate `GET /api/sites` endpoint definition.
    *   Fixed `invalid input value for enum doc_nature` error for `POST /api/documents` by mapping MIME types (`image/png`, etc.) to valid `doc_nature` ENUM values (`Document`, `Video`, `Audio`, `Autre`) in the application logic.

*   **`public/contrat-view.html`**:
    *   Implemented a modal (`#siteModal`) to view site details (`site-view.html`) when clicking "Voir le site" from the associated sites list.

*   **`public/site-view.html`**:
    *   Added display of associated contract titles next to the site name.
    *   Made contract titles clickable to open `contrat-view.html` in a modal (`#contractModal`).
    *   Ensured contract titles are white in color.

*   **`public/js/sites.js`**:
    *   Made addresses in the site list clickable, opening a Google Maps search in a new tab.
    *   Simplified address parsing logic to directly use fields returned by the corrected `/api/sites` endpoint.
    *   Improved link styling for Google Maps links (using Bootstrap's `link-primary` class).

*   **`public/client-dashboard.html`**:
    *   Fixed `loadHistory` function to use the client-specific endpoint `/api/client/sites/${s.id}/relations` to resolve `403 Forbidden` errors.
    *   Refactored template literal generation in `loadDemands` and `loadHistory` functions for clarity and to avoid syntax errors, by extracting conditional HTML into separate variables.
    *   Added a "Messages / Suivi" button in the demands list for each demand, opening a `messagesModal` with the demand's conversation.
    *   Added `messagesModal` and `messagesFrame` to `client-dashboard.html` for displaying conversations.
    *   Updated `frameMap` and `modalUrlMap` to include the new `messagesModal`.