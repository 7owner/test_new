# Contexte du Projet : projet_var_v4 (Session Actuelle)

Ce document résume les modifications effectuées et l'état actuel du projet, ainsi que les problèmes en suspens pour faciliter la reprise du travail lors d'une prochaine session.

## 1. Modifications Appliquées

### 1.1. Refactoring "Maintenance" vers "Ticket"
*   **Fichiers HTML (`public/`)** : Tous les fichiers liés à "maintenance" ont été renommés en "ticket" (ex: `maintenances.html` -> `tickets.html`, `maintenance-view.html` -> `ticket-view.html`). Le contenu de ces fichiers a été mis à jour pour refléter la nouvelle terminologie.
*   **Fichiers SQL (`db/`)** :
    *   `db/init.sql` : Les types ENUM (`sujet_type`, `doc_cible_type`) ont été mis à jour. Les tables `maintenance` et `rapport_maintenance` ont été renommées en `ticket` et `rapport_ticket` respectivement, avec mise à jour des colonnes (`maintenance_id` -> `ticket_id`) et des contraintes de clés étrangères.
    *   `db/seed.sql` : Les données d'insertion ont été mises à jour pour utiliser la terminologie "ticket".
*   **Backend (`server.js`)** : Toutes les routes API, requêtes SQL et variables liées à "maintenance" ont été renommées en "ticket".

### 1.2. Nettoyage des Titres HTML
*   Les préfixes "LISTE DES " ou "Liste de " ont été supprimés des titres `<h1>` dans les fichiers HTML du répertoire `public/`.

### 1.3. Affichage des Tickets sur la page Site
*   La page `site-view.html` a été modifiée pour afficher la liste des tickets associés à un site.

### 1.4. Traçabilité (Responsables et Temps)
*   **Base de données (`db/init.sql`)** :
    *   La table `ticket_historique_responsable` a été ajoutée pour tracer les changements de responsable.
    *   Les colonnes `date_fin` ont été modifiées pour avoir `DEFAULT NULL` au lieu de `DEFAULT CURRENT_TIMESTAMP NOT NULL` là où c'était pertinent.
*   **Backend (`server.js`)** : La route `PUT /api/tickets/:id` a été modifiée pour enregistrer les changements de responsable dans `ticket_historique_responsable`.
*   **Frontend (`ticket-view.html`)** : Affichage de la durée et des dates de début/fin pour les tickets.

### 1.5. Fonctionnalité de Déconnexion
*   Un lien "Déconnexion" a été ajouté au menu de navigation dans `dashboard.html` avec la logique JavaScript pour effacer le jeton JWT et rediriger vers la page de connexion.

### 1.6. Vérification des Identifiants de Test
*   Les identifiants de test (`maboujunior777@gmail.com` / `admin` et `takotuemabou@outlook.com` / `password`) sont confirmés comme étant présents dans `db/seed.sql` avec des mots de passe hachés.

### 1.7. Contrôle d'Accès Administrateur (Phase 1)
*   Un middleware `authorizeAdmin` a été créé dans `server.js`.
*   Ce middleware a été appliqué à toutes les routes `POST`, `PUT`, `DELETE` pour toutes les entités (users, agents, tickets, interventions, rendezvous, affaires, does, agences, adresses, clients, sites, site_affaire, documents, images, passeports, formations, equipes, agence_membres, agent_equipes, fonctions, agent_fonctions, achats, factures, reglements).

### 1.8. Génération de Jeton pour Agents (Requête 1 - Backend)
*   Une nouvelle route API `POST /api/invite-agent` a été ajoutée dans `server.js`. Elle permet à un administrateur d'inviter un agent par email et de l'affilier à une intervention (en créant un nouveau ticket).

### 1.9. Demande d'Affiliation Utilisateur (Requête 2 - Backend)
*   Une nouvelle route API `POST /api/request-affiliation` a été ajoutée dans `server.js`. Elle permet à un utilisateur authentifié de soumettre une demande d'affiliation à une intervention, créant un ticket en attente.

## 2. Problèmes Actuels et Prochaines Étapes

### 2.1. Résolution des Erreurs de Schéma et de Semence
*   **`database_correction/init_fixed.sql`** :
    *   Ajout de `DROP TABLE IF EXISTS ... CASCADE;` pour toutes les tables au début du script.
    *   Ajout de `CASCADE` à toutes les instructions `DROP TYPE IF EXISTS ...;`.
    *   Ajout de `DROP INDEX IF EXISTS ...;` avant les instructions `CREATE UNIQUE INDEX` pour assurer l'idempotence.
*   **`database_correction/seed_fixed.sql`** :
    *   Suppression de toutes les clauses `WHERE NOT EXISTS` des instructions `INSERT`.
    *   Remplacement de toutes les sous-requêtes par des IDs codés en dur dans les instructions `INSERT` pour le débogage.
    *   Simplification du fichier pour inclure uniquement les insertions `users`, `adresse`, `agence`, `agent` pour isoler le problème.
*   **`scripts/seed.js`** :
    *   Modification pour construire et exécuter directement les instructions SQL sous forme de littéraux de chaîne JavaScript, au lieu de lire et de diviser des fichiers externes.
    *   Correction de l'échappement des barres obliques inverses dans les littéraux de chaîne SQL pour résoudre les erreurs `SyntaxError: Invalid or unexpected token`.

### 2.2. Améliorations de l'Interface Utilisateur (Header)
*   **Action** : Un message de bienvenue ("Bienvenue, [email de l'utilisateur]") a été ajouté entre le logo et le bouton "Menu" dans l'en-tête de la plupart des fichiers HTML du répertoire `public/`. Les pages de redirection ou d'authentification (e.g., `login.html`, `register.html`, `agent-show.html`) ont été exclues de cette modification.

## 3. Tâches en Suspens et Prochaines Étapes

*   **Débuggage de l'Accès Admin aux CRUD** : La raison pour laquelle l'administrateur ne peut pas effectuer les opérations CRUD doit être investiguée et corrigée. Un `console.log(req.user)` a été temporairement ajouté au middleware `authorizeAdmin` pour faciliter le débogage.
*   **Génération de jetons (Requête 1)** : Implémenter l'interface utilisateur pour l'admin afin d'appeler la route `/api/invite-agent`.
*   **Demande d'affiliation (Requête 2)** : Implémenter l'interface utilisateur pour les utilisateurs afin de soumettre une demande d'affiliation via `/api/request-affiliation`.
*   **Styling du Dashboard (Requête 3)** : Modifier `dashboard.html` et `custom.css` pour styliser les cartes "sites", "tickets" et "Agents" en cercles.
*   **Fonctionnalité de Mot de Passe Oublié** : Ajouter une fonctionnalité de mot de passe oublié à la page de connexion.
## 4. Mises � jour r�tro-annot�es (synchronis�es avec sessions suivantes)

- Agents / Users
  - `agents.html` ne s�appuie plus sur des donn�es statiques; les agents sont charg�s via `/api/agents` (emails r�els).
  - Coh�rence agents/users assur�e au d�marrage c�t� serveur (cr�ation users/agents et agences si manquants).
  - `agent-token-new.html` charge l�agent par matricule depuis l�API et envoie une requ�te `POST /api/invite-agent` (email r�el et `intervention_id` depuis l�URL).

- Tickets
  - `POST /api/tickets` caste `etat` en `etat_rapport` (d�faut `Pas_commence`) et initialise `date_debut` si absente.
  - `ticket-new.html` propose �Date de d�but/fin�; `ticket-view.html` affiche date + heure locales.

- Dashboard
  - Carte �Tickets ouverts� = X/Y r�els (API); graphe barres mensuel; donut �Ouverts vs Ferm�s�.
  - Panneau �Tickets ouverts� = 5 plus r�cents, tri�s par date, liens �D�tails�, nom du site via `/api/sites`.

- Sites
  - `site-new.html` permet de cr�er une adresse inline (Adresse/CP/Ville requis si activ�), puis le site; compatible JWT/CSRF.

- Sessions/CSRF
  - `trust proxy` activ�; table `session` pr�-cr��e (index inclus) pour �viter la �transaction annul�e�.
