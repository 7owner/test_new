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

## Mises à jour et corrections effectuées par l'agent (liées au client)

### Mises à jour du schéma de base de données (`database_correction/init_fixed.sql`)
- Ajout de la définition de la table `demande_client`.

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
