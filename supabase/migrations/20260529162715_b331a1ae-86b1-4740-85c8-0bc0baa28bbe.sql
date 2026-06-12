UPDATE auth.users
SET email_confirmed_at = now()
WHERE email IN ('admin@demo.local','vente@demo.local','montage@demo.local')
  AND email_confirmed_at IS NULL;