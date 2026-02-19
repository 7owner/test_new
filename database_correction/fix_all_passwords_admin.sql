UPDATE users
SET password = '$2b$10$ZVi8PZCnI9RKYxXlUW7kUu3M98YhUipLuqnCb/X0JB0MfgqsKBn1W'
WHERE email IN (
  'maboujunior777@gmail.com',
  'channelhongnia@gmail.com',
  'takotuemabou@outlook.com',
  'pierre.bernard@example.com',
  'marie.petit@example.com'
);

SELECT id, email, length(password) AS pwd_len, password
FROM users
ORDER BY id;
