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

-- Seed agents
INSERT INTO agent (matricule, nom, email, tel, actif, agence_id)
SELECT 'A001', 'Dupont', 'a001@agence.fr', '0600000001', true,
       (SELECT id FROM agence WHERE titre = 'Agence Paris' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule = 'A001');

INSERT INTO agent (matricule, nom, email, tel, actif, agence_id)
SELECT 'A002', 'Durand', 'a002@agence.fr', '0600000002', true,
       (SELECT id FROM agence WHERE titre = 'Agence Lyon' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM agent WHERE matricule = 'A002');

-- Seed clients
INSERT INTO client (nom_client, representant_nom, representant_email)
SELECT 'Client ACME', 'Mme Martin', 'martin@acme.com'
WHERE NOT EXISTS (SELECT 1 FROM client WHERE nom_client = 'Client ACME');

-- Seed sites
INSERT INTO site (nom_site, commentaire)
SELECT 'Site Paris 1', 'Site de démonstration à Paris'
WHERE NOT EXISTS (SELECT 1 FROM site WHERE nom_site = 'Site Paris 1');

INSERT INTO site (nom_site, commentaire)
SELECT 'Site Lyon 1', 'Site de démonstration à Lyon'
WHERE NOT EXISTS (SELECT 1 FROM site WHERE nom_site = 'Site Lyon 1');

-- Seed affaires
INSERT INTO affaire (nom_affaire, client_id, description)
SELECT 'Contrat Maintenance ACME', (SELECT id FROM client WHERE nom_client = 'Client ACME' LIMIT 1), 'Contrat annuel'
WHERE NOT EXISTS (SELECT 1 FROM affaire WHERE nom_affaire = 'Contrat Maintenance ACME');

-- Link site and affaire
INSERT INTO site_affaire (site_id, affaire_id)
SELECT s.id, a.id
FROM (SELECT id FROM site WHERE nom_site = 'Site Paris 1' LIMIT 1) s,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Maintenance ACME' LIMIT 1) a
WHERE NOT EXISTS (
  SELECT 1 FROM site_affaire WHERE site_id = s.id AND affaire_id = a.id
);

-- Seed DOE
INSERT INTO doe (site_id, affaire_id, titre, description)
SELECT s.id, a.id, 'DOE Paris 2025', 'Dossier des ouvrages exécutés'
FROM (SELECT id FROM site WHERE nom_site = 'Site Paris 1' LIMIT 1) s,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Maintenance ACME' LIMIT 1) a
WHERE NOT EXISTS (SELECT 1 FROM doe WHERE titre = 'DOE Paris 2025');

-- Seed maintenances (some ongoing and blocked)
INSERT INTO maintenance (doe_id, affaire_id, titre, description, etat, responsable, date_debut)
SELECT d.id, a.id, 'Maintenance Semaine 42', 'Vérifications périodiques', 'En_cours', 'A001', NOW() - INTERVAL '10 days'
FROM (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1) d,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Maintenance ACME' LIMIT 1) a
WHERE NOT EXISTS (SELECT 1 FROM maintenance WHERE titre = 'Maintenance Semaine 42');

INSERT INTO maintenance (doe_id, affaire_id, titre, description, etat, responsable, date_debut)
SELECT d.id, a.id, 'Maintenance Urgente', 'Panne critique sur site', 'Bloque', 'A002', NOW() - INTERVAL '2 days'
FROM (SELECT id FROM doe WHERE titre = 'DOE Paris 2025' LIMIT 1) d,
     (SELECT id FROM affaire WHERE nom_affaire = 'Contrat Maintenance ACME' LIMIT 1) a
WHERE NOT EXISTS (SELECT 1 FROM maintenance WHERE titre = 'Maintenance Urgente');

-- Seed interventions
INSERT INTO intervention (maintenance_id, description, date_debut)
SELECT m.id, 'Intervention initiale', CURRENT_DATE - INTERVAL '1 day'
FROM (SELECT id FROM maintenance WHERE titre = 'Maintenance Semaine 42' LIMIT 1) m
WHERE NOT EXISTS (
  SELECT 1 FROM intervention WHERE description = 'Intervention initiale' AND maintenance_id = m.id
);

-- Seed passeport for A001
INSERT INTO passeport (agent_matricule, permis, habilitations, certifications)
SELECT 'A001', 'Permis B', 'H0B0, BR', 'SST'
WHERE NOT EXISTS (SELECT 1 FROM passeport WHERE agent_matricule = 'A001');

-- Seed formation for A001
INSERT INTO formation (agent_matricule, type, libelle, date_obtention, date_expiration, organisme)
SELECT 'A001', 'Certification', 'CACES R489', CURRENT_DATE - INTERVAL '200 days', CURRENT_DATE + INTERVAL '165 days', 'Organisme X'
WHERE NOT EXISTS (SELECT 1 FROM formation WHERE agent_matricule = 'A001' AND libelle = 'CACES R489');

