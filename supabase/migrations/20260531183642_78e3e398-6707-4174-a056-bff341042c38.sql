
-- Helper trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ========== clients ==========
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
CREATE POLICY "auth all clients" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========== fournisseurs ==========
CREATE TABLE public.fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  whatsapp TEXT,
  adresse TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all fournisseurs" ON public.fournisseurs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== personnel ==========
CREATE TABLE public.personnel (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all personnel" ON public.personnel FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== prescriptions ==========
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC,
  od_cylinder NUMERIC,
  od_axe INT,
  od_addition NUMERIC,
  og_sphere NUMERIC,
  og_cylinder NUMERIC,
  og_axe INT,
  og_addition NUMERIC,
  correction_par TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all prescriptions" ON public.prescriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== caisses ==========
CREATE TABLE public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ,
  opened_by UUID,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  closing_balance NUMERIC,
  auto_close_at TIMESTAMPTZ,
  auto_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all caisses" ON public.caisses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== transactions ==========
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
CREATE POLICY "auth all transactions" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== commandes ==========
CREATE SEQUENCE IF NOT EXISTS public.commandes_numero_seq START 1000;

CREATE TABLE public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande TEXT UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'commande_creee',
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
  monture_client_received_at TIMESTAMPTZ,
  reception_client_called_at TIMESTAMPTZ,
  casse_eye TEXT,
  casse_note TEXT,
  casse_at TIMESTAMPTZ,
  type_verres TEXT,
  lentilles TEXT,
  quantite INT NOT NULL DEFAULT 1,
  notes TEXT,
  od_sphere NUMERIC, od_cylinder NUMERIC, od_axe INT, od_addition NUMERIC,
  og_sphere NUMERIC, og_cylinder NUMERIC, og_axe INT, og_addition NUMERIC,
  based_on_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all commandes" ON public.commandes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-assign numero_commande and compute reste
CREATE OR REPLACE FUNCTION public.commandes_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_commande IS NULL THEN
    NEW.numero_commande := 'CMD-' || nextval('public.commandes_numero_seq');
  END IF;
  IF NEW.reste IS NULL THEN
    NEW.reste := GREATEST(0, COALESCE(NEW.montant,0) - COALESCE(NEW.avance,0));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commandes_bi BEFORE INSERT ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.commandes_before_insert();

-- ========== versements ==========
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
CREATE POLICY "auth all versements" ON public.versements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== order_history ==========
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

-- ========== progressive_measurements ==========
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
CREATE POLICY "auth all progressive_measurements" ON public.progressive_measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);
