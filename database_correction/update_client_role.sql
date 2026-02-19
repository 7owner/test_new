UPDATE users SET roles='["ROLE_CLIENT"]'::jsonb WHERE email='takotuemabou@outlook.com';
SELECT id,email,roles FROM users ORDER BY id;
