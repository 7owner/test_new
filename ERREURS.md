# Inventaire des erreurs et solutions (projet_var_v4)

Ce fichier recense les erreurs rencontrées (local/Heroku/Render) avec les correctifs appliqués et des pas-à-pas rapides pour les résoudre si elles réapparaissent.

1) PostgreSQL 42601: syntax error at or near ""
- Symptôme: à l’initialisation DB, l’exécution de init/seed échoue au tout premier statement.
- Causes probables:
  - BOM/encodage/CRLF dans les scripts SQL; découpage multi-statements fragile.
- Correctif:
  - server.js: exécution statement-par-statement avec normalisation (suppression BOM, commentaires /* */ et --, split sûr sur ';'), logs ciblés.
  - Variables d’env: INIT_SQL, SEED_SQL, SKIP_DB_INIT.
- Que faire si ça revient:
  - Activer SKIP_DB_INIT=true pour démarrer, puis lancer les scripts manuellement.
  - Vérifier les logs “Schema statement failed:” pour isoler la requête fautive.

2) sessions/connect-pg-simple: « la transaction est annulée… »
- Symptôme: erreurs répétées “transaction annulée, commandes ignorées…” au démarrage.
- Cause: auto-création de la table de session pendant une transaction échouée.
- Correctif:
  - app.set('trust proxy', 1); pré-création de la table session + index; createTableIfMissing: false.
- Vérification: plus d’erreur au boot; cookies de session OK derrière proxy.

3) Duplicate key on users_email_key au seed
- Symptôme: “duplicate key ... users_email_key”.
- Cause: seed non idempotent.
- Correctif: database_correction/seed_fixed.sql — INSERT ... WHERE NOT EXISTS pour les users.

4) Enum etat_rapport: « expression est de type text »
- Symptôme: POST /api/tickets => erreur de type sur etat.
- Correctif: cast explicite COALESCE($6::etat_rapport,'Pas_commence'::etat_rapport). Bonus: date_debut = COALESCE($8::timestamp, CURRENT_TIMESTAMP).

5) Emails d’agents « example.com » (UI)
- Symptôme: pages Agents et Générer Jeton affichent des emails fictifs.
- Cause: données statiques en dur.
- Correctifs:
  - public/agents.html: charge /api/agents (plus de mock).
  - public/agent-token-new.html: charge l’agent via /api/agents (matricule) et appelle POST /api/invite-agent (email réel + intervention_id).

6) agent-token-new: simulation au lieu d’envoi réel
- Symptôme: simple alert simulée, pas d’appel au backend.
- Correctif: remplacement du handler bouton par un POST réel vers /api/invite-agent.

7) Dashboard: « Invalid or unexpected token » / données statiques
- Symptômes:
  - Erreur JS due à des blocs corrompus (guillemets/encodage).
  - Carte/graphes basés sur des échantillons.
- Correctif: réécriture complète public/dashboard.html (carte X/Y, graphe mensuel, donut, top 5).

8) tickets.html: nom de site incorrect
- Symptôme: affichage de libellés statiques.
- Correctif: chargement /api/sites et map id?nom; liens vers site-view.html.

9) site-new: champs adresse invisibles ou non validés
- Symptômes: switch actif mais champs non visibles; required non appliqués.
- Correctifs: ajout du bloc champs + toggle (required dynamiques Adresse/CP/Ville); chargement /api/adresses; soumission crée l’adresse puis le site.

10) Reset password: liens localhost en prod
- Correctif: construction dynamique via x-forwarded-proto/req.protocol + req.get('host').

11) script.js tronqué: « Unexpected end of input »
- Correctif: désactivation sur les pages sensibles; à réécrire/supprimer proprement.

12) Render init fragile
- Correctif: normalisation + exécution par statements; possibilité d’INIT_SQL/SEED_SQL ou SKIP_DB_INIT.

13) Santé/encodage
- Correctif transversal: forcer charset=utf-8 côté serveur; nettoyage UI.

Notes d’exploitation
- Heroku (branche heroku): Procfile; config JWT_SECRET + add-on Postgres.
- Render (branche deploy-render-modif-tickets-applications): render.yaml; config DATABASE_URL, JWT_SECRET; SMTP_* si envoi réel.
- Logs attendus au boot: « Core agents/users coherence ensured. »; pas de « transaction annulée ».
