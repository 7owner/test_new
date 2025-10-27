# Inventaire des erreurs et solutions (projet_var_v4)

Ce fichier recense les erreurs rencontr�es (local/Heroku/Render) avec les correctifs appliqu�s et des pas-�-pas rapides pour les r�soudre si elles r�apparaissent.

1) PostgreSQL 42601: syntax error at or near ""
- Sympt�me: � l�initialisation DB, l�ex�cution de init/seed �choue au tout premier statement.
- Causes probables:
  - BOM/encodage/CRLF dans les scripts SQL; d�coupage multi-statements fragile.
- Correctif:
  - server.js: ex�cution statement-par-statement avec normalisation (suppression BOM, commentaires /* */ et --, split s�r sur ';'), logs cibl�s.
  - Variables d�env: INIT_SQL, SEED_SQL, SKIP_DB_INIT.
- Que faire si �a revient:
  - Activer SKIP_DB_INIT=true pour d�marrer, puis lancer les scripts manuellement.
  - V�rifier les logs �Schema statement failed:� pour isoler la requ�te fautive.

2) sessions/connect-pg-simple: � la transaction est annul�e� �
- Sympt�me: erreurs r�p�t�es �transaction annul�e, commandes ignor�es�� au d�marrage.
- Cause: auto-cr�ation de la table de session pendant une transaction �chou�e.
- Correctif:
  - app.set('trust proxy', 1); pr�-cr�ation de la table session + index; createTableIfMissing: false.
- V�rification: plus d�erreur au boot; cookies de session OK derri�re proxy.

3) Duplicate key on users_email_key au seed
- Sympt�me: �duplicate key ... users_email_key�.
- Cause: seed non idempotent.
- Correctif: database_correction/seed_fixed.sql � INSERT ... WHERE NOT EXISTS pour les users.

4) Enum etat_rapport: � expression est de type text �
- Sympt�me: POST /api/tickets => erreur de type sur etat.
- Correctif: cast explicite COALESCE($6::etat_rapport,'Pas_commence'::etat_rapport). Bonus: date_debut = COALESCE($8::timestamp, CURRENT_TIMESTAMP).

5) Emails d�agents � example.com � (UI)
- Sympt�me: pages Agents et G�n�rer Jeton affichent des emails fictifs.
- Cause: donn�es statiques en dur.
- Correctifs:
  - public/agents.html: charge /api/agents (plus de mock).
  - public/agent-token-new.html: charge l�agent via /api/agents (matricule) et appelle POST /api/invite-agent (email r�el + intervention_id).

6) agent-token-new: simulation au lieu d�envoi r�el
- Sympt�me: simple alert simul�e, pas d�appel au backend.
- Correctif: remplacement du handler bouton par un POST r�el vers /api/invite-agent.

7) Dashboard: � Invalid or unexpected token � / donn�es statiques
- Sympt�mes:
  - Erreur JS due � des blocs corrompus (guillemets/encodage).
  - Carte/graphes bas�s sur des �chantillons.
- Correctif: r��criture compl�te public/dashboard.html (carte X/Y, graphe mensuel, donut, top 5).

8) tickets.html: nom de site incorrect
- Sympt�me: affichage de libell�s statiques.
- Correctif: chargement /api/sites et map id?nom; liens vers site-view.html.

9) site-new: champs adresse invisibles ou non valid�s
- Sympt�mes: switch actif mais champs non visibles; required non appliqu�s.
- Correctifs: ajout du bloc champs + toggle (required dynamiques Adresse/CP/Ville); chargement /api/adresses; soumission cr�e l�adresse puis le site.

10) Reset password: liens localhost en prod
- Correctif: construction dynamique via x-forwarded-proto/req.protocol + req.get('host').

11) script.js tronqu�: � Unexpected end of input �
- Correctif: d�sactivation sur les pages sensibles; � r��crire/supprimer proprement.

12) Render init fragile
- Correctif: normalisation + ex�cution par statements; possibilit� d�INIT_SQL/SEED_SQL ou SKIP_DB_INIT.

13) Sant�/encodage
- Correctif transversal: forcer charset=utf-8 c�t� serveur; nettoyage UI.

Notes d�exploitation
- Heroku (branche heroku): Procfile; config JWT_SECRET + add-on Postgres.
- Render (branche deploy-render-modif-tickets-applications): render.yaml; config DATABASE_URL, JWT_SECRET; SMTP_* si envoi r�el.
- Logs attendus au boot: � Core agents/users coherence ensured. �; pas de � transaction annul�e �.
