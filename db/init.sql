-- Schema for User entity
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(180) UNIQUE NOT NULL,
    roles JSONB NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- Schema for Agent entity
CREATE TABLE IF NOT EXISTS agent (
    matricule VARCHAR(20) PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255),
    admin BOOLEAN DEFAULT FALSE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    tel VARCHAR(50),
    actif BOOLEAN DEFAULT TRUE NOT NULL,
    date_entree DATE,
    commentaire TEXT,
    agence_id BIGINT NOT NULL, -- Foreign Key to agence (id)
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id INTEGER UNIQUE -- Foreign Key to users (id)
);

-- Schema for Site entity
CREATE TABLE IF NOT EXISTS site (
    id SERIAL PRIMARY KEY,
    nom_site VARCHAR(255) NOT NULL,
    adresse_id BIGINT, -- Foreign Key to adresse (id)
    commentaire TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Schema for Intervention entity
CREATE TABLE IF NOT EXISTS intervention (
    id SERIAL PRIMARY KEY,
    maintenance_id BIGINT NOT NULL, -- Foreign Key to maintenance (id)
    description TEXT NOT NULL,
    date_debut DATE NOT NULL,
    date_fin DATE,
    intervention_precedente_id BIGINT, -- Foreign Key to self (intervention.id)
    date_debut_ts TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin_ts TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Schema for Rendezvous entity
CREATE TABLE IF NOT EXISTS rendezvous (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE,
    statut VARCHAR(50) NOT NULL,
    sujet VARCHAR(255) NOT NULL,
    date_rdv DATE NOT NULL,
    heure_rdv TIME WITHOUT TIME ZONE,
    intervention_id BIGINT, -- Foreign Key to intervention (id)
    site_id BIGINT -- Foreign Key to site (id)
);


-- Schema for Adresse entity
CREATE TABLE IF NOT EXISTS adresse (
    id SERIAL PRIMARY KEY,
    libelle VARCHAR(255),
    ligne1 VARCHAR(255),
    ligne2 VARCHAR(255),
    code_postal VARCHAR(40),
    ville VARCHAR(120),
    region VARCHAR(120),
    pays VARCHAR(120),
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Schema for Agence entity
CREATE TABLE IF NOT EXISTS agence (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    adresse_id BIGINT, -- Foreign Key to adresse (id)
    telephone VARCHAR(50),
    email VARCHAR(255),
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Schema for Client entity
CREATE TABLE IF NOT EXISTS client (
    id SERIAL PRIMARY KEY,
    nom_client VARCHAR(255) NOT NULL,
    representant_nom VARCHAR(255),
    representant_email VARCHAR(255),
    representant_tel VARCHAR(50),
    adresse_id BIGINT, -- Foreign Key to adresse (id)
    commentaire TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Additional domain tables (aligned to tables.txt minimal subset)

-- Affaire entity
CREATE TABLE IF NOT EXISTS affaire (
    id SERIAL PRIMARY KEY,
    nom_affaire VARCHAR(255) NOT NULL,
    client_id BIGINT, -- FK to client(id)
    description TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_affaire_client ON affaire(client_id);

-- DOE entity (per site and affaire)
CREATE TABLE IF NOT EXISTS doe (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL, -- FK to site(id)
    affaire_id BIGINT NOT NULL, -- FK to affaire(id)
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doe_site ON doe(site_id);
CREATE INDEX IF NOT EXISTS idx_doe_affaire ON doe(affaire_id);

-- Site <-> Affaire link (N:N)
CREATE TABLE IF NOT EXISTS site_affaire (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL,
    affaire_id BIGINT NOT NULL,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_affaire ON site_affaire(site_id, affaire_id);

-- Maintenance entity
CREATE TABLE IF NOT EXISTS maintenance (
    id SERIAL PRIMARY KEY,
    doe_id BIGINT NOT NULL,
    affaire_id BIGINT NOT NULL,
    titre VARCHAR(255),
    description TEXT NOT NULL,
    etat VARCHAR(50) DEFAULT 'Pas_commence' NOT NULL,
    responsable VARCHAR(20), -- agent.matricule
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maintenance_doe ON maintenance(doe_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_affaire ON maintenance(affaire_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_etat ON maintenance(etat);

-- Rapport de maintenance
CREATE TABLE IF NOT EXISTS rapport_maintenance (
    id SERIAL PRIMARY KEY,
    maintenance_id BIGINT NOT NULL,
    date_rapport TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    matricule VARCHAR(20) NOT NULL, -- agent.matricule
    nom_client VARCHAR(255),
    adresse_client_id BIGINT,
    commentaire_interne TEXT,
    materiel_commander TEXT,
    etat VARCHAR(50) DEFAULT 'Pas_commence' NOT NULL,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rapport_maintenance ON rapport_maintenance(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_rapport_maintenance_date ON rapport_maintenance(date_rapport);
CREATE INDEX IF NOT EXISTS idx_rapport_maintenance_etat ON rapport_maintenance(etat);

-- Passeport (1:1 with agent)
CREATE TABLE IF NOT EXISTS passeport (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL,
    permis TEXT,
    habilitations TEXT,
    certifications TEXT,
    commentaire TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_passeport_agent ON passeport(agent_matricule);

-- Formation
CREATE TABLE IF NOT EXISTS formation (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL,
    type VARCHAR(50) NOT NULL,
    libelle VARCHAR(255) NOT NULL,
    date_obtention DATE,
    date_expiration DATE,
    organisme VARCHAR(255),
    commentaire TEXT,
    cree_par VARCHAR(20),
    modifie_par VARCHAR(20),
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formation_agent ON formation(agent_matricule);
CREATE INDEX IF NOT EXISTS idx_formation_expiration ON formation(date_expiration);

-- Foreign keys and relational constraints (idempotent)
DO $$ BEGIN
    -- agence.adresse_id -> adresse.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_agence_adresse'
    ) THEN
        ALTER TABLE agence
            ADD CONSTRAINT fk_agence_adresse FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- site.adresse_id -> adresse.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_adresse'
    ) THEN
        ALTER TABLE site
            ADD CONSTRAINT fk_site_adresse FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- agent.agence_id -> agence.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_agence'
    ) THEN
        ALTER TABLE agent
            ADD CONSTRAINT fk_agent_agence FOREIGN KEY (agence_id) REFERENCES agence(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    -- agent.user_id -> users.id (1:1 optional)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_user'
    ) THEN
        ALTER TABLE agent
            ADD CONSTRAINT fk_agent_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- client.adresse_id -> adresse.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_adresse'
    ) THEN
        ALTER TABLE client
            ADD CONSTRAINT fk_client_adresse FOREIGN KEY (adresse_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- doe.site_id -> site.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_doe_site'
    ) THEN
        ALTER TABLE doe
            ADD CONSTRAINT fk_doe_site FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    -- doe.affaire_id -> affaire.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_doe_affaire'
    ) THEN
        ALTER TABLE doe
            ADD CONSTRAINT fk_doe_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    -- site_affaire links
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_affaire_site'
    ) THEN
        ALTER TABLE site_affaire
            ADD CONSTRAINT fk_site_affaire_site FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_affaire_affaire'
    ) THEN
        ALTER TABLE site_affaire
            ADD CONSTRAINT fk_site_affaire_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;

    -- maintenance.doe_id -> doe.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_maintenance_doe'
    ) THEN
        ALTER TABLE maintenance
            ADD CONSTRAINT fk_maintenance_doe FOREIGN KEY (doe_id) REFERENCES doe(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
    -- maintenance.affaire_id -> affaire.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_maintenance_affaire'
    ) THEN
        ALTER TABLE maintenance
            ADD CONSTRAINT fk_maintenance_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    -- intervention.maintenance_id -> maintenance.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_intervention_maintenance'
    ) THEN
        ALTER TABLE intervention
            ADD CONSTRAINT fk_intervention_maintenance FOREIGN KEY (maintenance_id) REFERENCES maintenance(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    -- intervention.intervention_precedente_id -> intervention.id (self-ref)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_intervention_prec'
    ) THEN
        ALTER TABLE intervention
            ADD CONSTRAINT fk_intervention_prec FOREIGN KEY (intervention_precedente_id) REFERENCES intervention(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- rendezvous.intervention_id -> intervention.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rendezvous_intervention'
    ) THEN
        ALTER TABLE rendezvous
            ADD CONSTRAINT fk_rendezvous_intervention FOREIGN KEY (intervention_id) REFERENCES intervention(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
    -- rendezvous.site_id -> site.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rendezvous_site'
    ) THEN
        ALTER TABLE rendezvous
            ADD CONSTRAINT fk_rendezvous_site FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- rapport_maintenance.maintenance_id -> maintenance.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rapport_maintenance_maintenance'
    ) THEN
        ALTER TABLE rapport_maintenance
            ADD CONSTRAINT fk_rapport_maintenance_maintenance FOREIGN KEY (maintenance_id) REFERENCES maintenance(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    -- rapport_maintenance.matricule -> agent.matricule
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rapport_maintenance_agent'
    ) THEN
        ALTER TABLE rapport_maintenance
            ADD CONSTRAINT fk_rapport_maintenance_agent FOREIGN KEY (matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
    -- rapport_maintenance.adresse_client_id -> adresse.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rapport_maintenance_adresse'
    ) THEN
        ALTER TABLE rapport_maintenance
            ADD CONSTRAINT fk_rapport_maintenance_adresse FOREIGN KEY (adresse_client_id) REFERENCES adresse(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- passeport.agent_matricule -> agent.matricule
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_passeport_agent'
    ) THEN
        ALTER TABLE passeport
            ADD CONSTRAINT fk_passeport_agent FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;

    -- formation.agent_matricule -> agent.matricule
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_formation_agent'
    ) THEN
        ALTER TABLE formation
            ADD CONSTRAINT fk_formation_agent FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

-- Documents and Images storage
-- Organisation (teams, roles) tables
CREATE TABLE IF NOT EXISTS equipe (
    id SERIAL PRIMARY KEY,
    agence_id BIGINT NOT NULL,
    nom VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipe_agence ON equipe(agence_id);

CREATE TABLE IF NOT EXISTS agence_membre (
    id SERIAL PRIMARY KEY,
    agence_id BIGINT NOT NULL,
    agent_matricule VARCHAR(20) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Membre',
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agence_membre ON agence_membre(agence_id, agent_matricule);
CREATE INDEX IF NOT EXISTS idx_agence_membre_agence ON agence_membre(agence_id);
CREATE INDEX IF NOT EXISTS idx_agence_membre_agent ON agence_membre(agent_matricule);

CREATE TABLE IF NOT EXISTS agent_equipe (
    id SERIAL PRIMARY KEY,
    equipe_id BIGINT NOT NULL,
    agent_matricule VARCHAR(20) NOT NULL,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_equipe ON agent_equipe(equipe_id, agent_matricule);
CREATE INDEX IF NOT EXISTS idx_agent_equipe_equipe ON agent_equipe(equipe_id);
CREATE INDEX IF NOT EXISTS idx_agent_equipe_agent ON agent_equipe(agent_matricule);

CREATE TABLE IF NOT EXISTS fonction (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    libelle VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fonction_code ON fonction(code);

CREATE TABLE IF NOT EXISTS agent_fonction (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL,
    fonction_id BIGINT NOT NULL,
    principal BOOLEAN NOT NULL DEFAULT FALSE,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_fonction ON agent_fonction(agent_matricule, fonction_id);
CREATE INDEX IF NOT EXISTS idx_agent_fonction_fonction ON agent_fonction(fonction_id);

-- FKs for organisation tables
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_equipe_agence') THEN
        ALTER TABLE equipe ADD CONSTRAINT fk_equipe_agence FOREIGN KEY (agence_id) REFERENCES agence(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agence_membre_agence') THEN
        ALTER TABLE agence_membre ADD CONSTRAINT fk_agence_membre_agence FOREIGN KEY (agence_id) REFERENCES agence(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agence_membre_agent') THEN
        ALTER TABLE agence_membre ADD CONSTRAINT fk_agence_membre_agent FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_equipe_equipe') THEN
        ALTER TABLE agent_equipe ADD CONSTRAINT fk_agent_equipe_equipe FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_equipe_agent') THEN
        ALTER TABLE agent_equipe ADD CONSTRAINT fk_agent_equipe_agent FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_fonction_agent') THEN
        ALTER TABLE agent_fonction ADD CONSTRAINT fk_agent_fonction_agent FOREIGN KEY (agent_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_fonction_fonction') THEN
        ALTER TABLE agent_fonction ADD CONSTRAINT fk_agent_fonction_fonction FOREIGN KEY (fonction_id) REFERENCES fonction(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

-- Gestion financière: Achats, Factures, Règlements
CREATE TABLE IF NOT EXISTS achat (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(100),
    objet VARCHAR(255),
    fournisseur VARCHAR(255),
    statut VARCHAR(50) NOT NULL DEFAULT 'Brouillon',
    montant_ht NUMERIC(12,2),
    tva NUMERIC(5,2),
    montant_ttc NUMERIC(12,2),
    date_commande DATE,
    affaire_id BIGINT,
    site_id BIGINT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_achat_affaire ON achat(affaire_id);
CREATE INDEX IF NOT EXISTS idx_achat_site ON achat(site_id);
CREATE INDEX IF NOT EXISTS idx_achat_statut ON achat(statut);

CREATE TABLE IF NOT EXISTS facture (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(100),
    statut VARCHAR(50) NOT NULL DEFAULT 'Brouillon',
    montant_ht NUMERIC(12,2),
    tva NUMERIC(5,2),
    montant_ttc NUMERIC(12,2),
    date_emission DATE,
    date_echeance DATE,
    client_id BIGINT,
    affaire_id BIGINT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facture_client ON facture(client_id);
CREATE INDEX IF NOT EXISTS idx_facture_affaire ON facture(affaire_id);
CREATE INDEX IF NOT EXISTS idx_facture_statut ON facture(statut);

CREATE TABLE IF NOT EXISTS reglement (
    id SERIAL PRIMARY KEY,
    facture_id BIGINT NOT NULL,
    montant NUMERIC(12,2) NOT NULL,
    mode VARCHAR(50) NOT NULL DEFAULT 'Virement',
    reference VARCHAR(100),
    date_reglement DATE,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reglement_facture ON reglement(facture_id);
CREATE INDEX IF NOT EXISTS idx_reglement_mode ON reglement(mode);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_achat_affaire') THEN
        ALTER TABLE achat ADD CONSTRAINT fk_achat_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_achat_site') THEN
        ALTER TABLE achat ADD CONSTRAINT fk_achat_site FOREIGN KEY (site_id) REFERENCES site(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_facture_client') THEN
        ALTER TABLE facture ADD CONSTRAINT fk_facture_client FOREIGN KEY (client_id) REFERENCES client(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_facture_affaire') THEN
        ALTER TABLE facture ADD CONSTRAINT fk_facture_affaire FOREIGN KEY (affaire_id) REFERENCES affaire(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reglement_facture') THEN
        ALTER TABLE reglement ADD CONSTRAINT fk_reglement_facture FOREIGN KEY (facture_id) REFERENCES facture(id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    nom_fichier VARCHAR(255) NOT NULL,
    type_mime VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    taille_octets BIGINT NOT NULL,
    image_blob BYTEA NOT NULL,
    commentaire_image TEXT,
    auteur_matricule VARCHAR(20),
    cible_type VARCHAR(50),
    cible_id BIGINT,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
-- Ensure columns exist for older schemas
ALTER TABLE images ADD COLUMN IF NOT EXISTS cible_type VARCHAR(50);
ALTER TABLE images ADD COLUMN IF NOT EXISTS cible_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_images_auteur ON images(auteur_matricule);
CREATE INDEX IF NOT EXISTS idx_images_target ON images(cible_type, cible_id);

CREATE TABLE IF NOT EXISTS documents_repertoire (
    id SERIAL PRIMARY KEY,
    cible_type VARCHAR(50) NOT NULL,
    cible_id BIGINT NOT NULL,
    nature VARCHAR(50) NOT NULL DEFAULT 'Document',
    nom_fichier VARCHAR(255) NOT NULL,
    type_mime VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    taille_octets BIGINT,
    chemin_fichier VARCHAR(1024),
    checksum_sha256 VARCHAR(64),
    auteur_matricule VARCHAR(20),
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_cible ON documents_repertoire(cible_type, cible_id);
CREATE INDEX IF NOT EXISTS idx_docs_nom ON documents_repertoire(nom_fichier);
CREATE INDEX IF NOT EXISTS idx_docs_checksum ON documents_repertoire(checksum_sha256);

-- FKs for documents/images
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_images_auteur'
    ) THEN
        ALTER TABLE images ADD CONSTRAINT fk_images_auteur FOREIGN KEY (auteur_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_docs_auteur'
    ) THEN
        ALTER TABLE documents_repertoire ADD CONSTRAINT fk_docs_auteur FOREIGN KEY (auteur_matricule) REFERENCES agent(matricule) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

-- Ensure legacy columns exist for images (idempotent)
ALTER TABLE images ADD COLUMN IF NOT EXISTS cible_type VARCHAR(50);
ALTER TABLE images ADD COLUMN IF NOT EXISTS cible_id BIGINT;
