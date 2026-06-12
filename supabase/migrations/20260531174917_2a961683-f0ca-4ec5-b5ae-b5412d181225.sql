-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','agent_vente','agent_montage');
CREATE TYPE public.commande_type AS ENUM ('vision_loin','vision_pres','double_foyer','progressif','lentilles');
CREATE TYPE public.commande_status AS ENUM ('commande_creee','verre_commande','verre_recu','en_montage','casse_montage','finalise','en_reception','livree');
CREATE TYPE public.caisse_status AS ENUM ('open','closed');
CREATE TYPE public.transaction_type AS ENUM ('entree','sortie');
CREATE TYPE public.personnel_status AS ENUM ('active','suspended');
CREATE TYPE public.monture_source AS ENUM ('boutique','donnee');
CREATE TYPE public.eye_side AS ENUM ('od','og','both');
CREATE TYPE public.prescription_type AS ENUM ('interne','externe');
CREATE TYPE public.mutuelle AS ENUM ('AMO','CNSS','FAR','CNOPS','SANLAM','Autre');
CREATE TYPE public.payment_mode AS ENUM ('especes','carte','virement','autre');

-- user_roles
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "user_roles own read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles admin all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- personnel
CREATE TABLE public.personnel (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  role public.app_role NOT NULL,
  status public.personnel_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personnel read" ON public.personnel FOR SELECT TO authenticated USING (true);
CREATE POLICY "personnel admin write" ON public.personnel FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- clients
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet text NOT NULL,
  date_naissance date,
  email text,
  telephone text,
  adresse text,
  cin text,
  mutuelle public.mutuelle,
  mutuelle_autre text,
  whatsapp text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients all auth" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- fournisseurs
CREATE TABLE public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  email text,
  telephone text,
  whatsapp text,
  adresse text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fournisseurs read" ON public.fournisseurs FOR SELECT TO authenticated USING (true);
CREATE POLICY "fournisseurs admin write" ON public.fournisseurs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- prescriptions
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.prescription_type NOT NULL,
  date_prescription date,
  od_sphere numeric(6,2),
  od_cylinder numeric(6,2),
  od_axe smallint,
  od_addition numeric(6,2),
  og_sphere numeric(6,2),
  og_cylinder numeric(6,2),
  og_axe smallint,
  og_addition numeric(6,2),
  correction_par text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescriptions all auth" ON public.prescriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- caisses
CREATE TABLE public.caisses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  status public.caisse_status NOT NULL DEFAULT 'open',
  opened_at timestamptz,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_close_at timestamptz,
  auto_closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closing_balance numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caisses read" ON public.caisses FOR SELECT TO authenticated USING (true);
CREATE POLICY "caisses write" ON public.caisses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'));

-- commandes
CREATE TABLE public.commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande text,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE SET NULL,
  based_on_id uuid REFERENCES public.commandes(id) ON DELETE SET NULL,
  type public.commande_type NOT NULL,
  status public.commande_status NOT NULL DEFAULT 'commande_creee',
  montant numeric(14,2) NOT NULL DEFAULT 0,
  avance numeric(14,2) NOT NULL DEFAULT 0,
  reste numeric(14,2),
  urgent boolean NOT NULL DEFAULT false,
  eyes_ordered public.eye_side,
  date_livraison date,
  monture_source public.monture_source,
  monture_marque text,
  monture_client_provided boolean,
  monture_client_called_at timestamptz,
  monture_client_called_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  monture_client_received_at timestamptz,
  monture_client_received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reception_client_called_at timestamptz,
  reception_client_called_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  casse_eye public.eye_side,
  casse_note text,
  casse_at timestamptz,
  casse_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type_verres text,
  lentilles text,
  quantite integer NOT NULL DEFAULT 1,
  notes text,
  od_sphere numeric(6,2),
  od_cylinder numeric(6,2),
  od_axe smallint,
  od_addition numeric(6,2),
  og_sphere numeric(6,2),
  og_cylinder numeric(6,2),
  og_axe smallint,
  og_addition numeric(6,2),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commandes all auth" ON public.commandes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id uuid NOT NULL REFERENCES public.caisses(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  amount numeric(14,2) NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions all auth" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- order_history
CREATE TABLE public.order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_history TO authenticated;
GRANT ALL ON public.order_history TO service_role;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_history all auth" ON public.order_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- progressive_measurements
CREATE TABLE public.progressive_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  ecart_pupillaire_od numeric(6,2),
  ecart_pupillaire_og numeric(6,2),
  hauteur_pupillaire_od numeric(6,2),
  hauteur_pupillaire_og numeric(6,2),
  grand_diametre numeric(6,2),
  hauteur_calibre numeric(6,2),
  pont numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progressive_measurements TO authenticated;
GRANT ALL ON public.progressive_measurements TO service_role;
ALTER TABLE public.progressive_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progressive_measurements all auth" ON public.progressive_measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- versements
CREATE TABLE public.versements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE RESTRICT,
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versements all auth" ON public.versements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- indexes
CREATE INDEX ON public.commandes (client_id);
CREATE INDEX ON public.commandes (caisse_id);
CREATE INDEX ON public.commandes (status);
CREATE INDEX ON public.commandes (created_at DESC);
CREATE INDEX ON public.order_history (commande_id);
CREATE INDEX ON public.transactions (caisse_id);
CREATE INDEX ON public.versements (commande_id);
CREATE INDEX ON public.prescriptions (client_id);