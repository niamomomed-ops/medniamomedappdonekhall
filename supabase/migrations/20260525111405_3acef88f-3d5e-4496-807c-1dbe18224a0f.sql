
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');

-- user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- personnel table
CREATE TABLE public.personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  role app_role NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

-- clients table
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet text NOT NULL,
  date_naissance date NOT NULL,
  email text NOT NULL,
  telephone text NOT NULL,
  adresse text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- fournisseurs table
CREATE TABLE public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  email text NOT NULL,
  telephone text NOT NULL,
  whatsapp text,
  adresse text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;

-- prescriptions table
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  date_prescription date NOT NULL,
  od_sphere numeric,
  od_cylinder numeric,
  od_axe integer,
  od_addition numeric,
  og_sphere numeric,
  og_cylinder numeric,
  og_axe integer,
  og_addition numeric,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- caisses table
CREATE TABLE public.caisses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_balance numeric DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamp with time zone DEFAULT now(),
  opened_by uuid REFERENCES auth.users(id),
  closed_at timestamp with time zone,
  closed_by uuid REFERENCES auth.users(id),
  label text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;

-- transactions table
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- commandes table
CREATE TABLE public.commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande text,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE SET NULL,
  type text NOT NULL,
  date_livraison date,
  montant numeric NOT NULL DEFAULT 1,
  avance numeric NOT NULL DEFAULT 1,
  reste numeric,
  monture_source text,
  type_verres text,
  lentilles text,
  quantite integer NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL DEFAULT 'commande_creee',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;

-- order_history table
CREATE TABLE public.order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid REFERENCES public.commandes(id) ON DELETE CASCADE NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

-- progressive_measurements table
CREATE TABLE public.progressive_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid REFERENCES public.commandes(id) ON DELETE CASCADE NOT NULL,
  ecart_pupillaire_od numeric,
  ecart_pupillaire_og numeric,
  hauteur_pupillaire_od numeric,
  hauteur_pupillaire_og numeric,
  grand_diametre numeric,
  hauteur_calibre numeric,
  pont numeric,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.progressive_measurements ENABLE ROW LEVEL SECURITY;

-- Create has_role helper function for RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "user_roles_select_all" ON public.user_roles
FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_roles_insert_own" ON public.user_roles
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_roles_admin_all" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS policies for personnel
CREATE POLICY "personnel_select_all" ON public.personnel
FOR SELECT TO authenticated USING (true);

CREATE POLICY "personnel_admin_all" ON public.personnel
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS policies for clients
CREATE POLICY "clients_select_all" ON public.clients
FOR SELECT TO authenticated USING (true);

CREATE POLICY "clients_insert_all" ON public.clients
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "clients_update_all" ON public.clients
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "clients_delete_all" ON public.clients
FOR DELETE TO authenticated USING (true);

-- RLS policies for fournisseurs
CREATE POLICY "fournisseurs_select_all" ON public.fournisseurs
FOR SELECT TO authenticated USING (true);

CREATE POLICY "fournisseurs_admin_all" ON public.fournisseurs
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS policies for prescriptions
CREATE POLICY "prescriptions_select_all" ON public.prescriptions
FOR SELECT TO authenticated USING (true);

CREATE POLICY "prescriptions_insert_all" ON public.prescriptions
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "prescriptions_update_all" ON public.prescriptions
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "prescriptions_delete_all" ON public.prescriptions
FOR DELETE TO authenticated USING (true);

-- RLS policies for caisses
CREATE POLICY "caisses_select_all" ON public.caisses
FOR SELECT TO authenticated USING (true);

CREATE POLICY "caisses_insert_all" ON public.caisses
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "caisses_update_all" ON public.caisses
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "caisses_delete_all" ON public.caisses
FOR DELETE TO authenticated USING (true);

-- RLS policies for transactions
CREATE POLICY "transactions_select_all" ON public.transactions
FOR SELECT TO authenticated USING (true);

CREATE POLICY "transactions_insert_all" ON public.transactions
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "transactions_update_all" ON public.transactions
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "transactions_delete_all" ON public.transactions
FOR DELETE TO authenticated USING (true);

-- RLS policies for commandes
CREATE POLICY "commandes_select_all" ON public.commandes
FOR SELECT TO authenticated USING (true);

CREATE POLICY "commandes_insert_all" ON public.commandes
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "commandes_update_all" ON public.commandes
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "commandes_delete_all" ON public.commandes
FOR DELETE TO authenticated USING (true);

-- RLS policies for order_history
CREATE POLICY "order_history_select_all" ON public.order_history
FOR SELECT TO authenticated USING (true);

CREATE POLICY "order_history_insert_all" ON public.order_history
FOR INSERT TO authenticated WITH CHECK (true);

-- RLS policies for progressive_measurements
CREATE POLICY "progressive_measurements_select_all" ON public.progressive_measurements
FOR SELECT TO authenticated USING (true);

CREATE POLICY "progressive_measurements_insert_all" ON public.progressive_measurements
FOR INSERT TO authenticated WITH CHECK (true);
