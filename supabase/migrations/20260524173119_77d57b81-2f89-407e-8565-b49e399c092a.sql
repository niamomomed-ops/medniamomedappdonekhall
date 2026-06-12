CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');
CREATE TYPE public.personnel_status AS ENUM ('active', 'suspended');
CREATE TYPE public.caisse_status AS ENUM ('open', 'closed');
CREATE TYPE public.transaction_type AS ENUM ('entree', 'sortie');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.personnel (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  status public.personnel_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all personnel"
ON public.personnel FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own personnel record"
ON public.personnel FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can insert personnel"
ON public.personnel FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update personnel"
ON public.personnel FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete personnel"
ON public.personnel FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.caisses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  opening_balance numeric(14,2),
  status public.caisse_status NOT NULL DEFAULT 'closed',
  opened_at timestamptz,
  opened_by uuid REFERENCES public.personnel(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX caisses_only_one_open ON public.caisses ((status)) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER caisses_set_updated_at
BEFORE UPDATE ON public.caisses
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or vente can view caisses"
ON public.caisses FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'));

CREATE POLICY "Admin or vente can insert caisses"
ON public.caisses FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'));

CREATE POLICY "Admin or vente can update caisses"
ON public.caisses FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'))
WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'));

CREATE POLICY "Admins can delete caisses"
ON public.caisses FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id uuid NOT NULL REFERENCES public.caisses(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  description text,
  created_by uuid NOT NULL REFERENCES public.personnel(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_caisse_id ON public.transactions(caisse_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or vente can view transactions"
ON public.transactions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'));

CREATE POLICY "Admin or vente can insert transactions"
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'))
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet text NOT NULL,
  date_naissance date NOT NULL,
  email text NOT NULL UNIQUE,
  telephone text NOT NULL,
  adresse text NOT NULL,
  created_by uuid REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_created_at ON public.clients(created_at DESC);

CREATE TRIGGER clients_set_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or vente can view clients"
ON public.clients FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'));

CREATE POLICY "Admin or vente can insert clients"
ON public.clients FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'))
);

CREATE POLICY "Admin or vente can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'))
WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'));

CREATE POLICY "Admin or vente can delete clients"
ON public.clients FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'agent_vente'));

DO $seed$
DECLARE
  accounts jsonb := '[
    {"email":"admin@demo.local","role":"admin","name":"Admin Demo"},
    {"email":"vente@demo.local","role":"agent_vente","name":"Vente Demo"},
    {"email":"montage@demo.local","role":"agent_montage","name":"Montage Demo"}
  ]'::jsonb;
  acc jsonb;
  uid uuid;
BEGIN
  FOR acc IN SELECT * FROM jsonb_array_elements(accounts) LOOP
    SELECT id INTO uid FROM auth.users WHERE email = acc->>'email' LIMIT 1;
    IF uid IS NULL THEN
      uid := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        acc->>'email', crypt('password', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false,
        '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        created_at, updated_at, last_sign_in_at
      ) VALUES (
        gen_random_uuid(), uid,
        jsonb_build_object('sub', uid::text, 'email', acc->>'email'),
        'email', uid::text, now(), now(), now()
      );
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, (acc->>'role')::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.personnel (id, name, email, role, status)
    VALUES (uid, acc->>'name', acc->>'email', (acc->>'role')::public.app_role, 'active')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      status = 'active';
  END LOOP;
END $seed$;