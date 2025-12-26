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

*   **Refonte de la Gestion Matériel**:
    *   **Séparation des concepts**: La gestion du matériel a été divisée en deux parties distinctes : un catalogue maître (`materiel_catalogue`) et des commandes spécifiques (`materiel`).
    *   **Nouvelle Table `materiel_catalogue`**: Une nouvelle table a été créée pour stocker les informations de base et permanentes des articles (référence, désignation, fabricant, etc.), incluant un nouveau champ `actif` pour gérer la disponibilité des articles.
    *   **Nouvelle Page "Catalogue Matériel"**: La page `public/catalogue-materiel.html` a été créée pour gérer ce catalogue maître. Elle permet de créer, modifier (y compris le statut "actif"), et supprimer des articles du catalogue. Chaque article dispose d'un bouton pour initier une commande.
    *   **Refonte de la "Gestion des Commandes"**: L'ancienne page a été renommée `public/gestion-commande.html` et gère désormais les instances de commande créées à partir du catalogue. L'interface a été adaptée pour se concentrer sur le suivi des statuts de commande.
    *   **Nouvelles Routes API**: De nouvelles routes d'API (`/api/catalogue`) ont été ajoutées pour supporter les opérations CRUD sur le nouveau catalogue. La route `POST /api/materiels` a été modifiée pour créer une commande en copiant les données d'un article du catalogue.
    *   **Gestion des Pièces Jointes**: La fonctionnalité de documentation a été intégrée aux deux modules. Il est désormais possible d'attacher des documents (fiches techniques, etc.) à un article du catalogue, et d'autres documents (bons de livraison, etc.) à une commande spécifique, via le système de gestion de documents centralisé.

*   **Implémentation de la fonctionnalité Calendrier**:
    *   Création de `public/calendrier.html` (page principale).
    *   Création de `public/js/calendrier.js` (logique client, intégration FullCalendar, filtrage par agent, intégration modale).
    *   Ajout de l'endpoint `GET /api/interventions/calendar` à `server.js` (backend pour les événements du calendrier).
    *   Intégration de `intervention-view.html` dans `calendrier.html` via des modales (conformément à l'architecture).
    *   Mise à jour de `public/nav.html` pour ajouter le lien "Calendrier".

*   **Refactorisation `agent_matricule` vers `ticket_agent_id` sur `intervention`**:
    *   **Base de données**: Modification de la table `intervention` (`database_correction/init_fixed.sql` et BDD Heroku) pour remplacer `agent_matricule` par `ticket_agent_id` (référence à `ticket_agent`).
    *   **Backend (`server.js`)**: Mise à jour des endpoints `POST` et `PUT` pour `/api/interventions` pour utiliser `ticket_agent_id`.
    *   **Backend (`server.js`)**: Mise à jour de `GET /api/interventions/:id/relations` pour récupérer et retourner les détails de l'agent assigné via `ticket_agent_id`.
    *   **Frontend (`intervention-view.html`)**: Modification pour afficher l'agent assigné (`assigned_agent`) récupéré via l'endpoint de relations.

*   **Implémentation de la fonctionnalité "Association"**:
    *   **Schema BDD**:
        *   Création de la table `association` (`titre`, `email_comptabilite`, `adresse_id`).
        *   Création des tables de jonction : `association_responsable`, `association_agent`, `association_site`.
        *   Création de la table `devis` (`titre`, `description`, `montant`, `status`, `association_id`) avec l'ENUM `devis_status`.
        *   Ajout de la clé étrangère `association_id` à la table `facture`.
        *   Application de ces modifications de schema à `database_correction/init_fixed.sql` et à la BDD Heroku.
    *   **API Backend (`server.js`)**:
        *   Implémentation des endpoints CRUD complets pour `/api/associations`.
        *   Implémentation des endpoints CRUD complets pour `/api/devis`.
        *   Implémentation des endpoints CRUD pour les relations d'association : `/api/associations/:id/responsables`, `/api/associations/:id/agents`, `/api/associations/:id/sites`.
        *   Mise à jour des endpoints `POST` et `PUT` pour `/api/factures` pour inclure `association_id`.
        *   Création de l'endpoint `GET /api/associations/:id/relations` (relations complètes pour une association).
    *   **Pages Frontend**:
        *   Création de `public/associations.html` (page de liste avec filtrage, modales pour CRUD).
        *   Création de `public/association-new.html` (formulaire de création, incluant la création d'adresse inline).
        *   Création de `public/association-edit.html` (formulaire d'édition pour les données de base, gestion des listes de responsables/agents).
        *   Création de `public/association-view.html` (page de détails avec liens vers les entités associées).
        *   Mise à jour de `public/nav.html` pour ajouter le lien "Associations".

*   **Script de Seeding Complet (`scripts/seed_comprehensive.js`)**:
    *   Création d'un script pour peupler la base de données avec des données de test exhaustives (clients, sites, associations, contrats, demandes, tickets, interventions) sur une période de 4 mois, localisées à Marseille, et représentant divers types de contrats.
    *   Implémentation d'une stratégie d'idempotence "SELECT avant INSERT" pour la robustesse.
    *   Correction de divers problèmes de syntaxe SQL et JavaScript.
    *   Gestion des défis de déploiement vers Heroku (dus à la non-inclusion de fichiers).
