
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');

-- ============= USER_ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============= updated_at helper =============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============= PERSONNEL =============
CREATE TABLE public.personnel (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read personnel" ON public.personnel
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage personnel" ON public.personnel
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_personnel_updated BEFORE UPDATE ON public.personnel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= CLIENTS =============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet TEXT NOT NULL,
  date_naissance DATE,
  email TEXT,
  telephone TEXT,
  adresse TEXT,
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
CREATE POLICY "Staff read clients" ON public.clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Sales manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'));
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= FOURNISSEURS =============
CREATE TABLE public.fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  whatsapp TEXT,
  adresse TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read fournisseurs" ON public.fournisseurs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Admins manage fournisseurs" ON public.fournisseurs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fournisseurs_updated BEFORE UPDATE ON public.fournisseurs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= PRESCRIPTIONS =============
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC,
  od_cylinder NUMERIC,
  od_axe INTEGER,
  od_addition NUMERIC,
  og_sphere NUMERIC,
  og_cylinder NUMERIC,
  og_axe INTEGER,
  og_addition NUMERIC,
  correction_par TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read prescriptions" ON public.prescriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Sales manage prescriptions" ON public.prescriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'));
CREATE TRIGGER trg_prescriptions_updated BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= CAISSES =============
CREATE TABLE public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  opened_by UUID,
  closed_by UUID,
  auto_close_at TIMESTAMPTZ,
  auto_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read caisses" ON public.caisses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Sales manage caisses" ON public.caisses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'));
CREATE TRIGGER trg_caisses_updated BEFORE UPDATE ON public.caisses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= TRANSACTIONS =============
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read transactions" ON public.transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Sales manage transactions" ON public.transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'));

-- ============= COMMANDES =============
CREATE TABLE public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande TEXT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  based_on_id UUID REFERENCES public.commandes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'commande_creee',
  type TEXT NOT NULL,
  montant NUMERIC NOT NULL DEFAULT 0,
  avance NUMERIC NOT NULL DEFAULT 0,
  reste NUMERIC,
  urgent BOOLEAN NOT NULL DEFAULT false,
  eyes_ordered TEXT,
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
  od_sphere NUMERIC,
  od_cylinder NUMERIC,
  od_axe INTEGER,
  od_addition NUMERIC,
  og_sphere NUMERIC,
  og_cylinder NUMERIC,
  og_axe INTEGER,
  og_addition NUMERIC,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read commandes" ON public.commandes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Staff write commandes" ON public.commandes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE TRIGGER trg_commandes_updated BEFORE UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate numero_commande
CREATE SEQUENCE IF NOT EXISTS public.commande_seq;
CREATE OR REPLACE FUNCTION public.set_commande_numero()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero_commande IS NULL THEN
    NEW.numero_commande := 'CMD-' || LPAD(nextval('public.commande_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_commandes_numero BEFORE INSERT ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.set_commande_numero();

-- ============= VERSEMENTS =============
CREATE TABLE public.versements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read versements" ON public.versements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Sales manage versements" ON public.versements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'));

-- ============= ORDER_HISTORY =============
CREATE TABLE public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_history TO authenticated;
GRANT ALL ON public.order_history TO service_role;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read history" ON public.order_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Staff write history" ON public.order_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));

-- ============= PROGRESSIVE_MEASUREMENTS =============
CREATE TABLE public.progressive_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL UNIQUE REFERENCES public.commandes(id) ON DELETE CASCADE,
  ecart_pupillaire_od NUMERIC,
  ecart_pupillaire_og NUMERIC,
  hauteur_pupillaire_od NUMERIC,
  hauteur_pupillaire_og NUMERIC,
  grand_diametre NUMERIC,
  hauteur_calibre NUMERIC,
  pont NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progressive_measurements TO authenticated;
GRANT ALL ON public.progressive_measurements TO service_role;
ALTER TABLE public.progressive_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read measurements" ON public.progressive_measurements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente') OR public.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "Sales manage measurements" ON public.progressive_measurements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_vente'));
