
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');
CREATE TYPE public.personnel_status AS ENUM ('active', 'suspended');
CREATE TYPE public.caisse_status AS ENUM ('open', 'closed');
CREATE TYPE public.transaction_type AS ENUM ('entree', 'sortie');
CREATE TYPE public.prescription_type AS ENUM ('interne', 'externe');
CREATE TYPE public.commande_type AS ENUM ('vision_loin', 'vision_pres', 'double_foyer', 'progressif', 'lentilles');
CREATE TYPE public.monture_source AS ENUM ('boutique', 'donnee');
CREATE TYPE public.commande_status AS ENUM (
  'commande_creee',
  'verre_commande',
  'verre_recu',
  'en_montage',
  'casse_montage',
  'finalise',
  'en_reception',
  'livree'
);

-- =========================================
-- SHARED FUNCTIONS
-- =========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================================
-- PERSONNEL (must reference auth.users id)
-- =========================================
CREATE TABLE public.personnel (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  status public.personnel_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

-- =========================================
-- USER_ROLES
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========================================
-- AUTO-CREATE personnel + user_role ON SIGNUP
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_name TEXT;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'agent_vente');
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  INSERT INTO public.personnel (id, name, email, role, status)
  VALUES (NEW.id, v_name, NEW.email, v_role, 'active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Personnel policies
CREATE POLICY "Personnel can view own row" ON public.personnel FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Authenticated can view personnel basics" ON public.personnel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages personnel" ON public.personnel FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin manages roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- CLIENTS
-- =========================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet TEXT NOT NULL,
  date_naissance DATE NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  adresse TEXT NOT NULL,
  created_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Staff can view clients" ON public.clients FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);
CREATE POLICY "Sales/Admin manage clients" ON public.clients FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);

-- =========================================
-- FOURNISSEURS
-- =========================================
CREATE TABLE public.fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  whatsapp TEXT,
  adresse TEXT NOT NULL,
  created_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fournisseurs_updated BEFORE UPDATE ON public.fournisseurs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Staff can view fournisseurs" ON public.fournisseurs FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);
CREATE POLICY "Admin manages fournisseurs" ON public.fournisseurs FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================
-- CAISSES
-- =========================================
CREATE TABLE public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT,
  status public.caisse_status NOT NULL DEFAULT 'open',
  opening_balance NUMERIC(12,2) DEFAULT 0,
  opened_at TIMESTAMPTZ,
  opened_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_caisses_updated BEFORE UPDATE ON public.caisses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE UNIQUE INDEX caisses_one_open_idx ON public.caisses (status) WHERE status = 'open';

CREATE POLICY "Sales/Admin view caisses" ON public.caisses FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);
CREATE POLICY "Sales/Admin manage caisses" ON public.caisses FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);

-- =========================================
-- TRANSACTIONS
-- =========================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.personnel(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales/Admin view transactions" ON public.transactions FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);
CREATE POLICY "Sales/Admin insert transactions" ON public.transactions FOR INSERT WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);

-- =========================================
-- PRESCRIPTIONS
-- =========================================
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.prescription_type NOT NULL,
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC(5,2) NOT NULL DEFAULT 0,
  od_cylinder NUMERIC(5,2) NOT NULL DEFAULT 0,
  od_axe INTEGER NOT NULL DEFAULT 0,
  od_addition NUMERIC(5,2) NOT NULL DEFAULT 0,
  og_sphere NUMERIC(5,2) NOT NULL DEFAULT 0,
  og_cylinder NUMERIC(5,2) NOT NULL DEFAULT 0,
  og_axe INTEGER NOT NULL DEFAULT 0,
  og_addition NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_prescriptions_updated BEFORE UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Staff view prescriptions" ON public.prescriptions FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);
CREATE POLICY "Sales/Admin manage prescriptions" ON public.prescriptions FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);

-- =========================================
-- COMMANDES
-- =========================================
CREATE SEQUENCE public.commande_numero_seq;

CREATE TABLE public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  type public.commande_type NOT NULL,
  date_livraison DATE,
  montant NUMERIC(12,2) NOT NULL DEFAULT 0,
  avance NUMERIC(12,2) NOT NULL DEFAULT 0,
  reste NUMERIC(12,2) NOT NULL DEFAULT 0,
  monture_source public.monture_source,
  type_verres TEXT,
  lentilles TEXT,
  quantite INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  status public.commande_status NOT NULL DEFAULT 'commande_creee',
  created_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commandes_updated BEFORE UPDATE ON public.commandes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- numero_commande + reste auto
CREATE OR REPLACE FUNCTION public.commandes_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero_commande IS NULL THEN
    NEW.numero_commande := 'CMD-' || to_char(now(),'YYYY') || '-' ||
                           lpad(nextval('public.commande_numero_seq')::text, 4, '0');
  END IF;
  NEW.reste := COALESCE(NEW.montant,0) - COALESCE(NEW.avance,0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commandes_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.reste := COALESCE(NEW.montant,0) - COALESCE(NEW.avance,0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commandes_before_insert BEFORE INSERT ON public.commandes
FOR EACH ROW EXECUTE FUNCTION public.commandes_before_insert();
CREATE TRIGGER trg_commandes_before_update BEFORE UPDATE ON public.commandes
FOR EACH ROW EXECUTE FUNCTION public.commandes_before_update();

CREATE POLICY "Staff view commandes" ON public.commandes FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);
CREATE POLICY "Sales/Admin insert commandes" ON public.commandes FOR INSERT WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);
CREATE POLICY "Staff update commandes" ON public.commandes FOR UPDATE USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);
CREATE POLICY "Admin delete commandes" ON public.commandes FOR DELETE USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- ORDER HISTORY
-- =========================================
CREATE TABLE public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status public.commande_status,
  new_status public.commande_status NOT NULL,
  changed_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX order_history_commande_idx ON public.order_history (commande_id, changed_at DESC);

CREATE POLICY "Staff view order_history" ON public.order_history FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);
CREATE POLICY "Staff insert order_history" ON public.order_history FOR INSERT WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);

-- =========================================
-- PROGRESSIVE MEASUREMENTS
-- =========================================
CREATE TABLE public.progressive_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL UNIQUE REFERENCES public.commandes(id) ON DELETE CASCADE,
  ecart_pupillaire_od NUMERIC(5,2),
  ecart_pupillaire_og NUMERIC(5,2),
  hauteur_pupillaire_od NUMERIC(5,2),
  hauteur_pupillaire_og NUMERIC(5,2),
  grand_diametre NUMERIC(5,2),
  hauteur_calibre NUMERIC(5,2),
  pont NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.progressive_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view progressive" ON public.progressive_measurements FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage')
);
CREATE POLICY "Sales/Admin manage progressive" ON public.progressive_measurements FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente')
);
