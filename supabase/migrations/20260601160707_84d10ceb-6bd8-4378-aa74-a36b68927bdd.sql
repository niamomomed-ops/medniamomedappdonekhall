
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');
CREATE TYPE public.commande_type AS ENUM ('vision_loin','vision_pres','double_foyer','progressif','lentilles');
CREATE TYPE public.commande_status AS ENUM ('commande_creee','verre_commande','verre_recu','en_montage','casse_montage','finalise','en_reception','livree');

-- Helper: updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================
-- user_roles
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "auth read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- =========================
-- personnel
-- =========================
CREATE TABLE public.personnel (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read personnel" ON public.personnel FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage personnel" ON public.personnel FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_personnel_updated BEFORE UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- clients
-- =========================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet TEXT NOT NULL,
  date_naissance DATE NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  adresse TEXT NOT NULL,
  cin TEXT,
  mutuelle TEXT,
  mutuelle_autre TEXT,
  whatsapp TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all clients" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- fournisseurs
-- =========================
CREATE TABLE public.fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  whatsapp TEXT,
  adresse TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all fournisseurs" ON public.fournisseurs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fournisseurs_updated BEFORE UPDATE ON public.fournisseurs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- caisses
-- =========================
CREATE TABLE public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ,
  opened_by UUID,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  auto_close_at TIMESTAMPTZ,
  auto_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all caisses" ON public.caisses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================
-- transactions
-- =========================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entree','sortie')),
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all transactions" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================
-- prescriptions
-- =========================
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC(6,2) NOT NULL DEFAULT 0,
  od_cylinder NUMERIC(6,2) NOT NULL DEFAULT 0,
  od_axe INTEGER NOT NULL DEFAULT 0,
  od_addition NUMERIC(6,2) NOT NULL DEFAULT 0,
  og_sphere NUMERIC(6,2) NOT NULL DEFAULT 0,
  og_cylinder NUMERIC(6,2) NOT NULL DEFAULT 0,
  og_axe INTEGER NOT NULL DEFAULT 0,
  og_addition NUMERIC(6,2) NOT NULL DEFAULT 0,
  correction_par TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all prescriptions" ON public.prescriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================
-- commandes
-- =========================
CREATE SEQUENCE public.commandes_numero_seq START 1;

CREATE TABLE public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  based_on_id UUID REFERENCES public.commandes(id) ON DELETE SET NULL,
  type public.commande_type NOT NULL,
  status public.commande_status NOT NULL DEFAULT 'commande_creee',
  montant NUMERIC(14,2) NOT NULL DEFAULT 0,
  avance NUMERIC(14,2) NOT NULL DEFAULT 0,
  reste NUMERIC(14,2) NOT NULL DEFAULT 0,
  urgent BOOLEAN NOT NULL DEFAULT false,
  eyes_ordered TEXT NOT NULL DEFAULT 'both',
  date_livraison DATE,
  monture_source TEXT,
  monture_marque TEXT,
  monture_client_provided BOOLEAN,
  monture_client_called_at TIMESTAMPTZ,
  monture_client_called_by UUID,
  monture_client_received_at TIMESTAMPTZ,
  monture_client_received_by UUID,
  reception_client_called_at TIMESTAMPTZ,
  reception_client_called_by UUID,
  casse_eye TEXT,
  casse_note TEXT,
  casse_at TIMESTAMPTZ,
  casse_by UUID,
  type_verres TEXT,
  lentilles TEXT,
  quantite INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  od_sphere NUMERIC(6,2), od_cylinder NUMERIC(6,2), od_axe INTEGER, od_addition NUMERIC(6,2),
  og_sphere NUMERIC(6,2), og_cylinder NUMERIC(6,2), og_axe INTEGER, og_addition NUMERIC(6,2),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all commandes" ON public.commandes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_commande_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_commande IS NULL THEN
    NEW.numero_commande := 'CMD-' || LPAD(nextval('public.commandes_numero_seq')::text, 5, '0');
  END IF;
  NEW.reste := GREATEST(0, COALESCE(NEW.montant,0) - COALESCE(NEW.avance,0));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_commandes_insert BEFORE INSERT ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.set_commande_defaults();
CREATE TRIGGER trg_commandes_updated BEFORE UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- progressive_measurements
-- =========================
CREATE TABLE public.progressive_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  ecart_pupillaire_od NUMERIC(6,2),
  ecart_pupillaire_og NUMERIC(6,2),
  hauteur_pupillaire_od NUMERIC(6,2),
  hauteur_pupillaire_og NUMERIC(6,2),
  grand_diametre NUMERIC(6,2),
  hauteur_calibre NUMERIC(6,2),
  pont NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progressive_measurements TO authenticated;
GRANT ALL ON public.progressive_measurements TO service_role;
ALTER TABLE public.progressive_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all pm" ON public.progressive_measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================
-- order_history
-- =========================
CREATE TABLE public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_history TO authenticated;
GRANT ALL ON public.order_history TO service_role;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all order_history" ON public.order_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================
-- versements
-- =========================
CREATE TABLE public.versements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all versements" ON public.versements FOR ALL TO authenticated USING (true) WITH CHECK (true);
