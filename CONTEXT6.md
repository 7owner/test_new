# Contexte du Projet : projet_var_v4 (Session 6)

TL;DR
- RÃ´le client (ROLE_CLIENT) avec espace dÃ©diÃ© et workflow demandes d'intervention.
- Admin peut crÃ©er un client + user (ROLE_CLIENT).
- Client peut gÃ©rer ses sites et demandes; Admin peut traiter les demandes et les convertir en tickets (etat Pas_commence).

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
- Nouvelle page admin `public/demandes-client-admin.html`: liste les demandes avec actions pour changer le status et convertir en ticket.
- Dashboard admin: ajout d'un lien vers `demandes-client-admin.html` dans le menu (public/dashboard.html).
 - Navigation: injection automatique (nav.js) d'un lien "Espace Client" vers `/client-dashboard.html` quand le JWT contient `ROLE_CLIENT`.

## Mises Ã  jour et corrections effectuÃ©es par l'agent (liÃ©es au client)

### Mises Ã  jour du schÃ©ma de base de donnÃ©es (`database_correction/init_fixed.sql`)
- Ajout de la dÃ©finition de la table `demande_client`.

### Mises Ã  jour de l'interface utilisateur (Frontend)
- CrÃ©ation de `public/client-new.html` pour le formulaire d'enregistrement des clients.
- Ajout d'un lien vers `client-new.html` dans le menu latÃ©ral de `public/dashboard.html`.
- CrÃ©ation de la structure de base de `public/client-dashboard.html`.

## A tester (manuel)

- En tant qu'admin: `POST /api/clients/register` avec `{ email, password, nom_client }` -> cree user+client.
- Connexion avec le compte client -> redirection vers `/client-dashboard.html`.
- Dashboard client:
  - Creer un site -> visible dans la liste; verif en DB: `site.client_id` = client.
  - Envoyer une demande -> visible dans la liste; en DB: `demande_client(client_id, site_id, description)`.
- Verifier la securite: un client ne peut pas creer une demande sur un site qui ne lui appartient pas.
 - Admin demandes:
   - Ouvrir `/demandes-client-admin.html` (ROLE_ADMIN requis) et verifier: listing, changement de status, conversion en ticket (etat `Pas_commence`).

## Suivi et prochaines etapes

- Workflow demandes client (admin):
  - GET /api/demandes_client (liste admin avec jointures client/site)
  - PUT /api/demandes_client/:id/status (En_attente|En_cours|Traitee|Rejetee)
  - POST /api/demandes_client/:id/convert-to-ticket -> cree un ticket avec etat 'Pas_commence' (essaie de lier doe/affaire si disponibles pour le site) et marque la demande 'Traitee'
- Eventuelle colonne `client.user_id` officielle dans le schema si non presente.
- Ameliorer l'UI (toasts, validations, selection de site depuis liste, etc.).

Derniere mise a jour: Session 6

- Clients (refonte UI):
  - `clients.html` epuree: header + bouton Nouveau Client + liste en cards via `public/js/clients.js`.
  - `clients.js`: rendu en cartes, actions Voir/Modifier/Supprimer, masquage edit/suppr pour non-admins.
  - `client-view.html`: fiche + actions admin (creer site/demande) + header/offcanvas Bootstrap.
  - `client-edit.html`: formulaire complet de creation/edition.
- Donnees: lors d'une mise a jour client, si `representant_email` change, propagation vers `users.email` (409 si deja pris).

## Améliorations des demandes client (Admin) - Session 7

- **Disparition des demandes traitées :**
  - Sur la page `demandes-client-admin.html`, les demandes qui ont le statut "Traitée" sont maintenant masquées par défaut pour ne montrer que les demandes actives.
  - L'utilisateur peut toujours voir les demandes traitées en utilisant le filtre de statut pour sélectionner "Traitée".

- **Nouveaux statuts 'Annulé' et 'Rejeté' avec commentaire :**
  - La table `demande_client` dans la base de données a été mise à jour pour inclure une colonne `commentaire` de type `TEXT`.
  - Le statut `Annule` a été ajouté à la liste des statuts possibles for une demande client.
  - L'endpoint API `PUT /api/demandes_client/:id/status` a été modifié pour accepter et sauvegarder un `commentaire` lorsque le statut est `Rejetee` ou `Annule`.
  - Sur la page `demandes-client-admin.html`, lorsqu'un administrateur change le statut d'une demande pour "Rejetée" ou "Annulée", une fenêtre modale apparaît, demandant un commentaire obligatoire pour justifier ce changement de statut.
  - Le commentaire est ensuite affiché sur la carte de la demande.