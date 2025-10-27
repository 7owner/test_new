-- --------------------------------------------------
-- Data seeding for the application (Node.js compatible)
-- Unique comment for debugging: V2_DEBUG_SEED_FIXED_20231026
-- --------------------------------------------------

-- Seed users (for admin and non-admin roles)
-- Passwords are bcrypt hashed (cost=10) to avoid storing plaintext credentials
INSERT INTO users (email, roles, password)
SELECT 'maboujunior777@gmail.com', '["ROLE_ADMIN"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq';

INSERT INTO users (email, roles, password)
SELECT 'takotuemabou@outlook.com', '["ROLE_USER"]', '$2b$10$FzYl.RlTXgB/sPKe7phzJuXk.uUfXWDWnevVIB4MuXc2NoIOW2WKq';

INSERT INTO users (email, roles, password)
SELECT 'pierre.bernard@example.com', '["ROLE_USER"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq';

INSERT INTO users (email, roles, password)
SELECT 'marie.petit@example.com', '["ROLE_USER"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq';

-- Seed addresses
INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays)
SELECT 'Siège', '10 Rue Centrale', '75001', 'Paris', 'France';

INSERT INTO adresse (libelle, ligne1, code_postal, ville, pays)
SELECT 'Entrepôt', '25 Avenue des Champs', '69001', 'Lyon', 'France';

-- Seed agencies
INSERT INTO agence (titre, designation, telephone, email)
SELECT 'Agence Paris', 'Agence principale Paris', '0102030405', 'paris@agence.fr';

INSERT INTO agence (titre, designation, telephone, email)
SELECT 'Agence Lyon', 'Agence secondaire Lyon', '0499999999', 'lyon@agence.fr';

-- Seed agents
INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT001', 'Dupont', 'Jean', FALSE, 'jean.dupont@example.com', '0612345678', TRUE,
       1, -- Agence Paris
       1; -- takotuemabou@outlook.com

INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT002', 'Martin', 'Sophie', TRUE, 'sophie.martin@example.com', '0687654321', TRUE,
       2, -- Agence Lyon
       2; -- maboujunior777@gmail.com

INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT003', 'Bernard', 'Pierre', FALSE, 'pierre.bernard@example.com', '0611223344', FALSE,
       1, -- Agence Paris
       3; -- pierre.bernard@example.com

INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT004', 'Petit', 'Marie', FALSE, 'marie.petit@example.com', '0655443322', TRUE,
       2, -- Agence Lyon
       4; -- marie.petit@example.com