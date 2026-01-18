-- --------------------------------------------------
-- ✅ PostgreSQL Schema Initialization (Corrected Order for Heroku)
-- -- Forcing update --
-- --------------------------------------------------

SET search_path TO public;

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
DROP TABLE IF EXISTS ticket_historique_responsable CASCADE;
DROP TABLE IF EXISTS ticket_responsable CASCADE;
DROP TABLE IF EXISTS ticket_agent CASCADE;
DROP TABLE IF EXISTS ticket CASCADE;
DROP TABLE IF EXISTS demande_client CASCADE;
DROP TABLE IF EXISTS site_affaire CASCADE;
DROP TABLE IF EXISTS doe CASCADE;
DROP TABLE IF EXISTS affaire CASCADE;
DROP TABLE IF EXISTS client_representant CASCADE;
DROP TABLE IF EXISTS client CASCADE;
DROP TABLE IF EXISTS site_responsable CASCADE;
DROP TABLE IF EXISTS site_agent CASCADE;
DROP TABLE IF EXISTS site CASCADE;
DROP TABLE IF EXISTS agence CASCADE;
DROP TABLE IF EXISTS adresse CASCADE;
DROP TABLE IF EXISTS passeport CASCADE;
DROP TABLE IF EXISTS formation CASCADE;
DROP TABLE IF EXISTS agent CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;

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
DROP TYPE IF EXISTS site_status CASCADE;
DROP TYPE IF EXISTS devis_status CASCADE;
DROP TYPE IF EXISTS metier_type CASCADE;
DROP TYPE IF EXISTS commande_status_type CASCADE;
DROP TYPE IF EXISTS intervention_event_statut CASCADE;

CREATE TYPE statut_intervention AS ENUM ('En_attente','Termine');
CREATE TYPE etat_rapport        AS ENUM ('Pas_commence','En_cours','Termine');
CREATE TYPE sujet_type          AS ENUM ('ticket','intervention');
CREATE TYPE statut_rdv          AS ENUM ('Planifie','Confirme','Termine','Annule');
CREATE TYPE doc_cible_type      AS ENUM (
    'Affaire','Agent','Agence','Adresse','Client','Site','RendezVous','DOE','Ticket','Intervention',
    'RapportTicket','Achat','Facture','Reglement','Formation','Fonction','RenduIntervention', 'DemandeClient', 'Contrat', 'Materiel', 'MaterielCatalogue'
);
CREATE TYPE doc_nature          AS ENUM ('Document','Video','Audio','Autre');
CREATE TYPE statut_achat        AS ENUM ('Brouillon','Valide','Commande','Recu_partiel','Recu','Annule');
CREATE TYPE statut_facture      AS ENUM ('Brouillon','Emise','Envoyee','Payee_partielle','Payee','Annulee');
CREATE TYPE mode_reglement      AS ENUM ('Virement','Cheque','Carte','Especes','Traite','Autre');
CREATE TYPE role_agence         AS ENUM ('Admin','Manager','Membre');
CREATE TYPE type_formation      AS ENUM ('Habilitation','Certification','Permis');
CREATE TYPE site_status AS ENUM ('Actif', 'Inactif');
CREATE TYPE devis_status AS ENUM ('Brouillon', 'Envoye', 'Accepte', 'Refuse');
CREATE TYPE metier_type AS ENUM ('GTB', 'Video', 'Intrusion', 'Control_Acces');
CREATE TYPE commande_status_type AS ENUM ('A commander', 'Commande', 'En livraison', 'Reçu', 'Installé');
CREATE TYPE intervention_event_statut AS ENUM ('Planifie','En_cours','Termine','Annule','Reporte');

-- --------------------------------------------------
-- CORE ENTITIES
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
    titre VARCHAR(255) NOT NULL UNIQUE,
    designation VARCHAR(255),
    adresse_id BIGINT REFERENCES adresse(id) ON DELETE SET NULL,
    telephone VARCHAR(50),
    email VARCHAR(255),
    date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_fin TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS client (
    id SERIAL PRIMARY KEY,
    nom_client VARCHAR(255) NOT NULL UNIQUE,
    representant_nom VARCHAR(255),
    representant_email VARCHAR(255),
    representant_tel VARCHAR(50),
    adresse_id BIGINT REFERENCES adresse(id) ON DELETE SET NULL,
    user_id INTEGER,
    commentaire TEXT
);

CREATE TABLE IF NOT EXISTS site (
    id SERIAL PRIMARY KEY,
    nom_site VARCHAR(255) NOT NULL UNIQUE,
    adresse_id BIGINT REFERENCES adresse(id) ON DELETE SET NULL,
    client_id BIGINT REFERENCES client(id) ON DELETE SET NULL,
    commentaire TEXT,
    ticket BOOLEAN DEFAULT FALSE NOT NULL,
    responsable_matricule VARCHAR(20),
    statut site_status DEFAULT 'Actif' NOT NULL
);

CREATE TABLE IF NOT EXISTS affaire (
    id SERIAL PRIMARY KEY,
    nom_affaire VARCHAR(255) NOT NULL UNIQUE,
    numero_affaire VARCHAR(255) UNIQUE,
    client_id BIGINT REFERENCES client(id) ON DELETE SET NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS agent (
    matricule VARCHAR(20) PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    agence_id BIGINT REFERENCES agence(id) ON DELETE SET NULL,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    admin BOOLEAN DEFAULT FALSE,
    actif BOOLEAN DEFAULT TRUE,
    date_entree DATE,
    commentaire TEXT,
    fonction VARCHAR(255) DEFAULT 'Non spécifié',
    agence VARCHAR(255),
    tel VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS passeport (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    permis VARCHAR(50),
    habilitations TEXT,
    date_expiration DATE
);

CREATE TABLE IF NOT EXISTS formation (
    id SERIAL PRIMARY KEY,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    "type" type_formation,
    libelle VARCHAR(255) NOT NULL,
    date_obtention DATE,
    date_validite DATE
);

CREATE TABLE IF NOT EXISTS contrat (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL UNIQUE,
    client_id BIGINT REFERENCES client(id) ON DELETE SET NULL,
    site_id BIGINT REFERENCES site(id) ON DELETE SET NULL,
    metier metier_type,
    date_debut DATE NOT NULL,
    date_fin DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contrat_site_association (
    id SERIAL PRIMARY KEY,
    contrat_id BIGINT NOT NULL REFERENCES contrat(id) ON DELETE CASCADE,
    site_id BIGINT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    UNIQUE (contrat_id, site_id)
);

CREATE TABLE IF NOT EXISTS site_affaire (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    affaire_id BIGINT REFERENCES affaire(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doe (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    affaire_id BIGINT REFERENCES affaire(id) ON DELETE CASCADE,
    titre VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS demande_client (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    site_id BIGINT REFERENCES site(id) ON DELETE SET NULL,
    titre VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'En cours de traitement',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ticket_id INTEGER,
    commentaire TEXT
);



CREATE TABLE IF NOT EXISTS ticket (
    id SERIAL PRIMARY KEY,
    doe_id BIGINT REFERENCES doe(id) ON DELETE SET NULL,
    affaire_id BIGINT REFERENCES affaire(id) ON DELETE SET NULL,
    site_id BIGINT REFERENCES site(id) ON DELETE SET NULL,
    demande_id BIGINT REFERENCES demande_client(id) ON DELETE SET NULL,
    responsable VARCHAR(20) REFERENCES agent(matricule) ON DELETE SET NULL,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    etat etat_rapport DEFAULT 'Pas_commence',
    date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_fin TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE demande_client ADD FOREIGN KEY (ticket_id) REFERENCES ticket(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ticket_agent (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_fin TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS intervention (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    site_id BIGINT REFERENCES site(id) ON DELETE SET NULL,
    demande_id BIGINT REFERENCES demande_client(id) ON DELETE SET NULL,
    titre VARCHAR(255),
    description TEXT,
    date_debut TIMESTAMP NOT NULL,
    date_fin TIMESTAMP,
    intervention_precedente_id BIGINT REFERENCES intervention(id) ON DELETE SET NULL,
    status statut_intervention DEFAULT 'En_attente' NOT NULL,
    ticket_agent_id INTEGER REFERENCES ticket_agent(id) ON DELETE SET NULL,
    metier metier_type
);

CREATE TABLE IF NOT EXISTS intervention_event (
    id SERIAL PRIMARY KEY,
    intervention_id BIGINT NOT NULL REFERENCES intervention(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    statut intervention_event_statut NOT NULL DEFAULT 'Planifie',
    date_heure_debut_prevue TIMESTAMP WITH TIME ZONE NOT NULL,
    date_heure_fin_prevue TIMESTAMP WITH TIME ZONE,
    date_heure_debut_reelle TIMESTAMP WITH TIME ZONE,
    date_heure_fin_reelle TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demande_materiel (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    commentaire TEXT,
    quantite INTEGER NOT NULL DEFAULT 1,
    statut VARCHAR(50) DEFAULT 'En_attente',
    commande_complete BOOLEAN DEFAULT FALSE,
    ticket_id INTEGER REFERENCES ticket(id) ON DELETE CASCADE,
    intervention_id INTEGER REFERENCES intervention(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gestion_demande_materiel (
    id SERIAL PRIMARY KEY,
    demande_materiel_id BIGINT NOT NULL REFERENCES demande_materiel(id) ON DELETE CASCADE,
    materiel_id BIGINT NOT NULL REFERENCES materiel(id) ON DELETE CASCADE,
    quantite_demandee INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (demande_materiel_id, materiel_id)
);

CREATE TABLE IF NOT EXISTS materiel_catalogue (
    id SERIAL PRIMARY KEY,
    titre TEXT,
    reference TEXT UNIQUE,
    designation TEXT,
    categorie TEXT,
    fabricant TEXT,
    fournisseur TEXT,
    remise_fournisseur NUMERIC(5, 2),
    classe_materiel TEXT,
    prix_achat NUMERIC(12,2),
    commentaire TEXT,
    metier metier_type,
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS materiel (
    id SERIAL PRIMARY KEY,
    titre TEXT,
    reference TEXT,
    designation TEXT,
    categorie TEXT,
    fabricant TEXT,
    fournisseur TEXT,
    remise_fournisseur NUMERIC(5, 2),
    classe_materiel TEXT,
    prix_achat NUMERIC(12,2),
    commentaire TEXT,
    commande_status commande_status_type DEFAULT 'A commander',
    metier metier_type,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS intervention_materiel (
    id SERIAL PRIMARY KEY,
    intervention_id INTEGER NOT NULL REFERENCES intervention(id) ON DELETE CASCADE,
    materiel_id INTEGER NOT NULL REFERENCES materiel(id) ON DELETE RESTRICT,
    quantite INTEGER DEFAULT 1,
    commentaire TEXT
);

CREATE TABLE IF NOT EXISTS rendezvous (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255),
    description TEXT,
    date_rdv TIMESTAMP NOT NULL,
    date_fin TIMESTAMP,
    statut statut_rdv DEFAULT 'Planifie',
    sujet sujet_type DEFAULT 'intervention',
    intervention_id BIGINT REFERENCES intervention(id) ON DELETE SET NULL,
    site_id BIGINT REFERENCES site(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rapport_ticket (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    matricule VARCHAR(20) REFERENCES agent(matricule) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS ticket_historique_responsable (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    ancien_responsable_matricule VARCHAR(20) REFERENCES agent(matricule) ON DELETE SET NULL,
    nouveau_responsable_matricule VARCHAR(20) REFERENCES agent(matricule) ON DELETE SET NULL,
    modifie_par_matricule VARCHAR(20),
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_agent (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_fin TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS site_agent (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_fin TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS site_responsable (
    id SERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    role TEXT DEFAULT 'Responsable',
    date_debut TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    fonction_id BIGINT NOT NULL REFERENCES fonction(id) ON DELETE CASCADE,
    principal BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS equipe (
    id SERIAL PRIMARY KEY,
    agence_id BIGINT NOT NULL REFERENCES agence(id) ON DELETE CASCADE,
    nom VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS agent_equipe (
    id SERIAL PRIMARY KEY,
    equipe_id BIGINT NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agence_membre (
    id SERIAL PRIMARY KEY,
    agence_id BIGINT NOT NULL REFERENCES agence(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    role role_agence DEFAULT 'Membre'
);

-- Associations (doit exister avant facture/devis)
CREATE TABLE IF NOT EXISTS association (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    email_comptabilite VARCHAR(255),
    adresse_id INTEGER REFERENCES adresse(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS association_responsable (
    id SERIAL PRIMARY KEY,
    association_id INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    UNIQUE (association_id, agent_matricule)
);

CREATE TABLE IF NOT EXISTS association_agent (
    id SERIAL PRIMARY KEY,
    association_id INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    UNIQUE (association_id, agent_matricule)
);

CREATE TABLE IF NOT EXISTS association_site (
    id SERIAL PRIMARY KEY,
    association_id INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    UNIQUE (association_id, site_id)
);

CREATE TABLE IF NOT EXISTS devis (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    montant NUMERIC(12, 2),
    status devis_status DEFAULT 'Brouillon',
    association_id INTEGER REFERENCES association(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achat (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(100),
    affaire_id BIGINT REFERENCES affaire(id) ON DELETE SET NULL,
    site_id BIGINT REFERENCES site(id) ON DELETE SET NULL,
    statut statut_achat DEFAULT 'Brouillon'
);

CREATE TABLE IF NOT EXISTS facture (
    id SERIAL PRIMARY KEY,
    intervention_id BIGINT REFERENCES intervention(id) ON DELETE SET NULL,
    client_id BIGINT REFERENCES client(id) ON DELETE SET NULL,
    association_id INTEGER REFERENCES association(id) ON DELETE SET NULL,
    titre VARCHAR(255),
    reference VARCHAR(50),
    date_emission DATE,
    date_echeance DATE,
    heures_saisies NUMERIC(12,2) DEFAULT 0,
    heures_calculees NUMERIC(12,2) DEFAULT 0,
    taux_horaire NUMERIC(10,2) DEFAULT 0,
    total_heures_ht NUMERIC(12,2) DEFAULT 0,
    taux_majoration_materiel NUMERIC(6,2) DEFAULT 0,
    total_materiel_ht NUMERIC(12,2) DEFAULT 0,
    deplacement_qte NUMERIC(10,2) DEFAULT 0,
    deplacement_pu NUMERIC(10,2) DEFAULT 0,
    divers_ht NUMERIC(12,2) DEFAULT 0,
    tva_taux NUMERIC(6,2) DEFAULT 20,
    total_deplacement_ht NUMERIC(12,2) DEFAULT 0,
    total_tva NUMERIC(12,2) DEFAULT 0,
    total_ht NUMERIC(12,2) DEFAULT 0,
    total_ttc NUMERIC(12,2) DEFAULT 0,
    statut statut_facture DEFAULT 'Brouillon'
);

CREATE TABLE IF NOT EXISTS reglement (
    id SERIAL PRIMARY KEY,
    facture_id BIGINT NOT NULL REFERENCES facture(id) ON DELETE CASCADE,
    montant NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    nom_fichier VARCHAR(255),
    type_mime VARCHAR(100),
    taille_octets BIGINT,
    image_blob BYTEA,
    commentaire_image TEXT,
    auteur_matricule VARCHAR(20) REFERENCES agent(matricule) ON DELETE SET NULL,
    cible_type doc_cible_type,
    cible_id BIGINT
);



CREATE TABLE IF NOT EXISTS messagerie (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    ticket_id BIGINT REFERENCES ticket(id) ON DELETE SET NULL,
    demande_id BIGINT REFERENCES demande_client(id) ON DELETE SET NULL,
    client_id BIGINT REFERENCES client(id) ON DELETE SET NULL,
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messagerie_attachment (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messagerie(id) ON DELETE CASCADE,
    file_blob BYTEA,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rendu_intervention (
    id SERIAL PRIMARY KEY,
    intervention_id BIGINT NOT NULL REFERENCES intervention(id) ON DELETE CASCADE,
    resume TEXT,
    valeur TEXT
);

CREATE TABLE IF NOT EXISTS rendu_intervention_image (
    id SERIAL PRIMARY KEY,
    rendu_intervention_id BIGINT NOT NULL REFERENCES rendu_intervention(id) ON DELETE CASCADE,
    image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents_repertoire (
    id SERIAL PRIMARY KEY,
    cible_type doc_cible_type,
    cible_id BIGINT,
    titre VARCHAR(255),
    commentaire TEXT,
    nature doc_nature DEFAULT 'Document',
    nom_fichier VARCHAR(255),
    type_mime VARCHAR(100),
    taille_octets BIGINT,
    chemin_fichier VARCHAR(255),
    checksum_sha256 VARCHAR(255),
    auteur_matricule VARCHAR(20) REFERENCES agent(matricule) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS client_representant (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nom VARCHAR(255),
    email VARCHAR(255),
    tel VARCHAR(50),
    fonction VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS client_association (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    association_id INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_id, association_id)
);

CREATE TABLE IF NOT EXISTS client_contrat (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    contrat_id BIGINT NOT NULL REFERENCES contrat(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_id, contrat_id)
);

CREATE TABLE IF NOT EXISTS ticket_satisfaction (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL UNIQUE REFERENCES ticket(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating INT,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    envoieok BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS association (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    email_comptabilite VARCHAR(255),
    adresse_id INTEGER REFERENCES adresse(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS association_responsable (
    id SERIAL PRIMARY KEY,
    association_id INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    UNIQUE (association_id, agent_matricule)
);

CREATE TABLE IF NOT EXISTS association_agent (
    id SERIAL PRIMARY KEY,
    association_id INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
    agent_matricule VARCHAR(20) NOT NULL REFERENCES agent(matricule) ON DELETE CASCADE,
    UNIQUE (association_id, agent_matricule)
);

CREATE TABLE IF NOT EXISTS association_site (
    id SERIAL PRIMARY KEY,
    association_id INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    UNIQUE (association_id, site_id)
);

CREATE TABLE IF NOT EXISTS devis (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    montant NUMERIC(12, 2),
    status devis_status DEFAULT 'Brouillon',
    association_id INTEGER REFERENCES association(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
