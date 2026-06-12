
-- ============ ENUMS ============
DO $$ BEGIN CREATE TYPE public.commande_type AS ENUM ('vision_loin','vision_pres','double_foyer','progressif','lentilles'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.commande_status AS ENUM ('commande_creee','verre_commande','verre_recu','en_montage','casse_montage','finalise','en_reception','livree'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.eyes_choice AS ENUM ('both','od','og'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.monture_source AS ENUM ('boutique','donnee'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.prescription_type AS ENUM ('interne','externe'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tx_type AS ENUM ('entree','sortie'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_mode AS ENUM ('especes','carte','virement','autre'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CAISSES: add missing columns ============
ALTER TABLE public.caisses
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT false;

-- ============ CLIENTS ============
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet TEXT NOT NULL,
  date_naissance DATE,
  email TEXT,
  telephone TEXT,
  adresse TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_read" ON public.clients FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "clients_write" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));

-- ============ FOURNISSEURS ============
CREATE TABLE IF NOT EXISTS public.fournisseurs (
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
CREATE POLICY "fourn_read" ON public.fournisseurs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "fourn_write" ON public.fournisseurs FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY "fourn_update" ON public.fournisseurs FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));
CREATE POLICY "fourn_delete" ON public.fournisseurs FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));

-- ============ PRESCRIPTIONS ============
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.prescription_type NOT NULL,
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC(6,2), od_cylinder NUMERIC(6,2), od_axe INT, od_addition NUMERIC(6,2),
  og_sphere NUMERIC(6,2), og_cylinder NUMERIC(6,2), og_axe INT, og_addition NUMERIC(6,2),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presc_read" ON public.prescriptions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "presc_write" ON public.prescriptions FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "presc_update" ON public.prescriptions FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "presc_delete" ON public.prescriptions FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));

-- ============ COMMANDES ============
CREATE SEQUENCE IF NOT EXISTS public.commandes_numero_seq;

CREATE TABLE IF NOT EXISTS public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande TEXT UNIQUE DEFAULT ('CMD-' || lpad(nextval('public.commandes_numero_seq')::text, 5, '0')),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  type public.commande_type,
  status public.commande_status NOT NULL DEFAULT 'commande_creee',
  montant NUMERIC(12,2) NOT NULL DEFAULT 0,
  avance NUMERIC(12,2) NOT NULL DEFAULT 0,
  reste NUMERIC(12,2) GENERATED ALWAYS AS (montant - avance) STORED,
  urgent BOOLEAN NOT NULL DEFAULT false,
  eyes_ordered public.eyes_choice NOT NULL DEFAULT 'both',
  date_livraison DATE,
  monture_source public.monture_source,
  monture_marque TEXT,
  monture_client_provided BOOLEAN,
  monture_client_called_at TIMESTAMPTZ,
  monture_client_received_at TIMESTAMPTZ,
  monture_client_received_by UUID,
  reception_client_called_at TIMESTAMPTZ,
  reception_client_called_by UUID,
  casse_eye TEXT,
  casse_note TEXT,
  casse_at TIMESTAMPTZ,
  type_verres TEXT,
  lentilles TEXT,
  quantite INT NOT NULL DEFAULT 1,
  notes TEXT,
  od_sphere NUMERIC(6,2), od_cylinder NUMERIC(6,2), od_axe INT, od_addition NUMERIC(6,2),
  og_sphere NUMERIC(6,2), og_cylinder NUMERIC(6,2), og_axe INT, og_addition NUMERIC(6,2),
  based_on_id UUID REFERENCES public.commandes(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmd_read" ON public.commandes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "cmd_write" ON public.commandes FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "cmd_update" ON public.commandes FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "cmd_delete" ON public.commandes FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_commandes_client ON public.commandes(client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_caisse ON public.commandes(caisse_id);
CREATE INDEX IF NOT EXISTS idx_commandes_status ON public.commandes(status);

-- ============ PROGRESSIVE MEASUREMENTS ============
CREATE TABLE IF NOT EXISTS public.progressive_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL UNIQUE REFERENCES public.commandes(id) ON DELETE CASCADE,
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
CREATE POLICY "pm_all" ON public.progressive_measurements FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'))
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));

-- ============ ORDER HISTORY ============
CREATE TABLE IF NOT EXISTS public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_history TO authenticated;
GRANT ALL ON public.order_history TO service_role;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oh_read" ON public.order_history FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "oh_write" ON public.order_history FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE INDEX IF NOT EXISTS idx_order_history_cmd ON public.order_history(commande_id);

-- ============ TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type public.tx_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx_read" ON public.transactions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "tx_write" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "tx_update" ON public.transactions FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));
CREATE POLICY "tx_delete" ON public.transactions FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_tx_caisse ON public.transactions(caisse_id);

-- ============ VERSEMENTS ============
CREATE TABLE IF NOT EXISTS public.versements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_mode public.payment_mode,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vers_read" ON public.versements FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente') OR private.has_role(auth.uid(),'agent_montage'));
CREATE POLICY "vers_write" ON public.versements FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'agent_vente'));
CREATE POLICY "vers_delete" ON public.versements FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_vers_cmd ON public.versements(commande_id);

-- ============ TRIGGERS updated_at ============
CREATE TRIGGER trg_clients_upd BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fourn_upd BEFORE UPDATE ON public.fournisseurs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cmd_upd BEFORE UPDATE ON public.commandes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
