
-- =========================================================
-- EXTRA SEED (volumineux) - Remplit les tables manquantes
-- Compatible PostgreSQL / Heroku
-- =========================================================

-- (Optionnel) Assure que des valeurs "metier" existent si la colonne est présente
-- (Si tu as retiré metier, ignore cette section)

-- 1) FONCTION (référentiel)
INSERT INTO fonction (code, libelle) VALUES
('TECH', 'Technicien'),
('RA',   'Responsable d''affaires'),
('ADM',  'Administrateur')
ON CONFLICT DO NOTHING;

-- 2) EQUIPE (liée à une agence existante)
INSERT INTO equipe (agence_id, nom)
SELECT a.id, v.nom
FROM agence a
CROSS JOIN (VALUES
  ('Equipe Terrain'),
  ('Equipe Support'),
  ('Equipe Maintenance')
) v(nom)
WHERE a.id IS NOT NULL
LIMIT 3;

-- 3) AGENT_FONCTION : affecte une fonction aux agents existants
INSERT INTO agent_fonction (agent_matricule, fonction_id, principal)
SELECT ag.matricule, f.id, TRUE
FROM agent ag
JOIN fonction f ON f.code='TECH'
ON CONFLICT DO NOTHING;

-- 4) AGENT_EQUIPE : affecte des agents aux équipes
INSERT INTO agent_equipe (equipe_id, agent_matricule)
SELECT e.id, ag.matricule
FROM equipe e
JOIN agent ag ON ag.actif = TRUE
WHERE e.nom IN ('Equipe Terrain','Equipe Support')
LIMIT 20
ON CONFLICT DO NOTHING;

-- 5) AGENCY_MEMBRE : lie users/agents à l'agence (si applicable)
INSERT INTO agence_membre (agence_id, agent_matricule, role)
SELECT agc.id, ag.matricule, 'MEMBRE'
FROM agence agc
JOIN agent ag ON ag.agence_id = agc.id
ON CONFLICT DO NOTHING;

-- 6) CONTRAT : contrats clients
INSERT INTO contrat (reference, titre, date_debut, date_fin, statut)
SELECT
  'CTR-' || c.id,
  'Contrat Maintenance - ' || c.nom,
  CURRENT_DATE - INTERVAL '60 days',
  CURRENT_DATE + INTERVAL '305 days',
  'Actif'
FROM client c
ON CONFLICT DO NOTHING;

-- 7) CLIENT_CONTRAT : rattache contrats aux clients
INSERT INTO client_contrat (client_id, contrat_id)
SELECT c.id, ct.id
FROM client c
JOIN contrat ct ON ct.reference = 'CTR-' || c.id
ON CONFLICT DO NOTHING;

-- 8) CLIENT_REPRESENTANT : attribue un agent comme représentant client
INSERT INTO client_representant (client_id, agent_matricule, principal)
SELECT c.id, ag.matricule, TRUE
FROM client c
JOIN agent ag ON ag.actif = TRUE
LIMIT 10
ON CONFLICT DO NOTHING;

-- 9) ASSOCIATION : associations (si tu gères des syndics/assos)
INSERT INTO association (titre, email_comptabilite, adresse_id)
SELECT
  'Association ' || s.nom,
  'compta_' || s.id || '@asso.test',
  s.adresse_id
FROM site s
WHERE s.adresse_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 10) ASSOCIATION_SITE : lie association à site
INSERT INTO association_site (association_id, site_id)
SELECT a.id, s.id
FROM association a
JOIN site s ON a.titre = ('Association ' || s.nom)
ON CONFLICT DO NOTHING;

-- 11) ASSOCIATION_AGENT / RESPONSABLE
INSERT INTO association_agent (association_id, agent_matricule)
SELECT a.id, ag.matricule
FROM association a
JOIN agent ag ON ag.actif = TRUE
LIMIT 20
ON CONFLICT DO NOTHING;

INSERT INTO association_responsable (association_id, agent_matricule)
SELECT a.id, ag.matricule
FROM association a
JOIN agent ag ON ag.admin = TRUE
LIMIT 5
ON CONFLICT DO NOTHING;

-- 12) ACHAT : achats liés à des affaires / sites
INSERT INTO achat (reference, affaire_id, site_id, statut)
SELECT
  'ACH-' || af.id,
  af.id,
  sa.site_id,
  'Brouillon'::statut_achat
FROM affaire af
LEFT JOIN site_affaire sa ON sa.affaire_id = af.id
LIMIT 20;

-- 13) DEVIS : devis par ticket/travaux (si table existe)
INSERT INTO devis (reference, client_id, site_id, montant_ht, statut, created_at)
SELECT
  'DEV-' || dc.id,
  dc.client_id,
  dc.site_id,
  (100 + (random()*900))::numeric(10,2),
  'Brouillon',
  CURRENT_TIMESTAMP - (random()*30)*INTERVAL '1 day'
FROM demande_client dc
LIMIT 30;

-- 14) FACTURE : factures générées à partir de devis
INSERT INTO facture (reference, devis_id, montant_ttc, statut, date_emission)
SELECT
  'FAC-' || d.id,
  d.id,
  (d.montant_ht * 1.2)::numeric(10,2),
  'Emise',
  CURRENT_DATE - (random()*15)::int
FROM devis d
LIMIT 30;

-- 15) REGLEMENT : règlements des factures
INSERT INTO reglement (facture_id, montant, mode_paiement, date_paiement)
SELECT
  f.id,
  f.montant_ttc,
  'Virement',
  f.date_emission + ((random()*10)::int) * INTERVAL '1 day'
FROM facture f
LIMIT 30;

-- 16) DEMANDE_MATERIEL : demandes de matériel clients
INSERT INTO demande_materiel (client_id, site_id, titre, description, status, ticket_id, travaux_id, commentaire)
SELECT
  c.id,
  s.id,
  'Demande matériel ' || s.nom,
  'Besoin de matériel pour maintenance du site ' || s.nom,
  'En cours de traitement',
  t.id,
  tr.id,
  'Seed auto'
FROM client c
JOIN site s ON s.client_id = c.id
LEFT JOIN ticket t ON t.site_id = s.id
LEFT JOIN travaux tr ON tr.site_id = s.id
LIMIT 40;

-- 17) GESTION_DEMANDE_MATERIEL : lien demande <-> matériels
INSERT INTO gestion_demande_materiel (demande_materiel_id, materiel_id, quantite_demandee)
SELECT dm.id, m.id, (1 + (random()*4)::int)
FROM demande_materiel dm
JOIN materiel m ON TRUE
LIMIT 120
ON CONFLICT DO NOTHING;

-- 18) TICKET_AGENT / RESPONSABLE / SATISFACTION / HISTORIQUE
INSERT INTO ticket_agent (ticket_id, agent_matricule)
SELECT t.id, ag.matricule
FROM ticket t
JOIN agent ag ON ag.actif = TRUE
LIMIT 60
ON CONFLICT DO NOTHING;

INSERT INTO ticket_responsable (ticket_id, agent_matricule)
SELECT t.id, ag.matricule
FROM ticket t
JOIN agent ag ON ag.admin = TRUE
LIMIT 20
ON CONFLICT DO NOTHING;

INSERT INTO ticket_satisfaction (ticket_id, note, commentaire, created_at)
SELECT t.id, (1 + (random()*4)::int), 'RAS (seed)', CURRENT_TIMESTAMP
FROM ticket t
LIMIT 40
ON CONFLICT DO NOTHING;

INSERT INTO ticket_historique_responsable (ticket_id, agent_matricule, created_at)
SELECT t.id, ag.matricule, CURRENT_TIMESTAMP - (random()*20)*INTERVAL '1 day'
FROM ticket t
JOIN agent ag ON ag.admin = TRUE
LIMIT 40
ON CONFLICT DO NOTHING;

-- 19) TRAVAUX_SATISFACTION / HISTORIQUE
INSERT INTO travaux_satisfaction (travaux_id, note, commentaire, created_at)
SELECT tr.id, (1 + (random()*4)::int), 'OK (seed)', CURRENT_TIMESTAMP
FROM travaux tr
LIMIT 40
ON CONFLICT DO NOTHING;

INSERT INTO travaux_historique_responsable (travaux_id, agent_matricule, created_at)
SELECT tr.id, ag.matricule, CURRENT_TIMESTAMP - (random()*20)*INTERVAL '1 day'
FROM travaux tr
JOIN agent ag ON ag.admin = TRUE
LIMIT 40
ON CONFLICT DO NOTHING;

-- 20) MESSAGERIE + ATTACHMENTS
INSERT INTO messagerie (sujet, contenu, auteur_id, created_at, type_sujet, ticket_id, intervention_id)
SELECT
  'Message auto sur ticket #' || t.id,
  'Contenu seed ...',
  u.id,
  CURRENT_TIMESTAMP - (random()*10)*INTERVAL '1 day',
  'ticket'::sujet_type,
  t.id,
  NULL
FROM ticket t
JOIN users u ON TRUE
LIMIT 60;

INSERT INTO messagerie_attachment (messagerie_id, filename, filepath, mimetype, created_at)
SELECT m.id, 'piece_jointe_'||m.id||'.pdf', '/uploads/seed/'||m.id||'.pdf', 'application/pdf', CURRENT_TIMESTAMP
FROM messagerie m
LIMIT 30;

-- 21) AUDIT_LOG (journalisation)
INSERT INTO audit_log (user_id, action, entity, entity_id, created_at, metadata)
SELECT u.id, 'SEED', 'GLOBAL', NULL, CURRENT_TIMESTAMP, '{"seed":"ok"}'::jsonb
FROM users u
LIMIT 10;

