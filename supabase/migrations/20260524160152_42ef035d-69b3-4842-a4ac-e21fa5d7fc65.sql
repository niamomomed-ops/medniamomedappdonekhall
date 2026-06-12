-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id ORDER BY created_at ASC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.get_user_role(_user_id UUID)
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id ORDER BY created_at ASC LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can self-assign initial role" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()));

-- Personnel
CREATE TYPE public.personnel_status AS ENUM ('active', 'suspended');

CREATE TABLE public.personnel (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  status public.personnel_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all personnel" ON public.personnel FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own personnel record" ON public.personnel FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can insert personnel" ON public.personnel FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update personnel" ON public.personnel FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete personnel" ON public.personnel FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- Caisses
CREATE TYPE public.caisse_status AS ENUM ('open', 'closed');

CREATE TABLE public.caisses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  opening_balance numeric(14,2),
  status public.caisse_status NOT NULL DEFAULT 'closed',
  opened_at timestamptz,
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX caisses_only_one_open ON public.caisses ((status)) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER caisses_set_updated_at BEFORE UPDATE ON public.caisses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or vente can view caisses" ON public.caisses FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent_vente'::app_role));
CREATE POLICY "Admin or vente can insert caisses" ON public.caisses FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent_vente'::app_role));
CREATE POLICY "Admin or vente can update caisses" ON public.caisses FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent_vente'::app_role));
CREATE POLICY "Admins can delete caisses" ON public.caisses FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role(UUID) FROM PUBLIC, anon, authenticated;

-- Transactions
CREATE TYPE public.transaction_type AS ENUM ('entree', 'sortie');

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_caisse_id ON public.transactions(caisse_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or vente can view transactions"
ON public.transactions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent_vente'::app_role));

CREATE POLICY "Admin or vente can insert transactions"
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent_vente'::app_role))
);