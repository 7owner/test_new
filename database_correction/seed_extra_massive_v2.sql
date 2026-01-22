-- =========================================================
-- EXTRA SEED (volumineux) - Remplit les tables manquantes
-- Compatible PostgreSQL / Heroku (corrigé v2)
-- =========================================================

SET search_path TO public;

-- Désactive FK le temps du seed (robuste)
SET session_replication_role = replica;

-- 1) FONCTION
INSERT INTO fonction (code, libelle) VALUES
('TECH','Technicien'),
('RA','Responsable d''affaires'),
('ADM','Administrateur')
ON CONFLICT DO NOTHING;

-- 2) EQUIPE
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

-- 3) AGENT_FONCTION
INSERT INTO agent_fonction (agent_matricule, fonction_id, principal)
SELECT ag.matricule, f.id, TRUE
FROM agent ag
JOIN fonction f ON f.code='TECH'
ON CONFLICT DO NOTHING;

-- 4) AGENT_EQUIPE
INSERT INTO agent_equipe (equipe_id, agent_matricule)
SELECT e.id, ag.matricule
FROM equipe e
JOIN agent ag ON ag.actif = TRUE
WHERE e.nom IN ('Equipe Terrain','Equipe Support')
LIMIT 20
ON CONFLICT DO NOTHING;

-- 5) AGENCE_MEMBRE (role_agence enum = Admin, Manager, Membre)
INSERT INTO agence_membre (agence_id, agent_matricule, role)
SELECT agc.id, ag.matricule, 'Membre'::role_agence
FROM agence agc
JOIN agent ag ON ag.agence_id = agc.id
ON CONFLICT DO NOTHING;

-- 6) CONTRAT (schema init_fixed)
INSERT INTO contrat (titre, client_id, site_id, metier, date_debut, date_fin)
SELECT
  ('Contrat - ' || c.nom),
  c.id,
  s.id,
  'GTB'::metier_type,
  CURRENT_DATE - INTERVAL '60 days',
  CURRENT_DATE + INTERVAL '305 days'
FROM client c
LEFT JOIN site s ON s.client_id = c.id
ON CONFLICT DO NOTHING;

-- 7) CLIENT_CONTRAT
INSERT INTO client_contrat (client_id, contrat_id)
SELECT c.id, ct.id
FROM client c
JOIN contrat ct ON ct.titre = ('Contrat - ' || c.nom)
ON CONFLICT DO NOTHING;

-- 8) CLIENT_REPRESENTANT
INSERT INTO client_representant (client_id, user_id, nom, email, tel, fonction)
SELECT c.id, u.id, u.nom, u.email, '0600000000', 'Representant'
FROM client c
JOIN users u ON u.role='CLIENT'
LIMIT 20
ON CONFLICT DO NOTHING;

-- 9) ASSOCIATION
INSERT INTO association (titre, email_comptabilite, adresse_id)
SELECT
  'Association ' || s.nom_site,
  'compta_' || s.id || '@asso.test',
  s.adresse_id
FROM site s
WHERE s.adresse_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 10) ASSOCIATION_SITE
INSERT INTO association_site (association_id, site_id)
SELECT a.id, s.id
FROM association a
JOIN site s ON a.titre = ('Association ' || s.nom_site)
ON CONFLICT DO NOTHING;

-- 11) ASSOCIATION_AGENT
INSERT INTO association_agent (association_id, agent_matricule)
SELECT a.id, ag.matricule
FROM association a
JOIN agent ag ON ag.actif = TRUE
LIMIT 50
ON CONFLICT DO NOTHING;

-- 12) ASSOCIATION_RESPONSABLE
INSERT INTO association_responsable (association_id, agent_matricule)
SELECT a.id, ag.matricule
FROM association a
JOIN agent ag ON ag.admin = TRUE
LIMIT 20
ON CONFLICT DO NOTHING;

-- 13) ACHAT
INSERT INTO achat (reference, affaire_id, site_id, statut)
SELECT
  'ACH-' || af.id,
  af.id,
  sa.site_id,
  'Brouillon'::statut_achat
FROM affaire af
LEFT JOIN site_affaire sa ON sa.affaire_id = af.id
LIMIT 50;

-- 14) DEVIS (schema init_fixed)
INSERT INTO devis (titre, description, montant, status, association_id)
SELECT
  'Devis - ' || dc.titre,
  dc.description,
  (100 + (random()*900))::numeric(12,2),
  'Brouillon'::devis_status,
  a.id
FROM demande_client dc
LEFT JOIN association a ON TRUE
LIMIT 50;

-- 15) FACTURE (liée à intervention ou client)
INSERT INTO facture (intervention_id, client_id, association_id, titre, reference, date_emission, date_echeance, total_ht, total_ttc, statut)
SELECT
  i.id,
  c.id,
  ca.association_id,
  'Facture intervention ' || i.id,
  'FAC-' || i.id,
  CURRENT_DATE - ((random()*15)::int),
  CURRENT_DATE + 30,
  (100 + (random()*900))::numeric(12,2),
  (120 + (random()*1100))::numeric(12,2),
  'Emise'::statut_facture
FROM intervention i
LEFT JOIN demande_client dc ON dc.id = i.demande_id
LEFT JOIN client c ON c.id = COALESCE(dc.client_id, i.site_id)
LEFT JOIN client_association ca ON ca.client_id = c.id
LIMIT 30;

-- 16) REGLEMENT
INSERT INTO reglement (facture_id, montant)
SELECT f.id, f.total_ttc
FROM facture f
WHERE f.total_ttc IS NOT NULL
LIMIT 30;

-- 17) DEMANDE_MATERIEL
INSERT INTO demande_materiel (client_id, site_id, titre, description, status, ticket_id, travaux_id, commentaire)
SELECT
  c.id,
  s.id,
  'Demande matériel ' || s.nom_site,
  'Besoin de matériel pour maintenance du site ' || s.nom_site,
  'En cours de traitement',
  t.id,
  tr.id,
  'Seed auto'
FROM client c
JOIN site s ON s.client_id = c.id
LEFT JOIN ticket t ON t.site_id = s.id
LEFT JOIN travaux tr ON tr.site_id = s.id
LIMIT 60;

-- 18) GESTION_DEMANDE_MATERIEL
INSERT INTO gestion_demande_materiel (demande_materiel_id, materiel_id, quantite_demandee)
SELECT dm.id, m.id, (1 + (random()*4)::int)
FROM demande_materiel dm
JOIN materiel m ON TRUE
LIMIT 200
ON CONFLICT DO NOTHING;

-- 19) TICKET_AGENT
INSERT INTO ticket_agent (ticket_id, agent_matricule)
SELECT t.id, ag.matricule
FROM ticket t
JOIN agent ag ON ag.actif = TRUE
LIMIT 120
ON CONFLICT DO NOTHING;

-- 20) TICKET_RESPONSABLE
INSERT INTO ticket_responsable (ticket_id, agent_matricule)
SELECT t.id, ag.matricule
FROM ticket t
JOIN agent ag ON ag.admin = TRUE
LIMIT 50
ON CONFLICT DO NOTHING;

-- 21) TICKET_SATISFACTION
INSERT INTO ticket_satisfaction (ticket_id, rating, comment)
SELECT t.id, (1 + (random()*4)::int), 'RAS (seed)'
FROM ticket t
LIMIT 80
ON CONFLICT DO NOTHING;

-- 22) TICKET_HISTORIQUE_RESPONSABLE
INSERT INTO ticket_historique_responsable (ticket_id, ancien_responsable_matricule, nouveau_responsable_matricule, modifie_par_matricule)
SELECT t.id, ag1.matricule, ag2.matricule, ag2.matricule
FROM ticket t
JOIN agent ag1 ON ag1.actif = TRUE
JOIN agent ag2 ON ag2.admin = TRUE
LIMIT 60
ON CONFLICT DO NOTHING;

-- 23) TRAVAUX_SATISFACTION
INSERT INTO travaux_satisfaction (travaux_id, rating, comment)
SELECT tr.id, (1 + (random()*4)::int), 'OK (seed)'
FROM travaux tr
LIMIT 80
ON CONFLICT DO NOTHING;

-- 24) TRAVAUX_HISTORIQUE_RESPONSABLE
INSERT INTO travaux_historique_responsable (travaux_id, ancien_responsable_matricule, nouveau_responsable_matricule, modifie_par_matricule)
SELECT tr.id, ag1.matricule, ag2.matricule, ag2.matricule
FROM travaux tr
JOIN agent ag1 ON ag1.actif = TRUE
JOIN agent ag2 ON ag2.admin = TRUE
LIMIT 60
ON CONFLICT DO NOTHING;

-- 25) MESSAGERIE
INSERT INTO messagerie (conversation_id, sender_id, receiver_id, ticket_id, demande_id, client_id, body, is_read)
SELECT
  'conv-' || t.id,
  u1.id,
  u2.id,
  t.id,
  t.demande_id,
  dc.client_id,
  'Message seed sur ticket #' || t.id,
  FALSE
FROM ticket t
JOIN users u1 ON TRUE
JOIN users u2 ON u2.id <> u1.id
LEFT JOIN demande_client dc ON dc.id = t.demande_id
LIMIT 120;

-- 26) MESSAGERIE_ATTACHMENT
INSERT INTO messagerie_attachment (message_id, file_blob, file_name, file_type, file_size)
SELECT m.id, NULL, 'piece_jointe_'||m.id||'.pdf', 'application/pdf', 12345
FROM messagerie m
LIMIT 60;

-- 27) AUDIT_LOG
INSERT INTO audit_log (entity, entity_id, action, actor_email, details)
SELECT 'SEED', NULL, 'INSERT', u.email, '{"seed":"ok"}'::jsonb
FROM users u
LIMIT 30;

-- Réactive FK
SET session_replication_role = origin;
