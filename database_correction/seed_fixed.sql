-- seed_fixed.sql
-- Jeu de données complet aligné avec init_fixed.sql
-- Exécuter après création du schéma : psql "$DATABASE_URL" -f database_correction/init_fixed.sql
-- Puis : psql "$DATABASE_URL" -f database_correction/seed_fixed.sql

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
  users
RESTART IDENTITY CASCADE;

-- Users
INSERT INTO users (email, roles, password) VALUES
('admin@example.com',  '["ROLE_ADMIN"]',  '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'),
('client@example.com', '["ROLE_CLIENT"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'),
('agent1@example.com', '["ROLE_USER"]',   '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'),
('agent2@example.com', '["ROLE_USER"]',   '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'),
('agent3@example.com', '["ROLE_USER"]',   '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'),
('representant@example.com', '["ROLE_CLIENT"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq');

-- Adresses
INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays) VALUES
('Siège Marseille', '123 La Canebière', '13001', 'Marseille', 'France'),
('Dépôt Prado', '456 Boulevard du Prado', '13008', 'Marseille', 'France');

-- Agence
INSERT INTO agence (titre, designation, telephone, email, adresse_id) VALUES
('Agence Marseille', 'Agence Sud', '0491000000', 'marseille@exemple.fr', 1);

-- Fonctions / Équipes
INSERT INTO fonction (code, libelle) VALUES ('TECH','Technicien'), ('CHEF','Chef de projet');
INSERT INTO equipe (agence_id, nom) VALUES (1,'Equipe Sud'), (1,'Equipe Projet');

-- Agents
INSERT INTO agent (matricule, nom, prenom, email, tel, admin, actif, agence_id, user_id) VALUES
('AGT001','Dupont','Jean','agent1@example.com','0600000001', TRUE, TRUE, 1, 3),
('AGT002','Martin','Sophie','agent2@example.com','0600000002', FALSE, TRUE, 1, 4),
('AGT003','Durand','Paul','agent3@example.com','0600000003', FALSE, TRUE, 1, 5);

INSERT INTO agent_fonction (agent_matricule, fonction_id, principal) VALUES
('AGT001', 2, TRUE), ('AGT002', 1, TRUE), ('AGT003', 1, TRUE);

INSERT INTO agent_equipe (equipe_id, agent_matricule) VALUES
(1,'AGT001'), (1,'AGT002'), (2,'AGT003');

INSERT INTO agence_membre (agence_id, agent_matricule, role) VALUES
(1,'AGT001','Admin'), (1,'AGT002','Membre'), (1,'AGT003','Membre');

-- Clients + représentants
INSERT INTO client (nom_client, representant_email, adresse_id, user_id) VALUES
('Grand Port Maritime de Marseille', 'client@example.com', 1, 2),
('Aéroport Marseille Provence', 'client2@example.com', 2, NULL);

INSERT INTO client_representant (client_id, user_id, nom, email, tel, fonction) VALUES
(1, 6, 'Marie Responsable', 'representant@example.com', '0611223344', 'Responsable site'),
(2, 6, 'Marie Responsable', 'representant@example.com', '0611223344', 'Responsable site');

-- Sites
INSERT INTO site (nom_site, client_id, adresse_id, statut) VALUES
('Terminal Croisières', 1, 1, 'Actif'),
('Hangar J1', 1, 1, 'Actif'),
('Terminal Hall A', 2, 2, 'Inactif');

INSERT INTO site_agent (site_id, agent_matricule) VALUES
(1,'AGT001'), (2,'AGT002'), (3,'AGT003');
INSERT INTO site_responsable (site_id, agent_matricule, role) VALUES
(1,'AGT001','Responsable'), (2,'AGT002','Responsable');

-- Affaires / DOE / Site_Affaire
INSERT INTO affaire (nom_affaire, numero_affaire, client_id, description) VALUES
('AFF-2025-GTB','NUM-GTB-001',1,'Affaire GTB portuaire'),
('AFF-2025-CAM','NUM-CAM-002',1,'Surveillance vidéo Hangar');
INSERT INTO site_affaire (site_id, affaire_id) VALUES (1,1),(2,2);
INSERT INTO doe (site_id, affaire_id, titre, description) VALUES
(1,1,'DOE GTB Terminal','Dossier GTB complet'),
(2,2,'DOE Caméras Hangar','Dossier caméras');

-- Associations / contrats
INSERT INTO association (titre, email_comptabilite, adresse_id) VALUES ('Zone Portuaire Nord','compta-port@example.com',1);
INSERT INTO association_site (association_id, site_id) VALUES (1,1),(1,2);
INSERT INTO association_responsable (association_id, agent_matricule) VALUES (1,'AGT001');
INSERT INTO association_agent (association_id, agent_matricule) VALUES (1,'AGT002');

INSERT INTO contrat (titre, date_debut) VALUES ('Contrat maintenance GTB','2025-01-01');
INSERT INTO contrat_site_association (contrat_id, site_id) VALUES (1,1);

-- Demandes
INSERT INTO demande_client (client_id, site_id, titre, description, status) VALUES
(1,1,'GTB en panne','Le chauffage ne répond plus.','En cours de traitement'),
(1,2,'Caméra HS Hangar','Caméra ne transmet plus.','Traitee'),
(2,3,'Accès badge Hall A','Badge ne fonctionne pas.','En cours de traitement');

-- Tickets
INSERT INTO ticket (doe_id, affaire_id, site_id, demande_id, responsable, titre, description, etat, date_debut, date_fin) VALUES
(1,1,1,1,'AGT001','Demande: GTB en panne','Ticket ouvert depuis la demande GTB.','En_cours','2025-01-15',NULL),
(2,2,2,2,'AGT002','Demande: Caméra HS','Ticket clos','Termine','2025-02-10','2025-02-12'),
(NULL,NULL,3,3,'AGT003','Badge Hall A','Création d''un nouvel accès.','En_cours','2025-03-05',NULL);

INSERT INTO ticket_agent (ticket_id, agent_matricule) VALUES (1,'AGT001'),(2,'AGT002'),(3,'AGT003');
INSERT INTO ticket_responsable (ticket_id, agent_matricule, role) VALUES (1,'AGT001','Responsable'),(2,'AGT002','Responsable'),(3,'AGT003','Responsab
le');
INSERT INTO ticket_satisfaction (ticket_id, rating, comment, envoieok) VALUES (2,5,'Service rapide et efficace.',TRUE);

-- Interventions
INSERT INTO intervention (ticket_id, site_id, demande_id, titre, description, date_debut, date_fin, status, ticket_agent_id, metier) VALUES
(1,1,1,'Diagnostic','Relevé des automates GTB.','2025-01-16',NULL,'En_attente',(SELECT id FROM ticket_agent WHERE ticket_id=1 LIMIT 1),'GTB'),       
(1,1,1,'Correction GTB','Remplacement automate GTB.','2025-01-20',NULL,'En_attente',(SELECT id FROM ticket_agent WHERE ticket_id=1 LIMIT 1),'GTB'),  
(2,2,2,'Remplacement caméra','Caméra remplacée.','2025-02-11','2025-02-11','Termine',(SELECT id FROM ticket_agent WHERE ticket_id=2 LIMIT 1),'Video')
,
(3,3,3,'Pose lecteur badge','Installation d''un nouvel accès.','2025-03-06',NULL,'En_attente',(SELECT id FROM ticket_agent WHERE ticket_id=3 LIMIT 1),'Control_Acces');

-- Matériel catalogue + commandes
INSERT INTO materiel_catalogue (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, actif) VALUES
('Capteur Solaire 450W','REF001','Capteur Solaire 450W','Énergie','SunPower','Fournisseur Solaire',0,'Classe A',280.00,'Panneau PV dernière génération','GTB',TRUE),
('Caméra IP 4K','REF002','Caméra IP 4K','Sécurité','Hikvision','Fournisseur Sécurité',5,'Classe B',120.00,'Caméra haute résolution','Video',TRUE),   
('Lecteur RFID','REF003','Lecteur de badges RFID','Contrôle d''accès','HID','Fournisseur Accès',3,'Classe B',90.00,'Lecteur RFID pour portiques','Control_Acces',TRUE);

INSERT INTO materiel (titre, reference, designation, categorie, fabricant, fournisseur, remise_fournisseur, classe_materiel, prix_achat, commentaire, metier, commande_status) VALUES
('Capteur Solaire 450W','REF001','Capteur Solaire 450W','Énergie','SunPower','Fournisseur Solaire',0,'Classe A',280.00,'Commande capteur','GTB','En livraison'),
('Caméra IP 4K','REF002','Caméra IP 4K','Sécurité','Hikvision','Fournisseur Sécurité',5,'Classe B',120.00,'Commande caméra','Video','Reçu'),
('Lecteur RFID','REF003','Lecteur de badges RFID','Contrôle d''accès','HID','Fournisseur Accès',3,'Classe B',90.00,'Commande badge','Control_Acces','A commander');

INSERT INTO intervention_materiel (intervention_id, materiel_id, quantite, commentaire) VALUES
((SELECT id FROM intervention WHERE titre='Diagnostic' LIMIT 1),(SELECT id FROM materiel WHERE reference='REF001'),1,'Utilisé pour diagnostic'),     
((SELECT id FROM intervention WHERE titre='Remplacement caméra' LIMIT 1),(SELECT id FROM materiel WHERE reference='REF002'),2,'Pose caméra'),        
((SELECT id FROM intervention WHERE titre='Pose lecteur badge' LIMIT 1),(SELECT id FROM materiel WHERE reference='REF003'),1,'Installation badge');  

-- Rendezvous
INSERT INTO rendezvous (titre, description, date_rdv, date_fin, statut, sujet, intervention_id, site_id) VALUES
('RDV GTB Janvier','Planification diagnostic','2025-01-15 09:00','2025-01-15 10:00','Planifie','intervention',(SELECT id FROM intervention WHERE titr
e='Diagnostic' LIMIT 1),1),
('RDV Caméra','Remplacement caméra','2025-02-11 14:00','2025-02-11 15:00','Planifie','intervention',(SELECT id FROM intervention WHERE titre='Remplacement caméra' LIMIT 1),2);

-- Documents
INSERT INTO documents_repertoire (cible_type, cible_id, nature, nom_fichier) VALUES
('Ticket', 1, 'Document', 'rapport_ticket1.pdf'),
('Site', 1, 'Document', 'plan_site1.pdf');

-- Financier
INSERT INTO achat (reference, site_id, statut) VALUES ('ACH-GTB-001',1,'Commande');
INSERT INTO facture (client_id, affaire_id, association_id, statut) VALUES (1,1,1,'Emise');
INSERT INTO reglement (facture_id, montant) VALUES (1,1500.00);

-- Messagerie
INSERT INTO messagerie (conversation_id, sender_id, receiver_id, ticket_id, demande_id, client_id, body) VALUES
('demande-1', 1, 2, 1, 1, 1, 'Bonjour, nous avons bien reçu votre demande GTB.'),
('demande-1', 2, 1, 1, 1, 1, 'Merci, pouvez-vous intervenir cette semaine ?'),
('ticket-2', 1, 2, 2, 2, 1, 'Ticket caméra HS traité, retour à la normale.'),
('demande-3', 1, 2, 3, 3, 2, 'Nous allons planifier un créneau pour votre badge.'),
('ticket-3', 1, 2, 3, 3, 2, 'Pièce jointe badge');

INSERT INTO messagerie_attachment (message_id, file_blob, file_name, file_type, file_size) VALUES
((SELECT id FROM messagerie WHERE conversation_id='ticket-2' ORDER BY id DESC LIMIT 1), decode('526170706f727420696e74657276656e74696f6e2063616d657261','hex'), 'rapport.txt', 'text/plain', 28),
((SELECT id FROM messagerie WHERE conversation_id='ticket-3' ORDER BY id DESC LIMIT 1), decode('4e6f74696365206261646765','hex'), 'notice.txt', 'text/plain', 12);

COMMIT;