-- Normalize roles stored as JSON strings into JSON arrays
UPDATE users SET roles='["ROLE_ADMIN"]'::jsonb WHERE roles::text='"ROLE_ADMIN"';
UPDATE users SET roles='["ROLE_USER"]'::jsonb  WHERE roles::text='"ROLE_USER"';
UPDATE users SET roles='["ROLE_CLIENT"]'::jsonb WHERE roles::text='"ROLE_CLIENT"';

-- Fix common email typos from faulty seed (missing @ or dots)
UPDATE users SET email='maboujunior777@gmail.com'
  WHERE email IN ('maboujunior777gmail.com','maboujunior777@gmailcom')
     OR email LIKE 'maboujunior777%gmail%';

UPDATE users SET email='pierre.bernard@example.com'
  WHERE email IN ('pierre.bernardexample.com','pierre.bernard@examplecom')
     OR email LIKE 'pierre.bernard%example%';

UPDATE users SET email='marie.petit@example.com'
  WHERE email IN ('marie.petitexample.com','marie.petit@examplecom')
     OR email LIKE 'marie.petit%example%';

