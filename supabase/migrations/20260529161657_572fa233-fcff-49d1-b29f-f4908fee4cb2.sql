-- ENUM for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');

-- =========================================================
-- user_roles
-- =========================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can self-assign their role" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- has_role helper (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================================
-- personnel
-- =========================================================
CREATE TABLE public.personnel (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read personnel" ON public.personnel
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage personnel" ON public.personnel
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- clients
-- =========================================================
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet text NOT NULL,
  date_naissance date,
  email text,
  telephone text,
  adresse text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage clients" ON public.clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- fournisseurs
-- =========================================================
CREATE TABLE public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  email text,
  telephone text,
  whatsapp text,
  adresse text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage fournisseurs" ON public.fournisseurs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- prescriptions
-- =========================================================
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
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
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage prescriptions" ON public.prescriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- caisses
-- =========================================================
CREATE TABLE public.caisses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz,
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  auto_close_at timestamptz,
  auto_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage caisses" ON public.caisses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- commandes
-- =========================================================
CREATE SEQUENCE IF NOT EXISTS public.commande_numero_seq START 1;

CREATE TABLE public.commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE SET NULL,
  type text,
  status text NOT NULL DEFAULT 'commande_creee',
  date_livraison date,
  montant numeric NOT NULL DEFAULT 0,
  avance numeric NOT NULL DEFAULT 0,
  reste numeric NOT NULL DEFAULT 0,
  quantite integer NOT NULL DEFAULT 1,
  monture_source text,
  monture_marque text,
  monture_client_provided boolean,
  monture_client_called_at timestamptz,
  monture_client_called_by uuid,
  monture_client_received_at timestamptz,
  monture_client_received_by uuid,
  reception_client_called_at timestamptz,
  reception_client_called_by uuid,
  type_verres text,
  lentilles text,
  notes text,
  urgent boolean NOT NULL DEFAULT false,
  eyes_ordered text NOT NULL DEFAULT 'both' CHECK (eyes_ordered IN ('od','og','both')),
  od_sphere numeric,
  od_cylinder numeric,
  od_axe integer,
  od_addition numeric,
  og_sphere numeric,
  og_cylinder numeric,
  og_axe integer,
  og_addition numeric,
  casse_eye text,
  casse_note text,
  casse_at timestamptz,
  casse_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage commandes" ON public.commandes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.commandes_before_insert()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.numero_commande IS NULL THEN
    NEW.numero_commande := 'CMD-' || lpad(nextval('public.commande_numero_seq')::text, 5, '0');
  END IF;
  IF NEW.reste IS NULL OR NEW.reste = 0 THEN
    NEW.reste := GREATEST(0, COALESCE(NEW.montant, 0) - COALESCE(NEW.avance, 0));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER commandes_before_insert_trg
  BEFORE INSERT ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.commandes_before_insert();

-- =========================================================
-- order_history
-- =========================================================
CREATE TABLE public.order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_history TO authenticated;
GRANT ALL ON public.order_history TO service_role;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage order_history" ON public.order_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- progressive_measurements
-- =========================================================
CREATE TABLE public.progressive_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  ecart_pupillaire_od numeric,
  ecart_pupillaire_og numeric,
  hauteur_pupillaire_od numeric,
  hauteur_pupillaire_og numeric,
  grand_diametre numeric,
  hauteur_calibre numeric,
  pont numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progressive_measurements TO authenticated;
GRANT ALL ON public.progressive_measurements TO service_role;
ALTER TABLE public.progressive_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage progressive_measurements" ON public.progressive_measurements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- transactions
-- =========================================================
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id uuid NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage transactions" ON public.transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- versements
-- =========================================================
CREATE TABLE public.versements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage versements" ON public.versements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);