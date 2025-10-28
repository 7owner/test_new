-- --------------------------------------------------
-- ✅ PostgreSQL Schema Initialization (Corrected Order for Heroku)
-- --------------------------------------------------

-- Reset all previous tables (reverse dependency order)
DROP TABLE IF EXISTS rendu_intervention_image CASCADE;
DROP TABLE IF EXISTS rendu_intervention CASCADE;
DROP TABLE IF EXISTS documents_repertoire CASCADE;
DROP TABLE IF EXISTS images CASCADE;
DROP TABLE IF EXISTS reglement CASCADE;
DROP TABLE IF EXISTS facture CASCADE;
DROP TABLE IF EXISTS achat CASCADE;
DROP TABLE IF EXISTS agent_fonction CASCADE;
DROP TABLE IF EXISTS fonction CASCADE;
DROP TABLE IF EXISTS agent_equipe CASCADE;
DROP TABLE IF EXISTS agence_membre CASCADE;
DROP TABLE IF EXISTS equipe CASCADE;
DROP TABLE IF EXISTS rendezvous CASCADE;
DROP TABLE IF EXISTS materiel_image CASCADE;
DROP TABLE IF EXISTS intervention_materiel CASCADE;
DROP TABLE IF EXISTS materiel CASCADE;
DROP TABLE IF EXISTS intervention CASCADE;
DROP TABLE IF EXISTS rapport_ticket CASCADE;
DROP TABLE IF EXISTS ticket CASCADE;
DROP TABLE IF EXISTS site_affaire CASCADE;
DROP TABLE IF EXISTS doe CASCADE;
DROP TABLE IF EXISTS affaire CASCADE;
DROP TABLE IF EXISTS client CASCADE;
DROP TABLE IF EXISTS site CASCADE;
DROP TABLE IF EXISTS agence CASCADE;
DROP TABLE IF EXISTS adresse CASCADE;
DROP TABLE IF EXISTS agent CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS ticket_responsable CASCADE;

-- --------------------------------------------------
-- Enum types
-- --------------------------------------------------
DROP TYPE IF EXISTS statut_intervention CASCADE;
DROP TYPE IF EXISTS etat_rapport CASCADE;
DROP TYPE IF EXISTS sujet_type CASCADE;
DROP TYPE IF EXISTS statut_rdv CASCADE;
DROP TYPE IF EXISTS doc_cible_type CASCADE;
DROP TYPE IF EXISTS doc_nature CASCADE;
DROP TYPE IF EXISTS statut_achat CASCADE;
DROP TYPE IF EXISTS statut_facture CASCADE;
DROP TYPE IF EXISTS mode_reglement CASCADE;
DROP TYPE IF EXISTS role_agence CASCADE;
DROP TYPE IF EXISTS type_formation CASCADE;

CREATE TYPE statut_intervention AS ENUM ('Pas_commence','Bloque','En_attente','En_cours','Termine');
CREATE TYPE etat_rapport        AS ENUM ('Pas_commence','En_cours','Termine');
CREATE TYPE sujet_type          AS ENUM ('ticket','intervention');
CREATE TYPE statut_rdv          AS ENUM ('Planifie','Confirme','Termine','Annule');
CREATE TYPE doc_cible_type      AS ENUM (
    'Affaire','Agent','Agence','Adresse','Client','Site','RendezVous','DOE','Ticket','Intervention',
    'RapportTicket','Achat','Facture','Reglement','Formation','Fonction','RenduIntervention'
);
CREATE TYPE doc_nature          AS ENUM ('Document','Video','Audio','Autre');
CREATE TYPE statut_achat        AS ENUM ('Brouillon','Valide','Commande','Recu_partiel','Recu','Annule');
CREATE TYPE statut_facture      AS ENUM ('Brouillon','Emise','Envoyee','Payee_partielle','Payee','Annulee');
CREATE TYPE mode_reglement      AS ENUM ('Virement','Cheque','Carte','Especes','Traite','Autre');
CREATE TYPE role_agence         AS ENUM ('Admin','Manager','Membre');
CREATE TYPE type_formation      AS ENUM ('Habilitation','Certification','Permis');

-- --------------------------------------------------
-- CORE ENTITIES (Order fixed)
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(180) UNIQUE NOT NULL,
    roles JSONB NOT NULL,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adresse (
    id SERIAL PRIMARY KEY,
    libelle VARCHAR(255),
    ligne1 VARCHAR(255),
    ligne2 VARCHAR(255),
    code_postal VARCHAR(40),
    ville VARCHAR(120),
    region VARCHAR(120),
    pays VARCHAR(120),
    date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS agence (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    adresse_id BIGINT,
    telephone VARCHAR(50),
    email VARCHAR(255),
    date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS client (
    id SERIAL PRIMARY KEY,
    nom_client VARCHAR(255) NOT NULL,
    representant_nom VARCHAR(255),
    representant_email VARCHAR(255),
    representant_tel VARCHAR(50),
    adresse_id BIGINT,
    commentaire TEXT
);

CREATE TABLE IF NOT EXISTS site (
    id SERIAL PRIMARY KEY,
    nom_site VARCHAR(255) NOT NULL,
    adresse_id BIGINT,
    client_id BIGINT,
    commentaire TEXT,
    ticket BOOLEAN DEFAULT FALSE NOT NULL,
    responsable_matricule VARCHAR(20)
);

ALTER TABLE site ADD FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS affaire (
    id SERIAL PRIMARY KEY,
    nom_affaire VARCHAR(255) NOT NULL,
    client_id BIGINT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS agent (
    matricule VARCHAR(20) PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    agence_id BIGINT,
    user_id INTEGER UNIQUE,
    admin BOOLEAN DEFAULT FALSE,
    actif BOOLEAN DEFAULT TRUE,
    date_entree DATE,
    commentaire TEXT
);
ALTER TABLE agent ADD COLUMN IF NOT EXISTS tel VARCHAR(50);

CREATE TABLE IF NOT EXISTS passeport (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    permis VARCHAR(50),
    habilitations TEXT,
    date_expiration DATE
);

DROP TABLE IF EXISTS formation CASCADE;
CREATE TABLE IF NOT EXISTS formation (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    "type" type_formation,
    libelle VARCHAR(255) NOT NULL,
    date_obtention DATE,
    date_validite DATE
);

CREATE TABLE IF NOT EXISTS site_affaire (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL,
    affaire_id BIGINT
);

CREATE TABLE IF NOT EXISTS doe (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL,
    affaire_id BIGINT,
    titre VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket (
    id SERIAL PRIMARY KEY,
    doe_id BIGINT,
    affaire_id BIGINT,
    site_id BIGINT,
    titre VARCHAR(255),
    description TEXT,
    etat etat_rapport DEFAULT 'Pas_commence'
);

CREATE TABLE IF NOT EXISTS intervention (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    description TEXT,
    date_debut DATE NOT NULL,
    date_fin DATE,
    intervention_precedente_id BIGINT,
    status statut_intervention DEFAULT 'Pas_commence' NOT NULL
);

-- --------------------------------------------------
-- MATÉRIEL ET LIAISONS (déplacé après intervention)
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS materiel (
    id SERIAL PRIMARY KEY,
    reference TEXT UNIQUE,
    designation TEXT,
    categorie TEXT,
    fabricant TEXT,
    prix_achat NUMERIC(12,2),
    commentaire TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    intervention_id INTEGER REFERENCES intervention(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS intervention_materiel (
    id SERIAL PRIMARY KEY,
    intervention_id INTEGER NOT NULL REFERENCES intervention(id) ON DELETE CASCADE,
    materiel_id INTEGER NOT NULL REFERENCES materiel(id) ON DELETE RESTRICT,
    quantite INTEGER DEFAULT 1,
    commentaire TEXT
);

CREATE TABLE IF NOT EXISTS materiel_image (
    id SERIAL PRIMARY KEY,
    materiel_id INTEGER NOT NULL REFERENCES materiel(id) ON DELETE CASCADE,
    nom_fichier TEXT,
    type_mime TEXT
);

-- --------------------------------------------------
-- AUTRES ENTITÉS
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS rendezvous (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255),
    description TEXT,
    date_debut TIMESTAMP NOT NULL,
    date_fin TIMESTAMP,
    statut statut_rdv DEFAULT 'Planifie',
    sujet sujet_type DEFAULT 'intervention',
    intervention_id BIGINT,
    site_id BIGINT
);

CREATE TABLE IF NOT EXISTS rapport_ticket (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    matricule VARCHAR(20),
    commentaire_interne TEXT,
    etat etat_rapport DEFAULT 'Pas_commence'
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id TEXT,
    action TEXT NOT NULL,
    actor_email TEXT,
    details JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_responsable (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    role TEXT DEFAULT 'Secondaire',
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fonction (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    libelle VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_fonction (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL,
    fonction_id BIGINT NOT NULL,
    principal BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS equipe (
    id SERIAL PRIMARY KEY,
    agence_id BIGINT NOT NULL,
    nom VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS agent_equipe (
    id SERIAL PRIMARY KEY,
    equipe_id BIGINT NOT NULL,
    agent_matricule VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS agence_membre (
    id SERIAL PRIMARY KEY,
    agence_id BIGINT NOT NULL,
    agent_matricule VARCHAR(20) NOT NULL,
    role role_agence DEFAULT 'Membre'
);

CREATE TABLE IF NOT EXISTS achat (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(100),
    affaire_id BIGINT,
    site_id BIGINT,
    statut statut_achat DEFAULT 'Brouillon'
);

CREATE TABLE IF NOT EXISTS facture (
    id SERIAL PRIMARY KEY,
    client_id BIGINT,
    affaire_id BIGINT,
    statut statut_facture DEFAULT 'Brouillon'
);

CREATE TABLE IF NOT EXISTS reglement (
    id SERIAL PRIMARY KEY,
    facture_id BIGINT NOT NULL,
    montant NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    nom_fichier VARCHAR(255),
    type_mime VARCHAR(100),
    taille_octets BIGINT,
    image_blob BYTEA,
    auteur_matricule VARCHAR(20),
    cible_type doc_cible_type,
    cible_id BIGINT
);



CREATE TABLE IF NOT EXISTS rendu_intervention (
    id SERIAL PRIMARY KEY,
    intervention_id BIGINT NOT NULL,
    resume TEXT
);

CREATE TABLE IF NOT EXISTS rendu_intervention_image (
    id SERIAL PRIMARY KEY,
    rendu_intervention_id BIGINT NOT NULL,
    image_id BIGINT NOT NULL
);

DROP TABLE IF EXISTS documents_repertoire CASCADE;
CREATE TABLE IF NOT EXISTS documents_repertoire (
    id SERIAL PRIMARY KEY,
    cible_type doc_cible_type,
    cible_id BIGINT,
    nature doc_nature DEFAULT 'Document',
    nom_fichier VARCHAR(255)
);

-- --------------------------------------------------
-- FOREIGN KEYS
-- --------------------------------------------------

ALTER TABLE agence ADD FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON DELETE SET NULL;
ALTER TABLE client ADD FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON DELETE SET NULL;
ALTER TABLE site ADD FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON DELETE SET NULL;
ALTER TABLE agent ADD FOREIGN KEY (agence_id) REFERENCES agence(id) ON DELETE SET NULL;
ALTER TABLE agent ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE affaire ADD FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL;
ALTER TABLE site_affaire ADD FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE CASCADE;
ALTER TABLE site_affaire ADD FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON DELETE CASCADE;

ALTER TABLE doe ADD FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE CASCADE;
ALTER TABLE doe ADD FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON DELETE CASCADE;

ALTER TABLE ticket ADD FOREIGN KEY (doe_id) REFERENCES doe(id) ON DELETE CASCADE;
ALTER TABLE ticket ADD FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON DELETE SET NULL;
ALTER TABLE ticket ADD FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE SET NULL;

ALTER TABLE intervention ADD FOREIGN KEY (ticket_id) REFERENCES ticket(id) ON DELETE CASCADE;
ALTER TABLE intervention ADD FOREIGN KEY (intervention_precedente_id) REFERENCES intervention(id) ON DELETE SET NULL;

ALTER TABLE rendezvous ADD FOREIGN KEY (intervention_id) REFERENCES intervention(id) ON DELETE SET NULL;
ALTER TABLE rendezvous ADD FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE SET NULL;

ALTER TABLE rapport_ticket ADD FOREIGN KEY (ticket_id) REFERENCES ticket(id) ON DELETE CASCADE;
ALTER TABLE rapport_ticket ADD FOREIGN KEY (matricule) REFERENCES agent(matricule) ON DELETE SET NULL;

ALTER TABLE agent_fonction ADD FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON DELETE CASCADE;
ALTER TABLE agent_fonction ADD FOREIGN KEY (fonction_id) REFERENCES fonction(id) ON DELETE CASCADE;

ALTER TABLE agent_equipe ADD FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON DELETE CASCADE;
ALTER TABLE agent_equipe ADD FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON DELETE CASCADE;

ALTER TABLE agence_membre ADD FOREIGN KEY (agence_id) REFERENCES agence(id) ON DELETE CASCADE;
ALTER TABLE agence_membre ADD FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON DELETE CASCADE;

ALTER TABLE achat ADD FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON DELETE SET NULL;
ALTER TABLE achat ADD FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE SET NULL;

ALTER TABLE facture ADD FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL;
ALTER TABLE facture ADD FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON DELETE SET NULL;

ALTER TABLE reglement ADD FOREIGN KEY (facture_id) REFERENCES facture(id) ON DELETE CASCADE;

ALTER TABLE images ADD FOREIGN KEY (auteur_matricule) REFERENCES agent(matricule) ON DELETE SET NULL;
ALTER TABLE documents_repertoire ADD FOREIGN KEY (cible_id) REFERENCES affaire(id) ON DELETE SET NULL;

ALTER TABLE rendu_intervention ADD FOREIGN KEY (intervention_id) REFERENCES intervention(id) ON DELETE CASCADE;
ALTER TABLE rendu_intervention_image ADD FOREIGN KEY (rendu_intervention_id) REFERENCES rendu_intervention(id) ON DELETE CASCADE;
ALTER TABLE rendu_intervention_image ADD FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE;