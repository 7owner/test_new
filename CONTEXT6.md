# Contexte du Projet : projet_var_v4 (Session 6)

Cette session ajoute le flux Client (role ROLE_CLIENT): creation de client avec user lie, dashboard client, gestion de sites clients et demandes d'intervention (demande_client).

## Nouveautes

- Table `demande_client` (schema init): deja ajoutee dans `database_correction/init_fixed.sql`.
- Endpoint admin `POST /api/clients/register`:
  - Cree un user avec role `ROLE_CLIENT` puis cree le `client` associe (representant_email = email). Tente de remplir `client.user_id` si la colonne existe.
- Endpoints client (auth requis):
  - `GET /api/client/sites` et `POST /api/client/sites` pour lister/creer des sites lies au client connecte.
  - `GET /api/demandes_client/mine` et `POST /api/demandes_client` pour lister/creer des demandes d'intervention.
- Redirection login (front): si le JWT contient `ROLE_CLIENT`, redirection vers `/client-dashboard.html`.
- Nouvelle page `public/client-dashboard.html`: UI simple pour
  - lister/creer ses sites,
  - envoyer une demande d'intervention,
  - consulter l'historique des demandes.

## Mises à jour et corrections effectuées par l'agent

### Mises à jour du schéma de base de données (`database_correction/init_fixed.sql`)
- Ajout des définitions de table pour `audit_log` et `ticket_historique_responsable`.
- Correction de la colonne `actor_email` en `agent_matricule` dans la table `ticket_responsable` avec ajout de la contrainte de clé étrangère.
- Ajout de la colonne `duree_heures` à la table `intervention`.
- Ajout des colonnes `date_debut` et `date_fin` à la table `ticket`.
- Ajout de la définition de la table `demande_client`.
- Correction de la colonne `type` dans la table `formation` en la citant (`"type"`) pour éviter les conflits avec les mots-clés réservés.

### Mises à jour des données de base (`database_correction/seed_fixed.sql`)
- Rendu de l'insertion `audit_log` idempotente.
- Suppression des instructions `TRUNCATE` (la réinitialisation de la base de données est gérée par `init_fixed.sql`).
- Suppression des IDs explicites des insertions `agence` (les IDs sont générés automatiquement).
- Ajout de l'agent `AGT003` et de l'utilisateur correspondant pour résoudre les violations de clé étrangère.
- Correction de l'insertion des tickets de Lyon pour inclure le `responsable` (`AGT002`).

### Mises à jour de la logique serveur (`server.js`)
- Suppression des créations de table explicites redondantes (la création du schéma est centralisée dans `init_fixed.sql`).
- Implémentation d'un verrou consultatif au niveau de la base de données pour garantir une initialisation du schéma unique et éviter les deadlocks.
- Amélioration de la logique de création d'agent dans l'endpoint `invite-agent` pour prévenir les erreurs de doublons d'e-mails.
- Modification de la requête `/api/sites/:id/relations` pour utiliser `date_debut` au lieu de `date_rdv` pour le tri des rendez-vous.
- Ajout d'une vérification de l'existence du schéma dans `initializeDatabase` pour empêcher l'écrasement de la base de données lors des redémarrages ultérieurs.

### Mises à jour de l'interface utilisateur (Frontend)
- Création de `public/client-new.html` pour le formulaire d'enregistrement des clients.
- Ajout d'un lien vers `client-new.html` dans le menu latéral de `public/dashboard.html`.
- Création de la structure de base de `public/client-dashboard.html`.

## A tester (manuel)

- En tant qu'admin: `POST /api/clients/register` avec `{ email, password, nom_client }` -> cree user+client.
- Connexion avec le compte client -> redirection vers `/client-dashboard.html`.
- Dashboard client:
  - Creer un site -> visible dans la liste; verif en DB: `site.client_id` = client.
  - Envoyer une demande -> visible dans la liste; en DB: `demande_client(client_id, site_id, description)`.
- Verifier la securite: un client ne peut pas creer une demande sur un site qui ne lui appartient pas.

## Suivi et prochaines etapes

- Ajouter un etat/trajectoire pour `demande_client.status` (ex: En_attente, En_cours, Traitee, Rejetee) et les endpoints admin pour traiter/convertir en ticket.
- Eventuelle colonne `client.user_id` officielle dans le schema si non presente.
- Ameliorer l'UI (toasts, validations, selection de site depuis liste, etc.).

Derniere mise a jour: Session 6