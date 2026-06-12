DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'jabbour@gmail.com' LIMIT 1;
  IF uid IS NULL THEN RETURN; END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.personnel (id, name, email, role, status)
  VALUES (uid, 'Admin', 'jabbour@gmail.com', 'admin', 'active')
  ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active';
END $$;
