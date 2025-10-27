-- --------------------------------------------------
-- Data seeding for the application (Node.js compatible)
-- Unique comment for debugging: V2_DEBUG_SEED_FIXED_20231026
-- --------------------------------------------------

-- Seed users (for admin and non-admin roles)
-- Passwords are bcrypt hashed (cost=10) to avoid storing plaintext credentials
INSERT INTO users (email, roles, password)
SELECT 'maboujunior777@gmail.com', '["ROLE_ADMIN"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='maboujunior777@gmail.com');

INSERT INTO users (email, roles, password)
SELECT 'takotuemabou@outlook.com', '["ROLE_USER"]', '$2b$10$FzYl.RlTXgB/sPKe7phzJuXk.uUfXWDWnevVIB4MuXc2NoIOW2WKq'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='takotuemabou@outlook.com');

INSERT INTO users (email, roles, password)
SELECT 'pierre.bernard@example.com', '["ROLE_USER"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='pierre.bernard@example.com');

INSERT INTO users (email, roles, password)
SELECT 'marie.petit@example.com', '["ROLE_USER"]', '$2b$10$366vQ5ecgqIKKzKy8uPd.u7S63i2ngqJkfkIxg6yPxF1ccmX3fDIq'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='marie.petit@example.com');

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
-- AGT001 lié à l'utilisateur takotuemabou@outlook.com
INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT001', 'Dupont', 'Jean', FALSE, 'takotuemabou@outlook.com', '0612345678', TRUE,
       (SELECT id FROM agence WHERE titre = 'Agence Paris' LIMIT 1),
       (SELECT id FROM users WHERE email = 'takotuemabou@outlook.com' LIMIT 1);

-- AGT002 lié à l'utilisateur maboujunior777@gmail.com
INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT002', 'Martin', 'Sophie', TRUE, 'maboujunior777@gmail.com', '0687654321', TRUE,
       (SELECT id FROM agence WHERE titre = 'Agence Lyon' LIMIT 1),
       (SELECT id FROM users WHERE email = 'maboujunior777@gmail.com' LIMIT 1);

INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT003', 'Bernard', 'Pierre', FALSE, 'pierre.bernard@example.com', '0611223344', FALSE,
       (SELECT id FROM agence WHERE titre = 'Agence Paris' LIMIT 1),
       (SELECT id FROM users WHERE email = 'pierre.bernard@example.com' LIMIT 1);

INSERT INTO agent (matricule, nom, prenom, admin, email, tel, actif, agence_id, user_id)
SELECT 'AGT004', 'Petit', 'Marie', FALSE, 'marie.petit@example.com', '0655443322', TRUE,
       (SELECT id FROM agence WHERE titre = 'Agence Lyon' LIMIT 1),
       (SELECT id FROM users WHERE email = 'marie.petit@example.com' LIMIT 1);
