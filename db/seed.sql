-- --------------------------------------------------
-- Data seeding for the application (Node.js compatible)
-- --------------------------------------------------

-- Seed addresses
INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays)
SELECT 'SiÃ¨ge', '10 Rue Centrale', '75001', 'Paris', 'France'
WHERE NOT EXISTS (SELECT 1 FROM adresse WHERE libelle = 'SiÃ¨ge');

INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays)
SELECT 'EntrepÃ´t', '25 Avenue des Champs', '69001', 'Lyon', 'France'
WHERE NOT EXISTS (SELECT 1 FROM adresse WHERE libelle = 'EntrepÃ´t');

-- Seed agencies
INSERT INTO agence (titre, designation, telephone, email)
SELECT 'Agence Paris', 'Agence principale Paris', '0102030405', 'paris@agence.fr'
WHERE NOT EXISTS (SELECT 1 FROM agence WHERE titre = 'Agence Paris');

INSERT INTO agence (titre, designation, telephone, email)
SELECT 'Agence Lyon', 'Agence secondaire Lyon', '0499999999', 'lyon@agence.fr'
WHERE NOT EXISTS (SELECT 1 FROM agence WHERE titre = 'Agence Lyon');

-- Seed users (for admin and non-admin roles)
-- Passwords are bcrypt hashed (cost=10) to avoid storing plaintext credentials
INSERT INTO users (email, roles, password)
SELECT 'maboujunior777@gmail.com', '["ROLE_ADMIN"]', '$2b$10$ZVi8PZCnI9RKYxXlUW7kUu3M98YhUipLuqnCb/X0JB0MfgqsKBn1W'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'maboujunior777@gmail.com');

INSERT INTO users (email, roles, password)
SELECT 'takotuemabou@outlook.com', '["ROLE_CLIENT"]', '$2b$10$ZVi8PZCnI9RKYxXlUW7kUu3M98YhUipLuqnCb/X0JB0MfgqsKBn1W'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'takotuemabou@outlook.com');

-- Seed agents
-- AGT001 mappÃ© Ã  l'utilisateur ROLE_USER (takotuemabou@outlook.com)
INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT001', 'Dupont', 'Jean', FALSE, 'takotuemabou@outlook.com', '0612345678', TRUE,
       (SELECT id FROM agence WHERE titre = 'Agence Paris' LIMIT 1),
       (SELECT id FROM users WHERE email = 'takotuemabou@outlook.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule = 'AGT001');

-- AGT002 mappÃ© Ã  l'utilisateur ROLE_ADMIN (maboujunior777@gmail.com)
INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT002', 'Martin', 'Sophie', TRUE, 'maboujunior777@gmail.com', '0687654321', TRUE,
       (SELECT id FROM agence WHERE titre = 'Agence Lyon' LIMIT 1),
       (SELECT id FROM users WHERE email = 'maboujunior777@gmail.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule = 'AGT002');

INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id)
SELECT 'AGT003', 'Bernard', 'Pierre', FALSE, 'pierre.bernard@example.com', '0611223344', FALSE,
       (SELECT id FROM agence WHERE titre = 'Agence Paris' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule = 'AGT003');

INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id)
SELECT 'AGT004', 'Petit', 'Marie', FALSE, 'marie.petit@example.com', '0655443322', TRUE,
       (SELECT id FROM agence WHERE titre = 'Agence Lyon' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule = 'AGT004');

-- Seed clients
INSERT INTO client (nom_client, representant_nom, representant_email)
SELECT 'Client ACME', 'Mme Martin', 'martin@acme.com'
WHERE NOT EXISTS (SELECT 1 FROM client WHERE nom_client = 'Client ACME');

-- Seed sites
INSERT INTO site (nom_site, commentaire, ticket, responsable_matricule)
SELECT 'Site Paris 1', 'Site de dÃ©monstration Ã  Paris', TRUE, NULL
WHERE NOT EXISTS (SELECT 1 FROM site WHERE nom_site = 'Site Paris 1');

INSERT INTO site (nom_site, commentaire, ticket, responsable_matricule)
SELECT 'Site Lyon 1', 'Site de dÃ©monstration Ã  Lyon', TRUE, 'AGT001'
WHERE NOT EXISTS (SELECT 1 FROM site WHERE nom_site = 'Site Lyon 1');

-- Seed affaires
INSERT INTO affaire (nom_affaire, client_id, description)
SELECT 'Contrat Ticket ACME', (SELECT id FROM client WHERE nom_client = 'Client ACME' LIMIT 1), 'Contrat annuel'
WHERE NOT EXISTS (SELECT 1 FROM affaire WHERE nom_affaire = 'Contrat Ticket ACME');

-- Link site and affaire
INSERT INTO site_affaire (site_id, affaire_id)
SELECT s.id, a.id
FROM (SELECT id FROM site WHERE nom_site = 'Site Paris 1' LIMIT 1) s,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Ticket ACME' LIMIT 1) a
WHERE NOT EXISTS (
  SELECT 1 FROM site_affaire WHERE site_id = s.id AND affaire_id = a.id
);

-- Seed DOE
INSERT INTO doe (site_id, affaire_id, titre, description)
SELECT s.id, a.id, 'DOE Paris 2025', 'Dossier des ouvrages exÃ©cutÃ©s'
FROM (SELECT id FROM site WHERE nom_site = 'Site Paris 1' LIMIT 1) s,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Ticket ACME' LIMIT 1) a
WHERE NOT EXISTS (SELECT 1 FROM doe WHERE titre = 'DOE Paris 2025');

-- Seed tickets (some ongoing and blocked)
INSERT INTO ticket (doe_id, affaire_id, titre, description, etat, responsable, date_debut)
SELECT d.id, a.id, 'Ticket Semaine 42', 'VÃ©rifications pÃ©riodiques', 'En_cours', 'AGT001', NOW() - INTERVAL '10 days'
FROM (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1) d,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Ticket ACME' LIMIT 1) a
WHERE NOT EXISTS (SELECT 1 FROM ticket WHERE titre = 'Ticket Semaine 42');

INSERT INTO ticket (doe_id, affaire_id, titre, description, etat, responsable, date_debut)
SELECT d.id, a.id, 'Ticket Urgente', 'Panne critique sur site', 'En_cours', 'AGT002', NOW() - INTERVAL '2 days'
FROM (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1) d,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Ticket ACME' LIMIT 1) a
WHERE NOT EXISTS (SELECT 1 FROM ticket WHERE titre = 'Ticket Urgente');

-- Seed interventions
INSERT INTO intervention (ticket_id, description, date_debut, status)
SELECT m.id, 'Intervention initiale', CURRENT_DATE - INTERVAL '1 day', 'Termine'
FROM (SELECT id FROM ticket WHERE titre = 'Ticket Semaine 42' LIMIT 1) m
WHERE NOT EXISTS (
  SELECT 1 FROM intervention WHERE description = 'Intervention initiale' AND ticket_id = m.id
);

INSERT INTO intervention (ticket_id, description, date_debut, status)
SELECT m.id, 'Intervention de suivi', CURRENT_DATE, 'En_cours'
FROM (SELECT id FROM ticket WHERE titre = 'Ticket Semaine 42' LIMIT 1) m
WHERE NOT EXISTS (
  SELECT 1 FROM intervention WHERE description = 'Intervention de suivi' AND ticket_id = m.id
);

-- Seed passeport for AGT001
INSERT INTO passeport (agent_matricule, permis, habilitations, certifications)
SELECT 'AGT001', 'Permis B', 'H0B0, BR', 'SST'
WHERE NOT EXISTS (SELECT 1 FROM passeport WHERE agent_matricule = 'AGT001');

-- Seed formation for AGT001
INSERT INTO formation (agent_matricule, type, libelle, date_obtention, date_expiration, organisme)
SELECT 'AGT001', 'Certification', 'CACES R489', CURRENT_DATE - INTERVAL '200 days', CURRENT_DATE + INTERVAL '165 days', 'Organisme X'
WHERE NOT EXISTS (SELECT 1 FROM formation WHERE agent_matricule = 'AGT001' AND libelle = 'CACES R489');

-- Seed rendu_intervention
INSERT INTO rendu_intervention (intervention_id, resume, valeur)
SELECT i.id, 'Rapport de vÃ©rification OK.', 'Conforme'
FROM (SELECT id FROM intervention WHERE description = 'Intervention initiale' LIMIT 1) i
WHERE NOT EXISTS (SELECT 1 FROM rendu_intervention WHERE resume = 'Rapport de vÃ©rification OK.');

-- Seed images for rendu_intervention
INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'rapport_int001_1.jpg', 'image/jpeg', 102400, '\xDEADBEEF', 'Photo avant intervention.', 'AGT001', 'RenduIntervention', (SELECT id FROM rendu_intervention WHERE resume = 'Rapport de vÃ©rification OK.' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'rapport_int001_1.jpg');

INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'rapport_int001_2.jpg', 'image/jpeg', 153600, '\xCAFEBABE', 'Photo aprÃ¨s rÃ©paration.', 'AGT001', 'RenduIntervention', (SELECT id FROM rendu_intervention WHERE resume = 'Rapport de vÃ©rification OK.' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'rapport_int001_2.jpg');

-- Seed documents for DOE
INSERT INTO documents_repertoire (cible_type, cible_id, nom_fichier, type_mime, commentaire, auteur_matricule)
SELECT 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1), 'plan_site_A.pdf', 'application/pdf', 'Plan dÃ©taillÃ© du site A.', 'AGT002'
WHERE NOT EXISTS (SELECT 1 FROM documents_repertoire WHERE nom_fichier = 'plan_site_A.pdf');

INSERT INTO documents_repertoire (cible_type, cible_id, nom_fichier, type_mime, commentaire, auteur_matricule)
SELECT 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1), 'rapport_audit_B.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Rapport d''audit de sÃ©curitÃ© du site B.', 'AGT002'
WHERE NOT EXISTS (SELECT 1 FROM documents_repertoire WHERE nom_fichier = 'rapport_audit_B.docx');

-- Seed images for DOE
INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'image_doe_1.jpg', 'image/jpeg', 51200, '\x12345678', 'Vue gÃ©nÃ©rale du site.', 'AGT002', 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'image_doe_1.jpg');

INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'image_doe_2.jpg', 'image/jpeg', 76800, '\x87654321', 'DÃ©tail d''un Ã©quipement.', 'AGT002', 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'image_doe_2.jpg');
