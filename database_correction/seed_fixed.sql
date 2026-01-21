BEGIN;

-- Réinitialisation propre
TRUNCATE
  messagerie_attachment,
  messagerie,
  intervention_materiel,
  intervention,
  ticket_satisfaction,
  ticket_responsable,
  ticket_agent,
  ticket,
  demande_client,
  site_affaire,
  doe,
  affaire,
  site_responsable,
  site_agent,
  site,
  client_representant,
  client,
  materiel,
  materiel_catalogue,
  association_site,
  association_agent,
  association_responsable,
  association,
  contrat_site_association,
  contrat,
  rendezvous,
  achat,
  reglement,
  facture,
  documents_repertoire,
  fonction,
  agent_fonction,
  agent_equipe,
  agence_membre,
  equipe,
  agent,
  agence,
  adresse,
  password_reset_tokens,
  users,
  travaux_agent,
  travaux_responsable,
  travaux_satisfaction,
  travaux_tache,
  rendu_travaux,
  rendu_travaux_image,
  travaux_materiel,
  demande_client_travaux,
  travaux
RESTART IDENTITY CASCADE;

-- Dummy image for rendu_travaux_image reference (will get id=1 as identity is reset)
INSERT INTO images (id, nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, cible_type, cible_id) VALUES
(1, 'dummy_image.jpg', 'image/jpeg', 1024, decode('000000', 'hex'), 'Image de placeholder', 'RenduTravaux', 1);
SELECT SETVAL('images_id_seq', (SELECT MAX(id) FROM images), TRUE);

-- --------------------------------------------------
-- Data seeding for the application (Node.js compatible)
-- --------------------------------------------------

-- Seed addresses
INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays)
SELECT 'Siège', '10 Rue Centrale', '75001', 'Paris', 'France'
WHERE NOT EXISTS (SELECT 1 FROM adresse WHERE libelle = 'Siège');

INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays)
SELECT 'Entrepôt', '25 Avenue des Champs', '69001', 'Lyon', 'France'
WHERE NOT EXISTS (SELECT 1 FROM adresse WHERE libelle = 'Entrepôt');

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
SELECT 'maboujunior777@gmail.com', '["ROLE_ADMIN"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'maboujunior777@gmail.com');

INSERT INTO users (email, roles, password)
SELECT 'takotuemabou@outlook.com', '["ROLE_USER"]', '$2b$10$FzYl.RlTXgB/sPKe7phzJuXk.uUfXWDWnevVIB4MuXc2NoIOW2WKq'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'takotuemabou@outlook.com');

-- Seed agents
-- AGT001 mappé à l'utilisateur ROLE_USER (takotuemabou@outlook.com)
INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT001', 'Dupont', 'Jean', FALSE, 'takotuemabou@outlook.com', '0612345678', TRUE,
       (SELECT id FROM agence WHERE titre = 'Agence Paris' LIMIT 1),
       (SELECT id FROM users WHERE email = 'takotuemabou@outlook.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule = 'AGT001');

-- AGT002 mappé à l'utilisateur ROLE_ADMIN (maboujunior777@gmail.com)
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
SELECT 'Site Paris 1', 'Site de démonstration à Paris', TRUE, NULL
WHERE NOT EXISTS (SELECT 1 FROM site WHERE nom_site = 'Site Paris 1');

INSERT INTO site (nom_site, commentaire, ticket, responsable_matricule)
SELECT 'Site Lyon 1', 'Site de démonstration à Lyon', TRUE, 'AGT001'
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
SELECT s.id, a.id, 'DOE Paris 2025', 'Dossier des ouvrages exécutés'
FROM (SELECT id FROM site WHERE nom_site = 'Site Paris 1' LIMIT 1) s,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Ticket ACME' LIMIT 1) a
WHERE NOT EXISTS (SELECT 1 FROM doe WHERE titre = 'DOE Paris 2025');

-- Seed tickets (some ongoing and blocked)
INSERT INTO ticket (doe_id, affaire_id, titre, description, etat, responsable, date_debut)
SELECT d.id, a.id, 'Ticket Semaine 42', 'Vérifications périodiques', 'En_cours', 'AGT001', NOW() - INTERVAL '10 days'
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
SELECT m.id, 'Intervention de suivi', CURRENT_DATE, 'En_attente'
FROM (SELECT id FROM ticket WHERE titre = 'Ticket Semaine 42' LIMIT 1) m
WHERE NOT EXISTS (
  SELECT 1 FROM intervention WHERE description = 'Intervention de suivi' AND ticket_id = m.id
);

-- Seed passeport for AGT001
INSERT INTO passeport (agent_matricule, permis, habilitations, certifications)
SELECT 'AGT001', 'Permis B', 'H0B0, BR', 'SST'
WHERE NOT EXISTS (SELECT 1 FROM passeport WHERE agent_matricule = 'AGT001');

-- Seed formation for AGT001
INSERT INTO formation (agent_matricule, type, libelle, date_obtention, date_validite)
SELECT 'AGT001', 'Certification', 'CACES R489', CURRENT_DATE - INTERVAL '200 days', CURRENT_DATE + INTERVAL '165 days'
WHERE NOT EXISTS (SELECT 1 FROM formation WHERE agent_matricule = 'AGT001' AND libelle = 'CACES R489');

-- Seed rendu_intervention
INSERT INTO rendu_intervention (intervention_id, resume, valeur)
SELECT i.id, 'Rapport de vérification OK.', 'Conforme'
FROM (SELECT id FROM intervention WHERE description = 'Intervention initiale' LIMIT 1) i
WHERE NOT EXISTS (SELECT 1 FROM rendu_intervention WHERE resume = 'Rapport de vérification OK.');

-- Seed images for rendu_intervention
INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'rapport_int001_1.jpg', 'image/jpeg', 102400, '\xDEADBEEF', 'Photo avant intervention.', 'AGT001', 'RenduIntervention', (SELECT id FROM rendu_intervention WHERE resume = 'Rapport de vérification OK.' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'rapport_int001_1.jpg');

INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'rapport_int001_2.jpg', 'image/jpeg', 153600, '\xCAFEBABE', 'Photo après réparation.', 'AGT001', 'RenduIntervention', (SELECT id FROM rendu_intervention WHERE resume = 'Rapport de vérification OK.' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'rapport_int001_2.jpg');

-- Seed documents for DOE
INSERT INTO documents_repertoire (cible_type, cible_id, nom_fichier, type_mime, commentaire, auteur_matricule)
SELECT 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1), 'plan_site_A.pdf', 'application/pdf', 'Plan détaillé du site A.', 'AGT002'
WHERE NOT EXISTS (SELECT 1 FROM documents_repertoire WHERE nom_fichier = 'plan_site_A.pdf');

INSERT INTO documents_repertoire (cible_type, cible_id, nom_fichier, type_mime, commentaire, auteur_matricule)
SELECT 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1), 'rapport_audit_B.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Rapport d''audit de sécurité du site B.', 'AGT002'
WHERE NOT EXISTS (SELECT 1 FROM documents_repertoire WHERE nom_fichier = 'rapport_audit_B.docx');

-- Seed images for DOE
INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'image_doe_1.jpg', 'image/jpeg', 51200, '\x12345678', 'Vue générale du site.', 'AGT002', 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'image_doe_1.jpg');

INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, commentaire_image, auteur_matricule, cible_type, cible_id)
SELECT 'image_doe_2.jpg', 'image/jpeg', 76800, '\x87654321', 'Détail d''un équipement.', 'AGT002', 'DOE', (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM images WHERE nom_fichier = 'image_doe_2.jpg');
-- Seed matériels catalogue
INSERT INTO materiel_catalogue (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif)
SELECT 'Capteur de température', 'TEMP001', 'Capteur de température ambiante', 'GTB', 'Siemens', 'Fournisseur A', 0, 'Classe A', 50.00, 'Capteur haute précision', 'GTB', TRUE
WHERE NOT EXISTS (SELECT 1 FROM materiel_catalogue WHERE reference = 'TEMP001');

INSERT INTO materiel_catalogue (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif)
SELECT 'Caméra dôme IP', 'CAMIP001', 'Caméra de surveillance IP dôme 5MP', 'Video', 'Hikvision', 'Fournisseur B', 10, 'Classe B', 250.00, 'Vision nocturne IR 30m', 'Video', TRUE
WHERE NOT EXISTS (SELECT 1 FROM materiel_catalogue WHERE reference = 'CAMIP001');

INSERT INTO materiel_catalogue (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif)
SELECT 'Lecteur de badges', 'RFID001', 'Lecteur de badges RFID multi-fréquences', 'Control_Acces', 'Vanderbilt', 'Fournisseur C', 5, 'Classe A', 150.00, 'Compatible MIFARE/DESFire', 'Control_Acces', TRUE
WHERE NOT EXISTS (SELECT 1 FROM materiel_catalogue WHERE reference = 'RFID001');

-- Seed matériels (commandes)
INSERT INTO materiel (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, commande_status, metier, agence_id)
SELECT 'Capteur de température', 'TEMP001', 'Capteur de température ambiante', 'GTB', 'Siemens', 'Fournisseur A', 0, 'Classe A', 50.00, 'Commande pour site Paris 1', 'A commander', 'GTB', (SELECT id FROM agence WHERE titre = 'Agence Paris' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM materiel WHERE reference = 'TEMP001' AND commentaire = 'Commande pour site Paris 1');

INSERT INTO materiel (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, commande_status, metier, agence_id)
SELECT 'Caméra dôme IP', 'CAMIP001', 'Caméra de surveillance IP dôme 5MP', 'Video', 'Hikvision', 'Fournisseur B', 10, 'Classe B', 250.00, 'Commande pour site Lyon 1', 'En livraison', 'Video', (SELECT id FROM agence WHERE titre = 'Agence Lyon' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM materiel WHERE reference = 'CAMIP001' AND commentaire = 'Commande pour site Lyon 1');

-- Seed demande_client
INSERT INTO demande_client (client_id, site_id, titre, description, status)
SELECT c.id, s.id, 'Demande de capteurs', 'Besoin de 5 capteurs de température supplémentaires', 'En cours de traitement'
FROM (SELECT id FROM client WHERE nom_client = 'Client ACME' LIMIT 1) c,
     (SELECT id FROM site WHERE nom_site = 'Site Paris 1' LIMIT 1) s
WHERE NOT EXISTS (SELECT 1 FROM demande_client WHERE titre = 'Demande de capteurs');

INSERT INTO demande_client (client_id, site_id, titre, description, status)
SELECT c.id, s.id, 'Problème caméra', 'Une caméra HS sur Site Lyon 1', 'En cours de traitement'
FROM (SELECT id FROM client WHERE nom_client = 'Client ACME' LIMIT 1) c,
     (SELECT id FROM site WHERE nom_site = 'Site Lyon 1' LIMIT 1) s
WHERE NOT EXISTS (SELECT 1 FROM demande_client WHERE titre = 'Problème caméra');

-- Seed interventions (associées aux demandes client)
INSERT INTO intervention (ticket_id, demande_id, description, date_debut, status, metier)
SELECT t.id, dc.id, 'Intervention suite demande capteurs', CURRENT_DATE, 'En_cours', 'GTB'
FROM (SELECT id FROM ticket WHERE titre = 'Ticket Semaine 42' LIMIT 1) t,
     (SELECT id FROM demande_client WHERE titre = 'Demande de capteurs' LIMIT 1) dc
WHERE NOT EXISTS (SELECT 1 FROM intervention WHERE description = 'Intervention suite demande capteurs');

INSERT INTO intervention (ticket_id, demande_id, description, date_debut, status, metier)
SELECT t.id, dc.id, 'Intervention remplacement caméra', CURRENT_DATE, 'En_cours', 'Video'
FROM (SELECT id FROM ticket WHERE titre = 'Ticket Urgente' LIMIT 1) t,
     (SELECT id FROM demande_client WHERE titre = 'Problème caméra' LIMIT 1) dc
WHERE NOT EXISTS (SELECT 1 FROM intervention WHERE description = 'Intervention remplacement caméra');

-- Seed intervention_materiel (utilisant les materiels commandés)
INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire)
SELECT i.id, m.id, 5, 'Capteurs pour installation'
FROM (SELECT id FROM intervention WHERE description = 'Intervention suite demande capteurs' LIMIT 1) i,
     (SELECT id FROM materiel WHERE reference = 'TEMP001' LIMIT 1) m
WHERE NOT EXISTS (SELECT 1 FROM intervention_materiel WHERE commentaire = 'Capteurs pour installation');

INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire)
SELECT i.id, m.id, 1, 'Caméra pour remplacement'
FROM (SELECT id FROM intervention WHERE description = 'Intervention remplacement caméra' LIMIT 1) i,
     (SELECT id FROM materiel WHERE reference = 'CAMIP001' LIMIT 1) m
WHERE NOT EXISTS (SELECT 1 FROM intervention_materiel WHERE commentaire = 'Caméra pour remplacement');

-- Seed du table rapport_ticket
INSERT INTO rapport_ticket (ticket_id, matricule, commentaire_interne, etat)
SELECT t.id, 'AGT001', 'Rapport initial après diagnostic.', 'En_cours'
FROM (SELECT id FROM ticket WHERE titre = 'Ticket Semaine 42' LIMIT 1) t
WHERE NOT EXISTS (SELECT 1 FROM rapport_ticket WHERE ticket_id = t.id);

INSERT INTO rapport_ticket (ticket_id, matricule, commentaire_interne, etat)
SELECT t.id, 'AGT002', 'Problème résolu. Fermeture du ticket.', 'Termine'
FROM (SELECT id FROM ticket WHERE titre = 'Ticket Urgente' LIMIT 1) t
WHERE NOT EXISTS (SELECT 1 FROM rapport_ticket WHERE ticket_id = t.id AND etat = 'Termine');

-- TRAVAUX Data
INSERT INTO travaux (doe_id, affaire_id, site_id, demande_id, titre, description, etat, priorite, date_debut, date_fin, date_echeance) VALUES
((SELECT id FROM doe WHERE titre='DOE Paris 2025' LIMIT 1), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME' LIMIT 1), (SELECT id FROM site WHERE nom_site='Site Paris 1' LIMIT 1), (SELECT id FROM demande_client WHERE titre='Demande de capteurs' LIMIT 1), 'Installation capteurs Hall A', 'Installation de 5 capteurs de température dans le Hall A.', 'A_faire', 'Haute', '2025-04-01 09:00', NULL, '2025-04-05 17:00'),
((SELECT id FROM doe WHERE titre='DOE Paris 2025' LIMIT 1), (SELECT id FROM affaire WHERE nom_affaire='Contrat Ticket ACME' LIMIT 1), (SELECT id FROM site WHERE nom_site='Site Lyon 1' LIMIT 1), (SELECT id FROM demande_client WHERE titre='Problème caméra' LIMIT 1), 'Remplacement caméra site Lyon 1', 'Remplacement de la caméra défectueuse.', 'En_cours', 'Moyenne', '2025-04-10 10:00', NULL, '2025-04-12 17:00'),
(NULL, NULL, (SELECT id FROM site WHERE nom_site='Site Paris 1' LIMIT 1), NULL, 'Vérification générale site Paris', 'Vérification annuelle des installations.', 'Termine', 'Basse', '2025-03-20 08:00', '2025-03-20 16:00', NULL);

-- Demande Client Travaux (linking specific demandes to travaux)
INSERT INTO demande_client_travaux (demande_id, travaux_id) VALUES
((SELECT id FROM demande_client WHERE titre='Demande de capteurs' LIMIT 1), (SELECT id FROM travaux WHERE titre='Installation capteurs Hall A' LIMIT 1)),
((SELECT id FROM demande_client WHERE titre='Problème caméra' LIMIT 1), (SELECT id FROM travaux WHERE titre='Remplacement caméra site Lyon 1' LIMIT 1));

-- Travaux Agent
INSERT INTO travaux_agent (travaux_id, agent_matricule, date_debut) VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A' LIMIT 1), 'AGT001', '2025-04-01 09:00'),
((SELECT id FROM travaux WHERE titre='Remplacement caméra site Lyon 1' LIMIT 1), 'AGT002', '2025-04-10 10:00'),
((SELECT id FROM travaux WHERE titre='Vérification générale site Paris' LIMIT 1), 'AGT003', '2025-03-20 08:00');

-- Travaux Responsable
INSERT INTO travaux_responsable (travaux_id, agent_matricule, role) VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A' LIMIT 1), 'AGT001', 'Principal'),
((SELECT id FROM travaux WHERE titre='Remplacement caméra site Lyon 1' LIMIT 1), 'AGT001', 'Secondaire');

-- Travaux Tache
INSERT INTO travaux_tache (travaux_id, titre, description, etat, priorite, date_echeance) VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A' LIMIT 1), 'Préparation du matériel', 'Rassembler les capteurs et outils nécessaires.', 'En_cours', 'Haute', '2025-04-01 12:00'),
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A' LIMIT 1), 'Câblage des capteurs', 'Procéder au câblage des nouveaux capteurs.', 'A_faire', 'Haute', '2025-04-03 17:00'),
((SELECT id FROM travaux WHERE titre='Remplacement caméra site Lyon 1' LIMIT 1), 'Dépose ancienne caméra', 'Retirer la caméra défectueuse du mur.', 'En_cours', 'Moyenne', '2025-04-10 12:00');

-- Travaux Materiel
INSERT INTO travaux_materiel (travaux_id, materiel_id, quantite, commentaire) VALUES
((SELECT id FROM travaux WHERE titre='Installation capteurs Hall A' LIMIT 1), (SELECT id FROM materiel WHERE reference='TEMP001' LIMIT 1), 5, 'Capteurs commandés pour l''installation'),
((SELECT id FROM travaux WHERE titre='Remplacement caméra site Lyon 1' LIMIT 1), (SELECT id FROM materiel WHERE reference='CAMIP001' LIMIT 1), 1, 'Caméra de remplacement');

-- Rendu Travaux
INSERT INTO rendu_travaux (travaux_id, resume, valeur) VALUES
((SELECT id FROM travaux WHERE titre='Vérification générale site Paris' LIMIT 1), 'Vérification annuelle terminée avec succès.', 'Tous les systèmes ont été vérifiés et sont conformes et opérationnels.');

-- Rendu Travaux Image (references the dummy image with id=1)
INSERT INTO rendu_travaux_image (rendu_travaux_id, image_id) VALUES
((SELECT id FROM rendu_travaux WHERE travaux_id=(SELECT id FROM travaux WHERE titre='Vérification générale site Paris' LIMIT 1) LIMIT 1), 1);

-- Update existing demande_materiel to link to travaux
UPDATE demande_materiel SET travaux_id = (SELECT id FROM travaux WHERE titre='Installation capteurs Hall A' LIMIT 1) WHERE titre='Demande de capteurs';
UPDATE demande_materiel SET travaux_id = (SELECT id FROM travaux WHERE titre='Remplacement caméra site Lyon 1' LIMIT 1) WHERE titre='Problème caméra';

COMMIT;