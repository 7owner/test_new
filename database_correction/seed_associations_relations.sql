BEGIN;

INSERT INTO association (titre, email_comptabilite, adresse_id)
VALUES
('Association ACME Paris', 'compta-acme@example.com', (SELECT id FROM adresse WHERE libelle='Siege' LIMIT 1)),
('Association BETA Lille', 'compta-beta@example.com', (SELECT id FROM adresse WHERE libelle='Entrepot' LIMIT 1));

INSERT INTO client_association (client_id, association_id)
VALUES
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM association WHERE titre='Association ACME Paris')),
((SELECT id FROM client WHERE nom_client='Client BETA'), (SELECT id FROM association WHERE titre='Association BETA Lille'));

INSERT INTO association_site (association_id, site_id)
VALUES
((SELECT id FROM association WHERE titre='Association ACME Paris'), (SELECT id FROM site WHERE nom_site='Site Paris 1')),
((SELECT id FROM association WHERE titre='Association ACME Paris'), (SELECT id FROM site WHERE nom_site='Site Lyon 1')),
((SELECT id FROM association WHERE titre='Association BETA Lille'), (SELECT id FROM site WHERE nom_site='Site Lille 1'));

INSERT INTO association_responsable (association_id, agent_matricule)
VALUES
((SELECT id FROM association WHERE titre='Association ACME Paris'), 'AGT001'),
((SELECT id FROM association WHERE titre='Association BETA Lille'), 'AGT002');

INSERT INTO association_agent (association_id, agent_matricule)
VALUES
((SELECT id FROM association WHERE titre='Association ACME Paris'), 'AGT003'),
((SELECT id FROM association WHERE titre='Association ACME Paris'), 'AGT005'),
((SELECT id FROM association WHERE titre='Association BETA Lille'), 'AGT004');

COMMIT;
