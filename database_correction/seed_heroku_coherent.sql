BEGIN;

-- 1) Reset complet des tables applicatives (schema conservé)
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
    INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public';

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END $$;

-- 2) Utilisateurs
INSERT INTO users (email, roles, password, role, nom) VALUES
('maboujunior777@gmail.com', '["ROLE_ADMIN"]'::jsonb, '$2b$10$ZVi8PZCnI9RKYxXlUW7kUu3M98YhUipLuqnCb/X0JB0MfgqsKBn1W', 'ADMIN', 'Admin Mabou'),
('channelhongnia@gmail.com',   '["ROLE_ADMIN"]'::jsonb, '$2b$10$ZVi8PZCnI9RKYxXlUW7kUu3M98YhUipLuqnCb/X0JB0MfgqsKBn1W', 'ADMIN', 'Admin Channel'),
('takotuemabou@outlook.com',   '["ROLE_CLIENT"]'::jsonb,  '$2b$10$ZVi8PZCnI9RKYxXlUW7kUu3M98YhUipLuqnCb/X0JB0MfgqsKBn1W', 'USER',  'Client Takot');

-- 3) Adresses / agences
INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays) VALUES
('Siege', '10 Rue Centrale', '75001', 'Paris', 'France'),
('Entrepot', '25 Avenue des Champs', '69001', 'Lyon', 'France'),
('Client ACME', '5 Rue Client', '75008', 'Paris', 'France');

INSERT INTO agence (titre, designation, telephone, email, adresse_id, date_debut, date_fin) VALUES
('Agence Paris', 'Agence principale Paris', '0102030405', 'paris@agence.fr', (SELECT id FROM adresse WHERE libelle='Siege'), now(), now() + interval '10 years'),
('Agence Lyon',  'Agence secondaire Lyon', '0499999999', 'lyon@agence.fr',  (SELECT id FROM adresse WHERE libelle='Entrepot'), now(), now() + interval '10 years');

-- 4) Agents
INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id, fonction) VALUES
('AGT001', 'Dupont',  'Jean',   FALSE, 'takotuemabou@outlook.com', '0612345678', TRUE,  (SELECT id FROM agence WHERE titre='Agence Paris'), (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), 'Technicien'),
('AGT002', 'Martin',  'Sophie', TRUE,  'maboujunior777@gmail.com', '0687654321', TRUE,  (SELECT id FROM agence WHERE titre='Agence Lyon'),  (SELECT id FROM users WHERE email='maboujunior777@gmail.com'), 'Responsable'),
('AGT003', 'Bernard', 'Pierre', FALSE, 'pierre.bernard@example.com', '0611223344', TRUE, (SELECT id FROM agence WHERE titre='Agence Paris'), NULL, 'Technicien'),
('AGT004', 'Petit',   'Marie',  FALSE, 'marie.petit@example.com', '0655443322', TRUE,   (SELECT id FROM agence WHERE titre='Agence Lyon'), NULL, 'Technicien'),
('AGT005', 'Channel', 'Admin',  TRUE,  'channelhongnia@gmail.com', '0600000000', TRUE,  (SELECT id FROM agence WHERE titre='Agence Paris'), (SELECT id FROM users WHERE email='channelhongnia@gmail.com'), 'Admin');

INSERT INTO passeport (agent_matricule, permis, habilitations, certifications)
VALUES ('AGT001', 'Permis B', 'H0B0, BR', 'SST');

INSERT INTO formation (agent_matricule, type, libelle, date_obtention, date_validite)
VALUES ('AGT001', 'Certification', 'CACES R489', current_date - interval '200 days', current_date + interval '165 days');

-- 5) Clients / représentants / sites
INSERT INTO client (nom_client, representant_nom, representant_email, representant_tel, adresse_id, user_id, commentaire) VALUES
('Client ACME', 'Mme Martin', 'takotuemabou@outlook.com', '0601010101', (SELECT id FROM adresse WHERE libelle='Client ACME'), (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), 'Client principal demo'),
('Client BETA', 'M. Beta', 'beta@example.com', '0602020202', (SELECT id FROM adresse WHERE libelle='Client ACME'), NULL, 'Client secondaire demo');

INSERT INTO client_representant (client_id, user_id, nom, email, tel, fonction)
VALUES (
  (SELECT id FROM client WHERE nom_client='Client ACME'),
  (SELECT id FROM users WHERE email='takotuemabou@outlook.com'),
  'Mme Martin', 'takotuemabou@outlook.com', '0601010101', 'Responsable client'
);

INSERT INTO site (nom_site, adresse_id, client_id, commentaire, ticket, responsable_matricule, statut) VALUES
('Site Paris 1', (SELECT id FROM adresse WHERE libelle='Siege'),    (SELECT id FROM client WHERE nom_client='Client ACME'), 'Site de demonstration Paris', TRUE,  'AGT001', 'Actif'),
('Site Lyon 1',  (SELECT id FROM adresse WHERE libelle='Entrepot'), (SELECT id FROM client WHERE nom_client='Client ACME'), 'Site de demonstration Lyon',  TRUE,  'AGT002', 'Actif'),
('Site Lille 1', (SELECT id FROM adresse WHERE libelle='Entrepot'), (SELECT id FROM client WHERE nom_client='Client BETA'), 'Site client BETA',           FALSE, NULL,    'Actif');

INSERT INTO site_agent (site_id, agent_matricule)
VALUES
((SELECT id FROM site WHERE nom_site='Site Paris 1'), 'AGT001'),
((SELECT id FROM site WHERE nom_site='Site Lyon 1'), 'AGT002');

INSERT INTO site_responsable (site_id, agent_matricule, role, date_debut)
VALUES
((SELECT id FROM site WHERE nom_site='Site Paris 1'), 'AGT001', 'Principal', now()),
((SELECT id FROM site WHERE nom_site='Site Lyon 1'),  'AGT002', 'Principal', now());

-- 6) Associations + relations
INSERT INTO association (titre, email_comptabilite, adresse_id)
VALUES
('Association ACME Paris', 'compta-acme@example.com', (SELECT id FROM adresse WHERE libelle='Siege' LIMIT 1)),
('Association BETA Lille', 'compta-beta@example.com', (SELECT id FROM adresse WHERE libelle='Entrepot' LIMIT 1));

INSERT INTO client_association (client_id, association_id)
VALUES
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM association WHERE titre='Association ACME Paris')),
((SELECT id FROM client WHERE nom_client='Client BETA'), (SELECT id FROM association WHERE titre='Association BETA Lille'));

INSERT INTO association_site (association_id, site_id)
VALUES
((SELECT id FROM association WHERE titre='Association ACME Paris'), (SELECT id FROM site WHERE nom_site='Site Paris 1')),
((SELECT id FROM association WHERE titre='Association ACME Paris'), (SELECT id FROM site WHERE nom_site='Site Lyon 1')),
((SELECT id FROM association WHERE titre='Association BETA Lille'), (SELECT id FROM site WHERE nom_site='Site Lille 1'));

INSERT INTO association_responsable (association_id, agent_matricule)
VALUES
((SELECT id FROM association WHERE titre='Association ACME Paris'), 'AGT001'),
((SELECT id FROM association WHERE titre='Association BETA Lille'), 'AGT002');

INSERT INTO association_agent (association_id, agent_matricule)
VALUES
((SELECT id FROM association WHERE titre='Association ACME Paris'), 'AGT003'),
((SELECT id FROM association WHERE titre='Association ACME Paris'), 'AGT005'),
((SELECT id FROM association WHERE titre='Association BETA Lille'), 'AGT004');

-- 6) Contrats + relations
INSERT INTO contrat (titre, client_id, site_id, date_debut, date_fin, metier, type)
VALUES
('Contrat ACME Paris 2026', (SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), DATE '2026-01-01', DATE '2026-12-31', 'GTB', 'Maintenance'),
('Contrat ACME Lyon 2026',  (SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM site WHERE nom_site='Site Lyon 1'),  DATE '2026-01-01', DATE '2026-12-31', 'Video', 'Maintenance'),
('Contrat BETA Lille 2026', (SELECT id FROM client WHERE nom_client='Client BETA'), (SELECT id FROM site WHERE nom_site='Site Lille 1'), DATE '2026-02-01', DATE '2026-12-31', 'GTB', 'Projet');

INSERT INTO client_contrat (client_id, contrat_id)
VALUES
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM contrat WHERE titre='Contrat ACME Paris 2026')),
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM contrat WHERE titre='Contrat ACME Lyon 2026')),
((SELECT id FROM client WHERE nom_client='Client BETA'), (SELECT id FROM contrat WHERE titre='Contrat BETA Lille 2026'));

INSERT INTO contrat_site_association (contrat_id, site_id)
VALUES
((SELECT id FROM contrat WHERE titre='Contrat ACME Paris 2026'), (SELECT id FROM site WHERE nom_site='Site Paris 1')),
((SELECT id FROM contrat WHERE titre='Contrat ACME Lyon 2026'),  (SELECT id FROM site WHERE nom_site='Site Lyon 1')),
((SELECT id FROM contrat WHERE titre='Contrat BETA Lille 2026'), (SELECT id FROM site WHERE nom_site='Site Lille 1'));

-- 6) Affaires / DOE / rattachements
INSERT INTO affaire (nom_affaire, numero_affaire, client_id, description) VALUES
('Contrat Ticket ACME', 'AFF-ACME-2026', (SELECT id FROM client WHERE nom_client='Client ACME'), 'Contrat annuel maintenance ACME'),
('Extension BETA',      'AFF-BETA-2026', (SELECT id FROM client WHERE nom_client='Client BETA'), 'Projet extension BETA');

INSERT INTO site_affaire (site_id, affaire_id) VALUES
((SELECT id FROM site WHERE nom_site='Site Paris 1'), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME')),
((SELECT id FROM site WHERE nom_site='Site Lyon 1'),  (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME')),
((SELECT id FROM site WHERE nom_site='Site Lille 1'), (SELECT id FROM affaire WHERE nom_affaire='Extension BETA'));

INSERT INTO doe (site_id, affaire_id, titre, description) VALUES
((SELECT id FROM site WHERE nom_site='Site Paris 1'), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), 'DOE Paris 2026', 'Dossier Ouvrages Executés Paris'),
((SELECT id FROM site WHERE nom_site='Site Lyon 1'),  (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), 'DOE Lyon 2026',  'Dossier Ouvrages Executés Lyon');

-- 7) Demandes client
INSERT INTO demande_client (client_id, site_id, titre, description, status, commentaire)
VALUES
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), 'Demande de capteurs', 'Besoin de capteurs temperature Hall A', 'En_cours', 'Prioritaire'),
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM site WHERE nom_site='Site Lyon 1'),  'Probleme camera',      'Une camera est hors service',             'En_cours', 'Camera entree nord'),
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), 'Maintenance preventive','Planifier verification trimestrielle',   'Traitee',  'Deja convertie en ticket');

-- 8) Tickets liés aux demandes
INSERT INTO ticket (doe_id, affaire_id, site_id, demande_id, responsable, titre, description, etat, date_debut, date_fin)
VALUES
((SELECT id FROM doe WHERE titre='DOE Paris 2026'), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), (SELECT id FROM demande_client WHERE titre='Demande de capteurs'), 'AGT001', 'Ticket Semaine 42', 'Verifications periodiques', 'En_cours', now() - interval '10 days', NULL),
((SELECT id FROM doe WHERE titre='DOE Lyon 2026'),  (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), (SELECT id FROM site WHERE nom_site='Site Lyon 1'),  (SELECT id FROM demande_client WHERE titre='Probleme camera'),     'AGT002', 'Ticket Urgent Camera', 'Remplacement camera defectueuse', 'En_cours', now() - interval '2 days', NULL),
((SELECT id FROM doe WHERE titre='DOE Paris 2026'), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), (SELECT id FROM demande_client WHERE titre='Maintenance preventive'), 'AGT001', 'Ticket Preventif Paris', 'Controle annuel installation', 'Termine', now() - interval '20 days', now() - interval '1 day');

UPDATE demande_client d
SET ticket_id = t.id,
    updated_at = now(),
    status = CASE WHEN d.titre='Maintenance preventive' THEN 'Traitee' ELSE d.status END
FROM ticket t
WHERE t.demande_id = d.id;

INSERT INTO ticket_responsable (ticket_id, agent_matricule, role, date_debut)
VALUES
((SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), 'AGT001', 'Principal', now() - interval '10 days'),
((SELECT id FROM ticket WHERE titre='Ticket Urgent Camera'), 'AGT002', 'Principal', now() - interval '2 days'),
((SELECT id FROM ticket WHERE titre='Ticket Preventif Paris'), 'AGT001', 'Principal', now() - interval '20 days');

INSERT INTO ticket_agent (ticket_id, agent_matricule, date_debut)
VALUES
((SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), 'AGT001', now() - interval '10 days'),
((SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), 'AGT003', now() - interval '9 days'),
((SELECT id FROM ticket WHERE titre='Ticket Urgent Camera'), 'AGT002', now() - interval '2 days');

INSERT INTO rapport_ticket (ticket_id, matricule, commentaire_interne, etat)
VALUES
((SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), 'AGT001', 'Intervention en cours, pieces disponibles.', 'En_cours'),
((SELECT id FROM ticket WHERE titre='Ticket Preventif Paris'), 'AGT001', 'Ticket cloture apres verification complete.', 'Termine');

INSERT INTO ticket_satisfaction (ticket_id, user_id, rating, comment, envoieok)
VALUES
((SELECT id FROM ticket WHERE titre='Ticket Preventif Paris'), (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), 4, 'Satisfait du traitement', TRUE);

-- 9) Interventions
INSERT INTO intervention (ticket_id, site_id, demande_id, titre, description, date_debut, date_fin, status, ticket_agent_id, metier)
VALUES
((SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), (SELECT id FROM demande_client WHERE titre='Demande de capteurs'), 'Intervention initiale', 'Controle sur site et validation besoin', now() - interval '9 days', now() - interval '9 days' + interval '2 hours', 'Termine',
 (SELECT id FROM ticket_agent WHERE ticket_id=(SELECT id FROM ticket WHERE titre='Ticket Semaine 42') AND agent_matricule='AGT001' LIMIT 1), 'GTB'),
((SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), (SELECT id FROM demande_client WHERE titre='Demande de capteurs'), 'Intervention de suivi', 'Preparation installation capteurs', now() - interval '1 day', NULL, 'En_cours',
 (SELECT id FROM ticket_agent WHERE ticket_id=(SELECT id FROM ticket WHERE titre='Ticket Semaine 42') AND agent_matricule='AGT003' LIMIT 1), 'GTB'),
((SELECT id FROM ticket WHERE titre='Ticket Urgent Camera'), (SELECT id FROM site WHERE nom_site='Site Lyon 1'), (SELECT id FROM demande_client WHERE titre='Probleme camera'), 'Remplacement camera', 'Depose et pose nouvelle camera', now() - interval '1 day', NULL, 'En_attente',
 (SELECT id FROM ticket_agent WHERE ticket_id=(SELECT id FROM ticket WHERE titre='Ticket Urgent Camera') AND agent_matricule='AGT002' LIMIT 1), 'Video');

INSERT INTO rendu_intervention (intervention_id, resume, valeur)
VALUES
((SELECT id FROM intervention WHERE titre='Intervention initiale'), 'Rapport verification OK', 'Conforme');

INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
VALUES
('rapport_intervention_1.jpg', 'image/jpeg', 102400, '\xDEADBEEF', 'Photo avant intervention', 'AGT001', 'RenduIntervention', (SELECT id FROM rendu_intervention WHERE resume='Rapport verification OK')),
('doe_paris_vue.jpg', 'image/jpeg', 51200, '\x12345678', 'Vue generale du site', 'AGT002', 'DOE', (SELECT id FROM doe WHERE titre='DOE Paris 2026'));

INSERT INTO rendu_intervention_image (rendu_intervention_id, image_id)
VALUES
((SELECT id FROM rendu_intervention WHERE resume='Rapport verification OK'), (SELECT id FROM images WHERE nom_fichier='rapport_intervention_1.jpg'));

-- 10) Materiel + liens
INSERT INTO materiel_catalogue (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif)
VALUES
('Capteur Temperature', 'TEMP001', 'Capteur Hall', 'Capteur', 'Bosch', 'Fournisseur A', 5.00, 'Classe A', 80.00, 'Capteur intelligent', 'GTB', TRUE),
('Camera IP', 'CAMIP001', 'Camera exterieure', 'Video', 'Hikvision', 'Fournisseur B', 2.00, 'Classe B', 220.00, 'Camera HD', 'Video', TRUE);

INSERT INTO materiel (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, commande_status, metier, agence_id)
VALUES
('Capteur Temperature', 'TEMP001', 'Capteur Hall', 'Capteur', 'Bosch', 'Fournisseur A', 5.00, 'Classe A', 80.00, 'Materiel pour Hall A', 'Commande', 'GTB', (SELECT id FROM agence WHERE titre='Agence Paris')),
('Camera IP', 'CAMIP001', 'Camera exterieure', 'Video', 'Hikvision', 'Fournisseur B', 2.00, 'Classe B', 220.00, 'Materiel remplacement camera', 'Reçu', 'Video', (SELECT id FROM agence WHERE titre='Agence Lyon'));

INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire)
VALUES
((SELECT id FROM intervention WHERE titre='Intervention de suivi'), (SELECT id FROM materiel WHERE reference='TEMP001'), 5, 'Capteurs pour installation'),
((SELECT id FROM intervention WHERE titre='Remplacement camera'), (SELECT id FROM materiel WHERE reference='CAMIP001'), 1, 'Camera pour remplacement');

-- 11) Travaux + RASCI/GANTT
INSERT INTO travaux (doe_id, affaire_id, site_id, demande_id, agent_matricule, titre, description, etat, priorite, date_debut, date_fin, date_echeance)
VALUES
((SELECT id FROM doe WHERE titre='DOE Paris 2026'), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), (SELECT id FROM demande_client WHERE titre='Demande de capteurs'), 'AGT001', 'Installation capteurs Hall A', 'Installation de 5 capteurs de temperature dans le Hall A', 'En_cours', 'Haute', now() - interval '3 days', NULL, now() + interval '2 days'),
((SELECT id FROM doe WHERE titre='DOE Lyon 2026'),  (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), (SELECT id FROM site WHERE nom_site='Site Lyon 1'),  (SELECT id FROM demande_client WHERE titre='Probleme camera'), 'AGT002', 'Remplacement camera site Lyon 1', 'Remplacement de la camera defectueuse', 'En_attente', 'Moyenne', now() - interval '2 days', NULL, now() + interval '1 day'),
((SELECT id FROM doe WHERE titre='DOE Paris 2026'), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), NULL, 'AGT003', 'Verification generale site Paris', 'Verification annuelle des installations', 'Termine', 'Basse', now() - interval '20 days', now() - interval '18 days', now() - interval '18 days');

INSERT INTO demande_client_travaux (demande_id, travaux_id)
VALUES
((SELECT id FROM demande_client WHERE titre='Demande de capteurs'), (SELECT id FROM travaux WHERE titre='Installation capteurs Hall A')),
((SELECT id FROM demande_client WHERE titre='Probleme camera'), (SELECT id FROM travaux WHERE titre='Remplacement camera site Lyon 1'));

INSERT INTO travaux_agent (travaux_id, agent_matricule, date_debut)
VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A'), 'AGT001', now() - interval '3 days'),
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A'), 'AGT003', now() - interval '2 days'),
((SELECT id FROM travaux WHERE titre='Remplacement camera site Lyon 1'), 'AGT002', now() - interval '2 days');

INSERT INTO travaux_responsable (travaux_id, agent_matricule, role, date_debut)
VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A'), 'AGT001', 'Principal', now() - interval '3 days'),
((SELECT id FROM travaux WHERE titre='Remplacement camera site Lyon 1'), 'AGT002', 'Principal', now() - interval '2 days');

INSERT INTO travaux_tache (travaux_id, titre, description, etat, priorite, date_echeance)
VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A'), 'Preparation materiel', 'Rassembler capteurs et outils', 'En_cours', 'Haute', now() + interval '1 day'),
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A'), 'Cablage capteurs', 'Realiser cablage et tests', 'A_faire', 'Haute', now() + interval '2 days'),
((SELECT id FROM travaux WHERE titre='Remplacement camera site Lyon 1'), 'Depose ancienne camera', 'Retirer la camera defectueuse', 'En_attente', 'Moyenne', now() + interval '12 hours');

INSERT INTO travaux_materiel (travaux_id, materiel_id, quantite, commentaire)
VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A'), (SELECT id FROM materiel WHERE reference='TEMP001'), 5, 'Capteurs commandes pour installation'),
((SELECT id FROM travaux WHERE titre='Remplacement camera site Lyon 1'), (SELECT id FROM materiel WHERE reference='CAMIP001'), 1, 'Camera de remplacement');

INSERT INTO rendu_travaux (travaux_id, resume, valeur)
VALUES
((SELECT id FROM travaux WHERE titre='Verification generale site Paris'), 'Verification annuelle terminee avec succes', 'Tous les systemes sont conformes');

INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
VALUES
('rendu_travaux_1.jpg', 'image/jpeg', 20480, '\xABCD1234', 'Photo rendu travaux', 'AGT003', 'RenduTravaux', (SELECT id FROM rendu_travaux LIMIT 1));

INSERT INTO rendu_travaux_image (rendu_travaux_id, image_id)
VALUES
((SELECT id FROM rendu_travaux LIMIT 1), (SELECT id FROM images WHERE nom_fichier='rendu_travaux_1.jpg'));

INSERT INTO travaux_satisfaction (travaux_id, user_id, rating, comment, envoieok)
VALUES
((SELECT id FROM travaux WHERE titre='Verification generale site Paris'), (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), 5, 'Travaux tres bien executes', TRUE);

-- 12) Documents
INSERT INTO documents_repertoire (cible_type, cible_id, nom_fichier, type_mime, commentaire, auteur_matricule)
VALUES
('DOE', (SELECT id FROM doe WHERE titre='DOE Paris 2026'), 'plan_site_paris.pdf', 'application/pdf', 'Plan detaille du site Paris', 'AGT002'),
('Ticket', (SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), 'checklist_ticket_42.pdf', 'application/pdf', 'Checklist de suivi', 'AGT001');

-- 13) Messagerie demande client
INSERT INTO messagerie (conversation_id, sender_id, receiver_id, ticket_id, demande_id, client_id, body, is_read, created_at)
VALUES
('demande-1', (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), (SELECT id FROM users WHERE email='maboujunior777@gmail.com'),
 (SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), (SELECT id FROM demande_client WHERE titre='Demande de capteurs'), (SELECT id FROM client WHERE nom_client='Client ACME'),
 'Bonjour, pouvez-vous confirmer la prise en charge de ma demande de capteurs ?', TRUE, now() - interval '3 days'),
('demande-1', (SELECT id FROM users WHERE email='maboujunior777@gmail.com'), (SELECT id FROM users WHERE email='takotuemabou@outlook.com'),
 (SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), (SELECT id FROM demande_client WHERE titre='Demande de capteurs'), (SELECT id FROM client WHERE nom_client='Client ACME'),
 'Oui, la demande est bien prise en charge. Intervention planifiee.', TRUE, now() - interval '2 days 22 hours'),
('demande-1', (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), (SELECT id FROM users WHERE email='maboujunior777@gmail.com'),
 (SELECT id FROM ticket WHERE titre='Ticket Semaine 42'), (SELECT id FROM demande_client WHERE titre='Demande de capteurs'), (SELECT id FROM client WHERE nom_client='Client ACME'),
 'Parfait, merci pour le retour.', FALSE, now() - interval '2 days 20 hours'),
('demande-2', (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), (SELECT id FROM users WHERE email='channelhongnia@gmail.com'),
 (SELECT id FROM ticket WHERE titre='Ticket Urgent Camera'), (SELECT id FROM demande_client WHERE titre='Probleme camera'), (SELECT id FROM client WHERE nom_client='Client ACME'),
 'La camera est toujours en panne. Avez-vous une date ?', TRUE, now() - interval '1 day 8 hours'),
('demande-2', (SELECT id FROM users WHERE email='channelhongnia@gmail.com'), (SELECT id FROM users WHERE email='takotuemabou@outlook.com'),
 (SELECT id FROM ticket WHERE titre='Ticket Urgent Camera'), (SELECT id FROM demande_client WHERE titre='Probleme camera'), (SELECT id FROM client WHERE nom_client='Client ACME'),
 'Remplacement prevu demain matin.', FALSE, now() - interval '1 day 6 hours'),
('demande-3', (SELECT id FROM users WHERE email='takotuemabou@outlook.com'), (SELECT id FROM users WHERE email='maboujunior777@gmail.com'),
 (SELECT id FROM ticket WHERE titre='Ticket Preventif Paris'), (SELECT id FROM demande_client WHERE titre='Maintenance preventive'), (SELECT id FROM client WHERE nom_client='Client ACME'),
 'Merci pour la maintenance preventive.', TRUE, now() - interval '12 hours'),
('demande-3', (SELECT id FROM users WHERE email='maboujunior777@gmail.com'), (SELECT id FROM users WHERE email='takotuemabou@outlook.com'),
 (SELECT id FROM ticket WHERE titre='Ticket Preventif Paris'), (SELECT id FROM demande_client WHERE titre='Maintenance preventive'), (SELECT id FROM client WHERE nom_client='Client ACME'),
 'Avec plaisir, le ticket est cloture.', FALSE, now() - interval '10 hours');

COMMIT;

-- 14) Contrôles de cohérence rapides
SELECT 'users' AS table_name, count(*) AS n FROM users
UNION ALL SELECT 'agent', count(*) FROM agent
UNION ALL SELECT 'client', count(*) FROM client
UNION ALL SELECT 'association', count(*) FROM association
UNION ALL SELECT 'site', count(*) FROM site
UNION ALL SELECT 'affaire', count(*) FROM affaire
UNION ALL SELECT 'doe', count(*) FROM doe
UNION ALL SELECT 'demande_client', count(*) FROM demande_client
UNION ALL SELECT 'ticket', count(*) FROM ticket
UNION ALL SELECT 'ticket_agent', count(*) FROM ticket_agent
UNION ALL SELECT 'intervention', count(*) FROM intervention
UNION ALL SELECT 'travaux', count(*) FROM travaux
UNION ALL SELECT 'demande_client_travaux', count(*) FROM demande_client_travaux
UNION ALL SELECT 'messagerie', count(*) FROM messagerie;
