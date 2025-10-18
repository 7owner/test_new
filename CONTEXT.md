# Contexte du projet (projet_var_v4)

Ce fichier résume les décisions, changements effectués et le backlog (prochaines étapes) pour garder le contexte entre sessions.

## Décisions
- Conserver l’authentification `users` (login/register JWT).
- Focalisation sur l’accès rapide aux données via relations et pages « détail ».
- Ne pas supprimer les pages « inutiles » pour l’instant; faire le ménage plus tard.

## Changements effectués (oct. 2025)
- Backend
  - Ajout d’un aperçu des sites: `GET /api/sites?overview=1` (compteurs affaires/DOE/maintenances + dernière maintenance).
  - Extension des relations Site: `GET /api/sites/:id/relations` renvoie aussi `adresse`, `rendezvous`, `documents`, `images`.
  - Nouvelle route relations Intervention: `GET /api/interventions/:id/relations` (intervention, maintenance, doe, site, affaire, rendezvous, documents, images).
- Frontend (pages)
  - Ajout `public/site.html` (détail de site) + rendu relations.
  - Ajout `public/intervention.html` (détail d’intervention) + rendu relations.
  - Ajout `public/agent.html` (détail d’agent) + rendu passeport/formations.
  - Correction page détail Agent: normalisation des libellés/encodages dans meta et informations (séparateurs, libellés Téléphone/Entrée) côté client.
  - Ajout `public/rendezvous-view.html` (détail de rendez-vous) + rendu pièces jointes.
  - Ajout `public/achats.html` et `public/factures.html` (listes + formulaires de création minimalistes).
  - Modernisation layout avec sidebar + header sticky (pages: `dashboard.html`, `agents.html`, `sites.html`, `interventions.html`).
  - Ajout `public/maintenance.html` (détail de maintenance) + loader `loadMaintenanceDetail()` (GET `/api/maintenances/:id/relations`).
- Frontend (navigation/UI)
  - Header unifié (`nav.js`) activé sur toutes les pages; menu allégé aux sections actives (Dashboard, Agents, Sites, Interventions, Rendez-vous) avec icônes.
  - Liste Sites: affichage direct des compteurs (affaires/DOE/maintenances) + lien vers détail.
  - Liste Interventions: titres cliquables vers la page détail + filtres/tri côté client (recherche, date, maintenance, tri).
  - Liste Agents et Rendez-vous: titres cliquables vers la page détail.
  - Breadcrumbs ajoutés sur pages liste et détail (retour rapide Dashboard > Section > Détail).
  - Dashboard: simplifié pour ne garder que tuiles + graphique + “Maintenances urgentes”; suppression du bloc « liens rapides » et du diagramme SVG.
  - Cartes “récents” sur Dashboard: Achats, Factures, Règlements (5 derniers éléments chacun).
  - Sidebar responsive (CSS `.app-shell`, `.sidebar`) + icônes Lucide (chargées via CDN, `nav.js`).
  - Maintenances urgentes: éléments désormais cliquables vers `maintenance.html#<id>` + badges d’état mappés (Pas_commence / En_cours / Terminé / Bloqué).
  - Cards cliquables: toutes les cards (Agents/Interventions/Rendezvous/Achats/Factures) sont entièrement cliquables; les clics sur boutons sont ignorés.
  - Listes compactes: application du style “row compact” aux listes Agents, Interventions et Rendez-vous (alignées sur Achats/Factures).
  - Dashboard: grilles auto‑adaptatives via `.grid-autofit-cards` (auto-fit/minmax) avec `gap` et `margin-bottom` uniformes; carte du graphe élargie (`span-2`).
  - Dashboard: ajout compteurs Achats/Factures/Règlements (cartes cliquables) positionnés sous « Graphe + Maintenances urgentes ».
  - Dashboard: cartes « récents » (Achats/Factures/Règlements) retirées de l’UI (masquées CSS) pour alléger la vue.
  - Dashboard métriques: liens « Voir les maintenances » et « Voir les agents » ajoutés sous les cartes correspondantes; full‑card cliquable.
  - Bouton « Voir relations » retiré de toutes les listes (Sites/DOE/Agents/Rendez-vous) pour épurer l'UI; les autres boutons d’action restent inchangés.
  - Fond d’écran: ajout d’un fallback CSS global (public/custom.css) pour appliquer le dégradé sur toutes les pages, même sans la classe `app-bg` ou avant le chargement de `nav.js`.

## Fichiers modifiés/ajoutés
- Backend: `server.js`
- Frontend pages: `public/site.html`, `public/intervention.html`, `public/agent.html`, `public/rendezvous-view.html`, `public/dashboard.html`
- Frontend script: `public/script.js`
  - Loaders de pages détail (site, intervention, agent, rendez-vous) + rendu de breadcrumbs.
  - Loader de maintenance: `loadMaintenanceDetail()` + rendu DOE/Site/Interventions/Documents/Images.
  - Gestion Achats: fetch + création + suppression (et chargement affaires/sites)
  - Gestion Factures: fetch + création + suppression (et chargement clients/affaires)
  - Récents Dashboard: chargement Achats/Factures/Règlements après l’instanciation du graphique (fix du blocage Chart).
  - Toasters UI: `showToast(message, type)` + conteneur `#toast-root` injecté (messages succès/erreur).
  - Badges statut (Achats/Factures): mapping → `.badge-*` (warning/info/success/danger).
  - Badges maintenance: mapping étendu Pas_commence / En_cours / Terminé / Bloqué → classes `.badge-*`.
  - Utilitaire `makeCardsClickable(container)`: navigation vers le premier lien d’une card, en ignorant les actions bouton.

### Données de démo (1 an)
- Script annuel: `scripts/seed_year.js` (+ commande `npm run seed-year`).
- Génère, pour les 12 derniers mois:
  - 3 maintenances/mois (liées à un DOE et une affaire existants ou DOE DEMO créé si manquant)
  - 1–3 interventions par maintenance
  - 0–2 rendez-vous par intervention (statut Planifie, datés)
- Idempotence partielle: évite de recréer les maintenances via un titre unique par mois.

## Prérequis/Exécution
- `.env` avec `DATABASE_URL`, `JWT_SECRET`, `PORT`.
- `npm install`, `npm run dev`.

## Guide de test rapide

Frontend (navigateur)
- Dashboard: http://localhost:3000/dashboard.html
- Agents (liste): http://localhost:3000/agents.html → détail: http://localhost:3000/agent.html#A001
- Sites (liste): http://localhost:3000/sites.html → détail: http://localhost:3000/site.html#1
- Interventions (liste + filtres/tri): http://localhost:3000/interventions.html → détail: http://localhost:3000/intervention.html#1
- Rendez-vous (liste): http://localhost:3000/rendezvous.html → détail: http://localhost:3000/rendezvous-view.html#1
 - Maintenance (détail): http://localhost:3000/maintenance.html#1

Notes UI
- Connexion/Inscription: login.html / register.html. Après login, le JWT est stocké en localStorage et utilisé automatiquement par le front.
- Breadcrumbs présents sur les pages liste et détail. Menu global (nav.js) avec icônes.

Backend (API)
- Health: GET /api/health
- Auth: POST /api/register, POST /api/login (renvoie un JWT)
- Dashboard: GET /api/dashboard (JWT requis)
- Sites: GET /api/sites?overview=1, GET /api/sites/:id, GET /api/sites/:id/relations
- Interventions: GET /api/interventions, GET /api/interventions/:id/relations
- Maintenances: GET /api/maintenances, GET /api/maintenances/:id/relations
- Documents/Images: GET /api/documents?cible_type=Site&cible_id=1, GET /api/images/:id/view
- Assets: Icônes ajoutées (`public/favicon.svg`). `/favicon.ico` redirige vers `/favicon.svg` (plus de 404).
- Organisation: 
  - Equipes: GET/POST/PUT/DELETE /api/equipes, GET /api/equipes/:id
  - Agence membres: GET/POST/PUT/DELETE /api/agence_membres, GET /api/agence_membres/:id
  - Agent équipes: GET/POST/DELETE /api/agent_equipes, GET /api/agent_equipes/:id
  - Fonctions: GET/POST/PUT/DELETE /api/fonctions, GET /api/fonctions/:id
  - Agent fonctions: GET/POST/PUT/DELETE /api/agent_fonctions, GET /api/agent_fonctions/:id

Exemples cURL (remplacez <TOKEN>)
- Dashboard: `curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/dashboard`
- Sites (overview): `curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/sites?overview=1`
- Relations site: `curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/sites/1/relations`
- Relations intervention: `curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/interventions/1/relations`
- Fonctions (création): `curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"code":"TECH","libelle":"Technicien"}' http://localhost:3000/api/fonctions`

Seed/Données
- Au démarrage, le serveur tente d’initialiser le schéma et d’exécuter `db/seed.sql` (idempotent). Vous pouvez aussi lancer `npm run seed`.
- Quelques accents dans `seed.sql` sont mal encodés (cosmétique).
- Pour enrichir sur 12 mois: `npm run seed-year` (peuple maintenances/interventions/rendezvous).

### Gestion financière (ajoutées)
- Tables: `achat`, `facture`, `reglement` (+ FKs et index)
  - `achat` → liens optionnels vers `affaire` et `site`
  - `facture` → liens optionnels vers `client` et `affaire`
  - `reglement` → lié à `facture`
- API:
  - Achats: GET/POST/PUT/DELETE `/api/achats`, GET `/api/achats/:id`
  - Factures: GET/POST/PUT/DELETE `/api/factures`, GET `/api/factures/:id`
  - Règlements: GET `/api/reglements` (filtrage `?facture_id=`), POST `/api/reglements`, DELETE `/api/reglements/:id`
  - Calcul auto `montant_ttc` si `montant_ht` + `tva` fournis

### Build et assets
- Tailwind/PostCSS: `public/input.css` + script NPM `build-css` → `public/style.css` (exécuté: OK).
- Styles utilitaires: `public/custom.css` (cards, buttons, fields, badges, breadcrumb, toasts, layout/sidebar).
- Navigation/header: `public/nav.js` (injection CSS, Lucide CDN, header sticky, menu, toast root).

## Backlog / Prochaines étapes
- Nettoyage: retirer les pages non utilisées quand validé.
- Rendez-vous: ajouter filtres/tri (similaires à Interventions) si besoin.
- Uploads depuis pages détail (documents/images) avec cible (`Site`, `Intervention`, `RendezVous`).
- Matérialiser des ENUMs (ou contraintes CHECK) pour limiter les valeurs (`statut_rdv`, etc.).
- Implémenter les entités d’organisation (équipe/fonctions) côté DB + API + UI.
- Encodage: corriger les accents mal encodés dans `db/seed.sql` et quelques textes HTML.
- Seeds: prévoir des seeds pour équipes/fonctions et liaisons pour tester les nouveaux endpoints.

---

## Écart entre tables prévues et implémentation

Source des tables prévues: `symfony/tables.txt`.

### Tables prévues non implémentées dans `db/init.sql`
- `equipe`
- `agence_membre`
- `agent_equipe`
- `fonction`
- `agent_fonction`

Ces cinq tables (organisation/roles) ne sont pas présentes. À ajouter avec FKs, index et endpoints CRUD.

### ENUMs conceptuels non matérialisés
Les énumérations du modèle (dans `tables.txt`) ne sont pas définies en tant que types Postgres, ni contraintes `CHECK` dans `init.sql`:
- `sujet_type`, `statut_rdv`, `etat_rapport`
- `doc_cible_type`, `doc_nature`
- `statut_achat`, `statut_facture`, `mode_reglement`
- `role_agence`, `type_formation`

Actuellement, le schéma utilise des `VARCHAR`. Option: créer des `ENUM` ou des `CHECK` pour restreindre les valeurs.

### API/Pages manquantes associées
- Aucun endpoint/UI pour: `equipe`, `agence_membre`, `agent_equipe`, `fonction`, `agent_fonction`.
- Si on matérialise les ENUMs, prévoir l’impact sur la validation côté API et les formulaires.

### Divers
- Encodage: quelques libellés accentués mal encodés dans `db/seed.sql` (à corriger).
- Doublons/variantes de routes dans `server.js` (à rationaliser plus tard).

## Propositions de mise en œuvre (org/fonctions)
1) Étendre `db/init.sql` (idempotent) avec les 5 tables + FKs/index.
2) API CRUD Express pour ces tables.
3) Pages: `equipes.html`, `fonctions.html` ou intégration dans `agents.html` (affectations).
4) Option: ajouter des vues agrégées sur dashboard (ex: formations expirant bientôt, RDV à venir).
