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

