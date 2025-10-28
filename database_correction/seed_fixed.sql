-- ============================================================================
-- SEED COMPLET – pur SQL, compatible Heroku (sans DO $$)
-- Couvre toutes les tables listées par \dt, avec données 2025 (12 mois)
-- ============================================================================

-- 0) Nettoyage (réinitialise les id et respecte les FK)
-- TRUNCATE
--   rendu_intervention_image, materiel_image, documents_repertoire, images,
--   rapport_ticket, rendezvous, intervention_materiel, rendu_intervention,
--   intervention, ticket_responsable, ticket_agent, ticket,
--   site_responsable, site_agent, site_affaire,
--   doe, affaire, site, client,
--   achat, reglement, facture,
--   agent_fonction, agent_equipe, agence_membre, equipe, fonction,
--   agent, agence, users, password_reset_tokens,
--   adresse
-- RESTART IDENTITY CASCADE;

-- 1) USERS
INSERT INTO users (email, roles, password) VALUES
('admin@app.com', '["ROLE_ADMIN"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'),
('sophie.martin@app.com', '["ROLE_USER"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'),
('jean.dupont@app.com',  '["ROLE_USER"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq');

-- 2) ADRESSE + AGENCE
INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays) VALUES
('Siège Paris', '10 Rue Lafayette', '75009', 'Paris', 'France'),
('Agence Lyon', '25 Avenue Foch',  '69006', 'Lyon',  'France');

INSERT INTO agence (titre, designation, telephone, email)
VALUES
('Agence Paris', 'Agence principale Île-de-France', '0102030405', 'paris@agence.fr'),
('Agence Lyon',  'Agence secondaire Rhône-Alpes',   '0472000000', 'lyon@agence.fr');

-- 3) AGENT (avec tel présent dans ton schéma actuel)
INSERT INTO agent (matricule, nom, prenom, email, tel, admin, actif, agence_id, user_id)
VALUES
('AGT001', 'Dupont',  'Jean',   'jean.dupont@app.com',  '0600000001', TRUE,  TRUE,  1, 3),
('AGT002', 'Martin',  'Sophie', 'sophie.martin@app.com','0600000002', FALSE, TRUE,  2, 2);

-- CLIENTS
INSERT INTO client (
    nom_client, representant_nom, representant_email, representant_tel, adresse_id, commentaire
)
VALUES
('EDF Renouvelables', 'Durand Pierre', 'pierre.durand@edf-renouvelables.fr', '0155555555', 1, 'Client historique – parc solaire'),
('ENGIE Solutions', 'Martin Sophie', 'sophie.martin@engie.fr', '0166666666', 2, 'Client B2B – maintenance hydraulique');

INSERT INTO site (client_id, nom_site, adresse_id)
VALUES
(1, 'Site Solaire Paris 15', 1),
(2, 'Site Hydro Lyon',       2);

-- 5) AFFAIRE + DOE + liaisons SITE_AFFAIRE
INSERT INTO affaire (client_id, nom_affaire, description)
VALUES
(1, 'AFF-2025-PARIS', 'Installation / maintenance PV – Paris'),
(2, 'AFF-2025-LYON',  'Maintenance hydraulique – Lyon');

INSERT INTO doe (site_id, affaire_id, titre)
VALUES
(1, 1, 'DOE Paris 2025'),
(2, 2, 'DOE Lyon 2025');

INSERT INTO site_affaire (site_id, affaire_id)
VALUES
(1, 1),
(2, 2);

-- 6) FONCTION / EQUIPE / LIENS RH
INSERT INTO fonction (code, libelle) VALUES ('TECH','Technicien'), ('CHEF','Chef de projet');
INSERT INTO equipe (agence_id, nom)       VALUES (1, 'Equipe Paris'), (2, 'Equipe Lyon');

INSERT INTO agent_fonction (agent_matricule, fonction_id) VALUES
('AGT001', 1), ('AGT002', 2);

INSERT INTO agent_equipe (agent_matricule, equipe_id) VALUES
('AGT001', 1), ('AGT002', 2);

INSERT INTO agence_membre (agence_id, agent_matricule, role)
VALUES (1, 'AGT001', 'Admin'), (2, 'AGT002', 'Membre');

-- 7) PASSEPORT / FORMATION (si présents dans ton schéma – colonnes usuelles)
-- Ajuste les noms de colonnes si différents chez toi.
INSERT INTO passeport (agent_matricule, permis, habilitations, date_expiration)
VALUES
('AGT001', 'B', 'H0B0',       '2026-06-30'),
('AGT002', 'B', 'B1T – Élec', '2026-09-30');

INSERT INTO formation (agent_matricule, "type", libelle, date_obtention, date_validite)
VALUES
('AGT001', 'Habilitation'::type_formation, 'H0B0', '2025-01-15', '2026-01-15'),
('AGT002', 'Certification'::type_formation, 'B1T Élec', '2025-02-20', '2027-02-20');

-- 8) SITE_AGENT / SITE_RESPONSABLE (liaisons)
INSERT INTO site_agent (site_id, agent_matricule) VALUES (1,'AGT001'), (2,'AGT002');
INSERT INTO site_responsable (site_id, agent_matricule) VALUES (1,'AGT001'), (2,'AGT002');

-- 9) TICKETS sur 12 mois (2025) – 12 pour Paris + 12 pour Lyon (24 total)
-- Paris (affaire_id=1, doe_id=1) : Janv→Déc
INSERT INTO ticket (doe_id, affaire_id, titre, description, etat) VALUES
(1,1,'Ticket Janv Paris','Inspection janvier 2025','En_cours'),
(1,1,'Ticket Fev Paris','Inspection février 2025','Termine'),
(1,1,'Ticket Mars Paris','Inspection mars 2025','En_cours'),
(1,1,'Ticket Avr Paris','Inspection avril 2025','Termine'),
(1,1,'Ticket Mai Paris','Inspection mai 2025','En_cours'),
(1,1,'Ticket Juin Paris','Inspection juin 2025','En_cours'),
(1,1,'Ticket Juil Paris','Inspection juillet 2025','Termine'),
(1,1,'Ticket Aout Paris','Inspection août 2025','Termine'),
(1,1,'Ticket Sept Paris','Inspection septembre 2025','En_cours'),
(1,1,'Ticket Oct Paris','Inspection octobre 2025','En_cours'),
(1,1,'Ticket Nov Paris','Inspection novembre 2025','En_cours'),
(1,1,'Ticket Dec Paris','Inspection décembre 2025','Termine');

-- Lyon (affaire_id=2, doe_id=2) : Janv→Déc
INSERT INTO ticket (doe_id, affaire_id, titre, description, etat) VALUES
(2,2,'Ticket Janv Lyon','Maintenance janvier 2025','En_cours'),
(2,2,'Ticket Fev Lyon','Maintenance février 2025','Termine'),
(2,2,'Ticket Mars Lyon','Maintenance mars 2025','En_cours'),
(2,2,'Ticket Avr Lyon','Maintenance avril 2025','Termine'),
(2,2,'Ticket Mai Lyon','Maintenance mai 2025','En_cours'),
(2,2,'Ticket Juin Lyon','Maintenance juin 2025','En_cours'),
(2,2,'Ticket Juil Lyon','Maintenance juillet 2025','Termine'),
(2,2,'Ticket Aout Lyon','Maintenance août 2025','Termine'),
(2,2,'Ticket Sept Lyon','Maintenance septembre 2025','En_cours'),
(2,2,'Ticket Oct Lyon','Maintenance octobre 2025','En_cours'),
(2,2,'Ticket Nov Lyon','Maintenance novembre 2025','En_cours'),
(2,2,'Ticket Dec Lyon','Maintenance décembre 2025','Termine');

-- 10) TICKET_AGENT / TICKET_RESPONSABLE (ex. Paris → AGT001, Lyon → AGT002)
-- Lie les 24 tickets aux agents correspondants.
-- Paris (tickets id 1..12) → AGT001
INSERT INTO ticket_agent (ticket_id, agent_matricule) VALUES
(1,'AGT001'),(2,'AGT001'),(3,'AGT001'),(4,'AGT001'),(5,'AGT001'),(6,'AGT001'),
(7,'AGT001'),(8,'AGT001'),(9,'AGT001'),(10,'AGT001'),(11,'AGT001'),(12,'AGT001');

INSERT INTO ticket_responsable (ticket_id, agent_matricule) VALUES
(1,'AGT001'),(2,'AGT001'),(3,'AGT001'),(4,'AGT001'),(5,'AGT001'),(6,'AGT001'),
(7,'AGT001'),(8,'AGT001'),(9,'AGT001'),(10,'AGT001'),(11,'AGT001'),(12,'AGT001');

-- Lyon (tickets id 13..24) → AGT002
INSERT INTO ticket_agent (ticket_id, agent_matricule) VALUES
(13,'AGT002'),(14,'AGT002'),(15,'AGT002'),(16,'AGT002'),(17,'AGT002'),(18,'AGT002'),
(19,'AGT002'),(20,'AGT002'),(21,'AGT002'),(22,'AGT002'),(23,'AGT002'),(24,'AGT002');

INSERT INTO ticket_responsable (ticket_id, agent_matricule) VALUES
(13,'AGT002'),(14,'AGT002'),(15,'AGT002'),(16,'AGT002'),(17,'AGT002'),(18,'AGT002'),
(19,'AGT002'),(20,'AGT002'),(21,'AGT002'),(22,'AGT002'),(23,'AGT002'),(24,'AGT002');

-- 11) INTERVENTIONS : 1 par ticket, avec dates réalistes 2025
INSERT INTO intervention (ticket_id, date_debut, intervention_precedente_id, status) VALUES
(1,'2025-01-12',4,'Termine'),
(2,'2025-02-16',3,'Termine'),
(3,'2025-03-20',5,'En_cours'),
(4,'2025-04-10',2,'Termine'),
(5,'2025-05-18',4,'En_cours'),
(6,'2025-06-22',6,'En_cours'),
(7,'2025-07-05',3,'Termine'),
(8,'2025-08-09',4,'Termine'),
(9,'2025-09-12',5,'En_cours'),
(10,'2025-10-15',3,'En_cours'),
(11,'2025-11-10',5,'En_cours'),
(12,'2025-12-07',4,'Termine'),
(13,'2025-01-14',3,'Termine'),
(14,'2025-02-18',4,'Termine'),
(15,'2025-03-22',5,'En_cours'),
(16,'2025-04-12',3,'Termine'),
(17,'2025-05-20',4,'En_cours'),
(18,'2025-06-24',5,'En_cours'),
(19,'2025-07-07',3,'Termine'),
(20,'2025-08-11',4,'Termine'),
(21,'2025-09-14',5,'En_cours'),
(22,'2025-10-17',3,'En_cours'),
(23,'2025-11-12',4,'En_cours'),
(24,'2025-12-09',4,'Termine');

-- ======================================================
-- 12) MATERIEL + MATERIEL_IMAGE + INTERVENTION_MATERIEL
-- ======================================================

-- Matériels disponibles
INSERT INTO materiel (reference, designation, categorie, fabricant, prix_achat, commentaire)
VALUES
('REF001', 'Capteur Solaire 450W', 'Énergie', 'SunPower', 280.00, 'Panneau photovoltaïque dernière génération'),
('REF002', 'Convertisseur Triphasé', 'Électrique', 'Schneider', 540.00, 'Utilisé sur installation Lyon'),
('REF003', 'Pompe Hydraulique', 'Hydraulique', 'Grundfos', 650.00, 'Maintenance annuelle requise');

-- Lier quelques matériels aux interventions
INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire)
VALUES
(1, 1, 2, 'Remplacement capteurs'),
(2, 2, 1, 'Installation neuve'),
(3, 3, 1, 'Révision pompe'),
(4, 1, 1, 'Contrôle tension'),
(5, 2, 1, 'Test de puissance'),
(6, 3, 1, 'Changement joint');

-- Images liées à du matériel
INSERT INTO materiel_image (materiel_id, nom_fichier, type_mime)
VALUES
(1, 'capteur.jpg', 'image/jpeg'),
(2, 'convertisseur.jpg', 'image/jpeg'),
(3, 'pompe.jpg', 'image/jpeg');

-- ======================================================
-- 13) RENDU_INTERVENTION + RENDU_INTERVENTION_IMAGE
-- ======================================================

INSERT INTO rendu_intervention (intervention_id, resume)
VALUES
(1, 'Vérification des connexions'),
(2, 'Remplacement convertisseur'),
(3, 'Inspection câblage'),
(4, 'Nettoyage capteurs'),
(5, 'Mesure rendement'),
(6, 'Révision pompe hydraulique');

-- Associe les images aux rendus
INSERT INTO rendu_intervention_image (rendu_intervention_id, image_id)
VALUES (1, 1), (3, 2);

-- ======================================================
-- 14) IMAGES + DOCUMENTS_REPERTOIRE
-- ======================================================

INSERT INTO images (nom_fichier, type_mime, taille_octets, image_blob, auteur_matricule, cible_type, cible_id)
VALUES
('photo1.jpg', 'image/jpeg', 51200, decode('FFD8FFE000104A4649460001','hex'), 'AGT001', 'Ticket', 1),
('photo2.jpg', 'image/jpeg', 61440, decode('FFD8FFE000104A4649460001','hex'), 'AGT002', 'Intervention', 3);

INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier)
VALUES
('Ticket', 1, 'Document', 'rapport_janv.pdf'),
('Ticket', 2, 'Document', 'rapport_fev.pdf'),
('Intervention', 3, 'Document', 'rapport_interv_mars.pdf');

-- ======================================================
-- 15) RENDEZVOUS + RAPPORT_TICKET
-- ======================================================

INSERT INTO rendezvous (titre, description, date_debut, date_fin, statut, sujet, intervention_id, site_id)
VALUES
('RDV Paris Janv', 'Planification intervention', '2025-01-10 09:00', '2025-01-10 10:00', 'Planifie', 'intervention', 1, 1),
('RDV Lyon Fev',  'Planification intervention', '2025-02-12 14:00', '2025-02-12 15:00', 'Planifie', 'intervention', 2, 2);

INSERT INTO rapport_ticket (ticket_id, matricule, commentaire_interne, etat)
VALUES
(1, 'AGT001', 'RAS – maintenance OK', 'Termine'),
(2, 'AGT002', 'Remplacement convertisseur – OK', 'Termine');

-- ======================================================
-- 16) FINANCIER : ACHAT / FACTURE / REGLEMENT
-- ======================================================

INSERT INTO achat (reference, affaire_id, site_id, statut)
VALUES
('ACH001', 1, 1, 'Commande'),
('ACH002', 2, 2, 'Recu');

INSERT INTO facture (client_id, affaire_id, statut)
VALUES
(1, 1, 'Emise'),
(2, 2, 'Payee');

INSERT INTO reglement (facture_id, montant)
VALUES
(2, 3500.00);


-- 17) AUDIT_LOG (entrée de test)
-- Ajuste les colonnes si ton audit_log diffère (ex: action, entity, entity_id, auteur, created_at)
INSERT INTO audit_log (action, entity, entity_id, auteur, created_at)
SELECT 'seed','ticket',1,'AGT001', now()
WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action='seed' AND entity='ticket' AND entity_id='1' AND auteur='AGT001');

-- NOTE : table "session" laissée vide (gérée par le store de session côté app).

-- ============================================================================
-- FIN SEED COMPLET
-- ============================================================================
