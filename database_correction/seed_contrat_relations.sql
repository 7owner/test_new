BEGIN;

INSERT INTO contrat (titre, client_id, site_id, date_debut, date_fin, metier, type)
VALUES
('Contrat ACME Paris 2026', (SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM site WHERE nom_site='Site Paris 1'), DATE '2026-01-01', DATE '2026-12-31', 'GTB', 'Maintenance'),
('Contrat ACME Lyon 2026',  (SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM site WHERE nom_site='Site Lyon 1'),  DATE '2026-01-01', DATE '2026-12-31', 'Video', 'Maintenance'),
('Contrat BETA Lille 2026', (SELECT id FROM client WHERE nom_client='Client BETA'), (SELECT id FROM site WHERE nom_site='Site Lille 1'), DATE '2026-02-01', DATE '2026-12-31', 'GTB', 'Projet');

INSERT INTO client_contrat (client_id, contrat_id)
VALUES
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM contrat WHERE titre='Contrat ACME Paris 2026')),
((SELECT id FROM client WHERE nom_client='Client ACME'), (SELECT id FROM contrat WHERE titre='Contrat ACME Lyon 2026')),
((SELECT id FROM client WHERE nom_client='Client BETA'), (SELECT id FROM contrat WHERE titre='Contrat BETA Lille 2026'));

INSERT INTO contrat_site_association (contrat_id, site_id)
VALUES
((SELECT id FROM contrat WHERE titre='Contrat ACME Paris 2026'), (SELECT id FROM site WHERE nom_site='Site Paris 1')),
((SELECT id FROM contrat WHERE titre='Contrat ACME Lyon 2026'),  (SELECT id FROM site WHERE nom_site='Site Lyon 1')),
((SELECT id FROM contrat WHERE titre='Contrat BETA Lille 2026'), (SELECT id FROM site WHERE nom_site='Site Lille 1'));

COMMIT;
