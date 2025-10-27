-- --------------------------------------------------
-- Postgres Schema Initialization (Node.js Compatible)
-- --------------------------------------------------

-- NOTE:
--  This schema assumes a fresh database.  It drops no objects and
--  therefore must only be executed once on an empty database.  The
--  standard PostgreSQL `CREATE TYPE IF NOT EXISTS` construct is
--  deliberately avoided because it is not well supported by the
  --  node-postgres driver when executing multiâ€statement scripts.  If
--  you need idempotent migrations for an existing database, please
--  use a proper migration tool (e.g. Prisma, Sequelize or Knex).

-- Drop tables in reverse order of dependency
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
-- New: matÃ©riel and liaisons
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
DROP TABLE IF EXISTS users CASCADE;

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
-- Extended doc_cible_type includes the "RenduIntervention" value required for images and documents
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
-- Core entities
-- --------------------------------------------------

-- Users table (application accounts)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(180) UNIQUE NOT NULL,
    roles JSONB NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- Password Reset Tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent (personnel) entity
CREATE TABLE IF NOT EXISTS agent (
    matricule VARCHAR(20) PRIMARY KEY,
    nom        VARCHAR(255) NOT NULL,
    prenom     VARCHAR(255),
    admin      BOOLEAN DEFAULT FALSE NOT NULL,
    email      VARCHAR(255) UNIQUE NOT NULL,
    tel        VARCHAR(50),
    actif      BOOLEAN DEFAULT TRUE NOT NULL,
    date_entree DATE,
    commentaire TEXT,
    agence_id   BIGINT NOT NULL,
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id     INTEGER UNIQUE
);

-- Adresse entity (postal addresses)
CREATE TABLE IF NOT EXISTS adresse (
    id SERIAL PRIMARY KEY,
    libelle    VARCHAR(255),
    ligne1     VARCHAR(255),
    ligne2     VARCHAR(255),
    code_postal VARCHAR(40),
    ville      VARCHAR(120),
    region     VARCHAR(120),
    pays       VARCHAR(120),
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin   TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Agence entity (branches/offices)
CREATE TABLE IF NOT EXISTS agence (
    id SERIAL PRIMARY KEY,
    titre       VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    adresse_id  BIGINT,
    telephone   VARCHAR(50),
    email       VARCHAR(255),
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Site entity (work sites)
CREATE TABLE IF NOT EXISTS site (
    id SERIAL PRIMARY KEY,
    nom_site   VARCHAR(255) NOT NULL,
    adresse_id BIGINT,
    commentaire TEXT,
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
-- Additional columns added with IF NOT EXISTS to support ticket management and site responsibility
ALTER TABLE site ADD COLUMN IF NOT EXISTS ticket BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE site ADD COLUMN IF NOT EXISTS responsable_matricule VARCHAR(20);

-- Client entity
CREATE TABLE IF NOT EXISTS client (
    id SERIAL PRIMARY KEY,
    nom_client       VARCHAR(255) NOT NULL,
    representant_nom VARCHAR(255),
    representant_email VARCHAR(255),
    representant_tel VARCHAR(50),
    adresse_id BIGINT,
    commentaire TEXT,
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Affaire entity (projects/contracts)
CREATE TABLE IF NOT EXISTS affaire (
    id SERIAL PRIMARY KEY,
    nom_affaire VARCHAR(255) NOT NULL,
    client_id   BIGINT,
    description TEXT,
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_affaire_client ON affaire(client_id);

-- DOE entity (Dossier des Ouvrages ExÃ©cutÃ©s)
CREATE TABLE IF NOT EXISTS doe (
    id SERIAL PRIMARY KEY,
    site_id    BIGINT NOT NULL,
    affaire_id BIGINT,
    titre      VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doe_site   ON doe(site_id);
CREATE INDEX IF NOT EXISTS idx_doe_affaire ON doe(affaire_id);

-- Junction table linking sites and affaires (many-to-many)
CREATE TABLE IF NOT EXISTS site_affaire (
    id SERIAL PRIMARY KEY,
    site_id    BIGINT NOT NULL,
    affaire_id BIGINT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin   TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
DROP INDEX IF EXISTS uq_site_affaire;
CREATE UNIQUE INDEX uq_site_affaire ON site_affaire(site_id, affaire_id); -- For idempotency with client.query();

-- Ticket entity (scheduled maintenance events)
CREATE TABLE IF NOT EXISTS ticket (
    id SERIAL PRIMARY KEY,
    doe_id     BIGINT,
    affaire_id BIGINT,
    site_id    BIGINT,
    titre      VARCHAR(255),
    description TEXT,
    etat        etat_rapport DEFAULT 'Pas_commence' NOT NULL,
    responsable VARCHAR(20),
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- --------------------------------------------------
-- MatÃ©riel (inventory) and liaisons
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS materiel (
    id SERIAL PRIMARY KEY,
    reference   TEXT UNIQUE,
    designation TEXT,
    categorie   TEXT,
    fabricant   TEXT,
    prix_achat  NUMERIC(12,2),
    commentaire TEXT,
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE materiel ADD COLUMN IF NOT EXISTS intervention_id INTEGER REFERENCES intervention(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS intervention_materiel (
    id SERIAL PRIMARY KEY,
    intervention_id INTEGER NOT NULL REFERENCES intervention(id) ON DELETE CASCADE,
    materiel_id     INTEGER NOT NULL REFERENCES materiel(id) ON DELETE RESTRICT,
    quantite        INTEGER DEFAULT 1,
    commentaire     TEXT,
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intervention_materiel_intervention ON intervention_materiel(intervention_id);
CREATE INDEX IF NOT EXISTS idx_intervention_materiel_materiel     ON intervention_materiel(materiel_id);

CREATE TABLE IF NOT EXISTS materiel_image (
    id SERIAL PRIMARY KEY,
    materiel_id INTEGER NOT NULL REFERENCES materiel(id) ON DELETE CASCADE,
    nom_fichier TEXT,
    type_mime   TEXT,
    commentaire TEXT,
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_materiel_image_materiel ON materiel_image(materiel_id);
CREATE INDEX IF NOT EXISTS idx_ticket_doe    ON ticket(doe_id);
CREATE INDEX IF NOT EXISTS idx_ticket_affaire ON ticket(affaire_id);
CREATE INDEX IF NOT EXISTS idx_ticket_etat    ON ticket(etat);

-- Rapport de ticket
CREATE TABLE IF NOT EXISTS rapport_ticket (
    id SERIAL PRIMARY KEY,
    ticket_id     BIGINT NOT NULL,
    date_rapport       TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    matricule          VARCHAR(20) NOT NULL,
    nom_client         VARCHAR(255),
    adresse_client_id  BIGINT,
    commentaire_interne TEXT,
    materiel_commander TEXT,
    etat               etat_rapport DEFAULT 'Pas_commence' NOT NULL,
    date_debut         TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin           TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rapport_ticket        ON rapport_ticket(ticket_id);
CREATE INDEX IF NOT EXISTS idx_rapport_ticket_date   ON rapport_ticket(date_rapport);
CREATE INDEX IF NOT EXISTS idx_rapport_ticket_etat   ON rapport_ticket(etat);

-- Passeport (one-to-one with Agent)
CREATE TABLE IF NOT EXISTS passeport (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL,
    permis          TEXT,
    habilitations   TEXT,
    certifications  TEXT,
    commentaire     TEXT,
    date_debut      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
DROP INDEX IF EXISTS uq_passeport_agent;
CREATE UNIQUE INDEX uq_passeport_agent ON passeport(agent_matricule); -- For idempotency with client.query();

-- Formation (trainings and certifications)
CREATE TABLE IF NOT EXISTS formation (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL,
    type            type_formation NOT NULL,
    libelle         VARCHAR(255) NOT NULL,
    date_obtention  DATE,
    date_expiration DATE,
    organisme       VARCHAR(255),
    commentaire     TEXT,
    cree_par        VARCHAR(20),
    modifie_par     VARCHAR(20),
    date_debut      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formation_agent     ON formation(agent_matricule);
CREATE INDEX IF NOT EXISTS idx_formation_expiration ON formation(date_expiration);

-- Intervention entity (executed maintenance operations)
CREATE TABLE IF NOT EXISTS intervention (
    id SERIAL PRIMARY KEY,
    ticket_id            BIGINT NOT NULL,
    description TEXT,
    date_debut               DATE NOT NULL,
    date_fin                 DATE,
    intervention_precedente_id BIGINT,
    date_debut_ts            TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin_ts              TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
-- Add status column with default state if it doesn't already exist
ALTER TABLE intervention ADD COLUMN IF NOT EXISTS status statut_intervention DEFAULT 'Pas_commence' NOT NULL;

-- Rendezvous entity (appointments)
CREATE TABLE IF NOT EXISTS rendezvous (
    id SERIAL PRIMARY KEY,
    titre      VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut  TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE,
    statut      statut_rdv NOT NULL DEFAULT 'Planifie',
    sujet       sujet_type NOT NULL,
    date_rdv    DATE NOT NULL,
    heure_rdv   TIME WITHOUT TIME ZONE,
    intervention_id BIGINT,
    site_id        BIGINT
);

-- Equipe (teams within agencies)
CREATE TABLE IF NOT EXISTS equipe (
    id SERIAL PRIMARY KEY,
    agence_id   BIGINT NOT NULL,
    nom         VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipe_agence ON equipe(agence_id);

-- Agence_membre (membership of agents within agencies)
CREATE TABLE IF NOT EXISTS agence_membre (
    id SERIAL PRIMARY KEY,
    agence_id      BIGINT NOT NULL,
    agent_matricule VARCHAR(20) NOT NULL,
    role            role_agence NOT NULL DEFAULT 'Membre',
    date_debut      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
DROP INDEX IF EXISTS uq_agence_membre;
CREATE UNIQUE INDEX uq_agence_membre        ON agence_membre(agence_id, agent_matricule); -- For idempotency with client.query();
CREATE INDEX IF NOT EXISTS idx_agence_membre_agence       ON agence_membre(agence_id);
CREATE INDEX IF NOT EXISTS idx_agence_membre_agent        ON agence_membre(agent_matricule);

-- Agent_equipe (membership of agents within teams)
CREATE TABLE IF NOT EXISTS agent_equipe (
    id SERIAL PRIMARY KEY,
    equipe_id      BIGINT NOT NULL,
    agent_matricule VARCHAR(20) NOT NULL,
    date_debut      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
DROP INDEX IF EXISTS uq_agent_equipe;
CREATE UNIQUE INDEX uq_agent_equipe       ON agent_equipe(equipe_id, agent_matricule); -- For idempotency with client.query();
CREATE INDEX IF NOT EXISTS idx_agent_equipe_equipe      ON agent_equipe(equipe_id);
CREATE INDEX IF NOT EXISTS idx_agent_equipe_agent       ON agent_equipe(agent_matricule);

-- Fonction entity (roles/functions)
CREATE TABLE IF NOT EXISTS fonction (
    id SERIAL PRIMARY KEY,
    code       VARCHAR(50) NOT NULL,
    libelle    VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
DROP INDEX IF EXISTS uq_fonction_code;
CREATE UNIQUE INDEX uq_fonction_code ON fonction(code); -- For idempotency with client.query();

-- Agent_fonction (assignment of roles to agents)
CREATE TABLE IF NOT EXISTS agent_fonction (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL,
    fonction_id     BIGINT NOT NULL,
    principal       BOOLEAN NOT NULL DEFAULT FALSE,
    date_debut      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
DROP INDEX IF EXISTS uq_agent_fonction;
CREATE UNIQUE INDEX uq_agent_fonction      ON agent_fonction(agent_matricule, fonction_id); -- For idempotency with client.query();
CREATE INDEX IF NOT EXISTS idx_agent_fonction_fonction   ON agent_fonction(fonction_id);

-- Achats (purchases)
CREATE TABLE IF NOT EXISTS achat (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(100),
    objet     VARCHAR(255),
    fournisseur VARCHAR(255),
    statut    statut_achat NOT NULL DEFAULT 'Brouillon',
    montant_ht NUMERIC(12,2),
    tva        NUMERIC(5,2),
    montant_ttc NUMERIC(12,2),
    date_commande DATE,
    affaire_id    BIGINT,
    site_id       BIGINT,
    date_debut    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_achat_affaire ON achat(affaire_id);
CREATE INDEX IF NOT EXISTS idx_achat_site    ON achat(site_id);
CREATE INDEX IF NOT EXISTS idx_achat_statut  ON achat(statut);

-- Factures (invoices)
CREATE TABLE IF NOT EXISTS facture (
    id SERIAL PRIMARY KEY,
    reference    VARCHAR(100),
    statut       statut_facture NOT NULL DEFAULT 'Brouillon',
    montant_ht   NUMERIC(12,2),
    tva          NUMERIC(5,2),
    montant_ttc  NUMERIC(12,2),
    date_emission DATE,
    date_echeance DATE,
    client_id    BIGINT,
    affaire_id   BIGINT,
    date_debut   TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facture_client ON facture(client_id);
CREATE INDEX IF NOT EXISTS idx_facture_affaire ON facture(affaire_id);
CREATE INDEX IF NOT EXISTS idx_facture_statut ON facture(statut);

-- RÃ¨glements (payments)
CREATE TABLE IF NOT EXISTS reglement (
    id SERIAL PRIMARY KEY,
    facture_id BIGINT NOT NULL,
    montant    NUMERIC(12,2) NOT NULL,
    mode       mode_reglement NOT NULL DEFAULT 'Virement',
    reference  VARCHAR(100),
    date_reglement DATE,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin   TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reglement_facture ON reglement(facture_id);
CREATE INDEX IF NOT EXISTS idx_reglement_mode    ON reglement(mode);

-- Images storage
CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    nom_fichier   VARCHAR(255) NOT NULL,
    type_mime     VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    taille_octets BIGINT NOT NULL,
    image_blob    BYTEA NOT NULL,
    commentaire_image TEXT,
    auteur_matricule VARCHAR(20),
    cible_type    doc_cible_type,
    cible_id      BIGINT,
    date_debut    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_auteur ON images(auteur_matricule);
CREATE INDEX IF NOT EXISTS idx_images_target ON images(cible_type, cible_id);

-- Documents storage
CREATE TABLE IF NOT EXISTS documents_repertoire (
    id SERIAL PRIMARY KEY,
    cible_type doc_cible_type NOT NULL,
    cible_id   BIGINT NOT NULL,
    nature     doc_nature NOT NULL DEFAULT 'Document',
    nom_fichier VARCHAR(255) NOT NULL,
    type_mime   VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    taille_octets BIGINT,
    chemin_fichier VARCHAR(1024),
    checksum_sha256 VARCHAR(64),
    commentaire     TEXT,
    auteur_matricule VARCHAR(20),
    date_debut      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
-- Ensure the commentaire column exists (for idempotency in later migrations)
ALTER TABLE documents_repertoire ADD COLUMN IF NOT EXISTS commentaire TEXT;
CREATE INDEX IF NOT EXISTS idx_docs_cible    ON documents_repertoire(cible_type, cible_id);
CREATE INDEX IF NOT EXISTS idx_docs_nom      ON documents_repertoire(nom_fichier);
CREATE INDEX IF NOT EXISTS idx_docs_checksum ON documents_repertoire(checksum_sha256);

-- Rendu Intervention (reports produced for an intervention)
CREATE TABLE IF NOT EXISTS rendu_intervention (
  id              SERIAL PRIMARY KEY,
  intervention_id BIGINT NOT NULL,
  resume          TEXT,
  valeur          TEXT,
  date_debut      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  date_fin        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Rendu intervention images (link between a report and images)
CREATE TABLE IF NOT EXISTS rendu_intervention_image (
  id                    SERIAL PRIMARY KEY,
  rendu_intervention_id BIGINT NOT NULL,
  image_id              BIGINT NOT NULL,
  UNIQUE (rendu_intervention_id, image_id)
);

-- --------------------------------------------------
-- Foreign key constraints
-- Note: these are declared after table creation to prevent circular
-- dependencies from blocking creation.  They assume a fresh database.
-- --------------------------------------------------

-- Agence and adresse
ALTER TABLE agence
  ADD CONSTRAINT fk_agence_adresse FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Site and adresse
ALTER TABLE site
  ADD CONSTRAINT fk_site_adresse FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Agent relations
ALTER TABLE agent
  ADD CONSTRAINT fk_agent_agence FOREIGN KEY (agence_id) REFERENCES agence(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE agent
  ADD CONSTRAINT fk_agent_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Client relations
ALTER TABLE client
  ADD CONSTRAINT fk_client_adresse FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- DOE relations
ALTER TABLE doe
  ADD CONSTRAINT fk_doe_site    FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE doe
  ADD CONSTRAINT fk_doe_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- Site_affaire links
ALTER TABLE site_affaire
  ADD CONSTRAINT fk_site_affaire_site    FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE site_affaire
  ADD CONSTRAINT fk_site_affaire_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Maintenance relations
ALTER TABLE ticket
  ADD CONSTRAINT fk_ticket_doe    FOREIGN KEY (doe_id) REFERENCES doe(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ticket
  ADD CONSTRAINT fk_ticket_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ticket
  ADD CONSTRAINT fk_ticket_site FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Intervention relations
ALTER TABLE intervention
  ADD CONSTRAINT fk_intervention_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE intervention
  ADD CONSTRAINT fk_intervention_prec FOREIGN KEY (intervention_precedente_id) REFERENCES intervention(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Rendezvous relations
ALTER TABLE rendezvous
  ADD CONSTRAINT fk_rendezvous_intervention FOREIGN KEY (intervention_id) REFERENCES intervention(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE rendezvous
  ADD CONSTRAINT fk_rendezvous_site        FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Rapport de maintenance relations
ALTER TABLE rapport_ticket
  ADD CONSTRAINT fk_rapport_ticket_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE rapport_ticket
  ADD CONSTRAINT fk_rapport_ticket_agent FOREIGN KEY (matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE rapport_ticket
  ADD CONSTRAINT fk_rapport_ticket_adresse FOREIGN KEY (adresse_client_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Passeport relation
ALTER TABLE passeport
  ADD CONSTRAINT fk_passeport_agent FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;

-- Formation relation
ALTER TABLE formation
  ADD CONSTRAINT fk_formation_agent FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;

-- Equipe and agence
ALTER TABLE equipe
  ADD CONSTRAINT fk_equipe_agence FOREIGN KEY (agence_id) REFERENCES agence(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- Agence_membre relations
ALTER TABLE agence_membre
  ADD CONSTRAINT fk_agence_membre_agence FOREIGN KEY (agence_id) REFERENCES agence(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE agence_membre
  ADD CONSTRAINT fk_agence_membre_agent  FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;

-- Agent_equipe relations
ALTER TABLE agent_equipe
  ADD CONSTRAINT fk_agent_equipe_equipe FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE agent_equipe
  ADD CONSTRAINT fk_agent_equipe_agent  FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;

-- Agent_fonction relations
ALTER TABLE agent_fonction
  ADD CONSTRAINT fk_agent_fonction_agent    FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE agent_fonction
  ADD CONSTRAINT fk_agent_fonction_fonction FOREIGN KEY (fonction_id) REFERENCES fonction(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Achats relations
ALTER TABLE achat
  ADD CONSTRAINT fk_achat_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE achat
  ADD CONSTRAINT fk_achat_site   FOREIGN KEY (site_id)    REFERENCES site(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Facture relations
ALTER TABLE facture
  ADD CONSTRAINT fk_facture_client FOREIGN KEY (client_id)  REFERENCES client(id)  ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE facture
  ADD CONSTRAINT fk_facture_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Reglement relation
ALTER TABLE reglement
  ADD CONSTRAINT fk_reglement_facture FOREIGN KEY (facture_id) REFERENCES facture(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Images and documents authorship
ALTER TABLE images
  ADD CONSTRAINT fk_images_auteur FOREIGN KEY (auteur_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE documents_repertoire
  ADD CONSTRAINT fk_docs_auteur  FOREIGN KEY (auteur_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE SET NULL;

-- Rendu intervention relations
ALTER TABLE rendu_intervention
  ADD CONSTRAINT fk_rendu_intervention_intervention FOREIGN KEY (intervention_id) REFERENCES intervention(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE rendu_intervention_image
  ADD CONSTRAINT fk_rendu_intervention_image_rendu FOREIGN KEY (rendu_intervention_id) REFERENCES rendu_intervention(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE rendu_intervention_image
  ADD CONSTRAINT fk_rendu_intervention_image_image FOREIGN KEY (image_id) REFERENCES images(id) ON UPDATE CASCADE ON DELETE CASCADE;
