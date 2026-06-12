
-- ============ ENUMS ============
CREATE TYPE public.commande_status AS ENUM (
  'commande_creee','verre_commande','verre_recu','en_montage',
  'casse_montage','finalise','en_reception','livree'
);
CREATE TYPE public.commande_type AS ENUM (
  'vision_loin','vision_pres','double_foyer','progressif','lentilles'
);
CREATE TYPE public.caisse_status AS ENUM ('open','closed');
CREATE TYPE public.tx_type AS ENUM ('entree','sortie');
CREATE TYPE public.eye_side AS ENUM ('od','og','both');
CREATE TYPE public.monture_source AS ENUM ('boutique','donnee');
CREATE TYPE public.prescription_type AS ENUM ('interne','externe');
CREATE TYPE public.personnel_status AS ENUM ('active','suspended');
CREATE TYPE public.mutuelle_type AS ENUM ('AMO','CNSS','FAR','CNOPS','SANLAM','Autre');

-- ============ COMMON: updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============ PERSONNEL ============
CREATE TABLE public.personnel (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  status public.personnel_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all personnel" ON public.personnel FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_personnel_updated BEFORE UPDATE ON public.personnel
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet TEXT NOT NULL,
  date_naissance DATE NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  adresse TEXT NOT NULL,
  cin TEXT,
  mutuelle public.mutuelle_type,
  mutuelle_autre TEXT,
  whatsapp TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all clients" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FOURNISSEURS ============
CREATE TABLE public.fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  whatsapp TEXT,
  adresse TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all fournisseurs" ON public.fournisseurs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fournisseurs_updated BEFORE UPDATE ON public.fournisseurs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PRESCRIPTIONS ============
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.prescription_type NOT NULL,
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC NOT NULL,
  od_cylinder NUMERIC NOT NULL,
  od_axe INTEGER NOT NULL,
  od_addition NUMERIC NOT NULL,
  og_sphere NUMERIC NOT NULL,
  og_cylinder NUMERIC NOT NULL,
  og_axe INTEGER NOT NULL,
  og_addition NUMERIC NOT NULL,
  correction_par TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prescriptions_client ON public.prescriptions(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all prescriptions" ON public.prescriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ CAISSES ============
CREATE TABLE public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  status public.caisse_status NOT NULL DEFAULT 'open',
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_close_at TIMESTAMPTZ,
  auto_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_caisses_only_one_open ON public.caisses(status) WHERE status = 'open';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all caisses" ON public.caisses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ TRANSACTIONS ============
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type public.tx_type NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_caisse ON public.transactions(caisse_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all transactions" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ COMMANDES ============
CREATE SEQUENCE public.commandes_numero_seq START 1;

CREATE TABLE public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  type public.commande_type,
  status public.commande_status NOT NULL DEFAULT 'commande_creee',
  date_livraison DATE,
  montant NUMERIC NOT NULL DEFAULT 0,
  avance NUMERIC NOT NULL DEFAULT 0,
  reste NUMERIC,
  urgent BOOLEAN NOT NULL DEFAULT false,
  quantite INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  monture_source public.monture_source,
  monture_marque TEXT,
  monture_client_provided BOOLEAN,
  monture_client_called_at TIMESTAMPTZ,
  monture_client_called_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  monture_client_received_at TIMESTAMPTZ,
  monture_client_received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reception_client_called_at TIMESTAMPTZ,
  reception_client_called_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type_verres TEXT,
  lentilles TEXT,
  od_sphere NUMERIC, od_cylinder NUMERIC, od_axe INTEGER, od_addition NUMERIC,
  og_sphere NUMERIC, og_cylinder NUMERIC, og_axe INTEGER, og_addition NUMERIC,
  eyes_ordered public.eye_side,
  based_on_id UUID REFERENCES public.commandes(id) ON DELETE SET NULL,
  casse_eye public.eye_side,
  casse_note TEXT,
  casse_at TIMESTAMPTZ,
  casse_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commandes_client ON public.commandes(client_id);
CREATE INDEX idx_commandes_caisse ON public.commandes(caisse_id);
CREATE INDEX idx_commandes_status ON public.commandes(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all commandes" ON public.commandes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- numero_commande + reste + updated_at
CREATE OR REPLACE FUNCTION public.commandes_before_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.numero_commande IS NULL THEN
    NEW.numero_commande := 'CMD-' || lpad(nextval('public.commandes_numero_seq')::text, 6, '0');
  END IF;
  IF NEW.reste IS NULL OR TG_OP = 'INSERT' THEN
    NEW.reste := GREATEST(0, COALESCE(NEW.montant,0) - COALESCE(NEW.avance,0));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_commandes_before_write
  BEFORE INSERT OR UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.commandes_before_write();

-- ============ ORDER_HISTORY ============
CREATE TABLE public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_history_cmd ON public.order_history(commande_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_history TO authenticated;
GRANT ALL ON public.order_history TO service_role;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all order_history" ON public.order_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ VERSEMENTS ============
CREATE TABLE public.versements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_versements_cmd ON public.versements(commande_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all versements" ON public.versements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PROGRESSIVE_MEASUREMENTS ============
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
CREATE POLICY "auth all progressive" ON public.progressive_measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ AUTO: create personnel + default role on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.personnel (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'agent_vente',
    'active'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
