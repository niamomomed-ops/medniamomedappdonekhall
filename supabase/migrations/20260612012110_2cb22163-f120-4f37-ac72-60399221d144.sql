
CREATE TABLE IF NOT EXISTS public.fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  whatsapp TEXT,
  adresse TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_balance NUMERIC(10,2) DEFAULT 0,
  closing_balance NUMERIC(10,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('interne', 'externe')),
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC(10,2),
  od_cylinder NUMERIC(10,2),
  od_axe INTEGER CHECK (od_axe >= 0 AND od_axe <= 180),
  od_addition NUMERIC(10,2),
  og_sphere NUMERIC(10,2),
  og_cylinder NUMERIC(10,2),
  og_axe INTEGER CHECK (og_axe >= 0 AND og_axe <= 180),
  og_addition NUMERIC(10,2),
  correction_par TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande TEXT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('vision_loin', 'vision_pres', 'double_foyer', 'progressif', 'lentilles')),
  status TEXT NOT NULL DEFAULT 'commande_creee' CHECK (status IN ('commande_creee', 'verre_commande', 'reception_partielle', 'reclamation', 'verre_recu', 'en_montage', 'casse_montage', 'finalise', 'en_reception', 'livree')),
  date_livraison DATE,
  montant NUMERIC(10,2) NOT NULL DEFAULT 0,
  avance NUMERIC(10,2) NOT NULL DEFAULT 0,
  reste NUMERIC(10,2) DEFAULT 0,
  urgent BOOLEAN DEFAULT false,
  eyes_ordered TEXT CHECK (eyes_ordered IN ('both', 'od', 'og')),
  ordered_eye TEXT,
  od_received_at TIMESTAMPTZ,
  og_received_at TIMESTAMPTZ,
  monture_source TEXT CHECK (monture_source IN ('boutique', 'donnee')),
  monture_marque TEXT,
  monture_client_provided BOOLEAN DEFAULT false,
  monture_client_called_at TIMESTAMPTZ,
  monture_client_called_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  monture_client_received_at TIMESTAMPTZ,
  monture_client_received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reception_client_called_at TIMESTAMPTZ,
  reception_client_called_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type_verres TEXT,
  lentilles TEXT,
  quantite INTEGER DEFAULT 1,
  notes TEXT,
  lentille_type TEXT CHECK (lentille_type IS NULL OR lentille_type IN ('origine', 'spherique')),
  based_on_id UUID REFERENCES public.commandes(id) ON DELETE SET NULL,
  casse_eye TEXT CHECK (casse_eye IN ('od', 'og', 'both')),
  casse_note TEXT,
  casse_at TIMESTAMPTZ,
  casse_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  casse_sent_at TIMESTAMPTZ,
  casse_resolved_at TIMESTAMPTZ,
  casse_resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reclamation_detail JSONB,
  reclamation_sent_at TIMESTAMPTZ,
  reclamation_resolved_at TIMESTAMPTZ,
  reclamation_resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deletion_reason TEXT,
  deletion_caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  status_before_delete TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.versements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID REFERENCES public.commandes(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entree', 'sortie')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_manual BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.progressive_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  ecart_pupillaire_od NUMERIC(10,2),
  ecart_pupillaire_og NUMERIC(10,2),
  hauteur_pupillaire_od NUMERIC(10,2),
  hauteur_pupillaire_og NUMERIC(10,2),
  grand_diametre NUMERIC(10,2),
  hauteur_calibre NUMERIC(10,2),
  pont NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS order_history_commande_idx ON public.order_history(commande_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS versements_commande_idx ON public.versements(commande_id);
CREATE INDEX IF NOT EXISTS versements_client_idx ON public.versements(client_id);
CREATE INDEX IF NOT EXISTS transactions_caisse_idx ON public.transactions(caisse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commandes_client_idx ON public.commandes(client_id);
CREATE INDEX IF NOT EXISTS commandes_status_idx ON public.commandes(status);
CREATE INDEX IF NOT EXISTS commandes_caisse_idx ON public.commandes(caisse_id);
CREATE INDEX IF NOT EXISTS prescriptions_client_idx ON public.prescriptions(client_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
GRANT SELECT, INSERT, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
GRANT SELECT, INSERT ON public.order_history TO authenticated;
GRANT ALL ON public.order_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progressive_measurements TO authenticated;
GRANT ALL ON public.progressive_measurements TO service_role;

-- RLS
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progressive_measurements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "fourn_select" ON public.fournisseurs FOR SELECT TO authenticated USING (true);
CREATE POLICY "fourn_insert" ON public.fournisseurs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "caisses_select" ON public.caisses FOR SELECT TO authenticated USING (true);
CREATE POLICY "caisses_insert" ON public.caisses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "caisses_update" ON public.caisses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prescr_select" ON public.prescriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "prescr_insert" ON public.prescriptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prescr_update" ON public.prescriptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prescr_delete" ON public.prescriptions FOR DELETE TO authenticated USING (true);
CREATE POLICY "cmd_select" ON public.commandes FOR SELECT TO authenticated USING (true);
CREATE POLICY "cmd_insert" ON public.commandes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cmd_update" ON public.commandes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vers_select" ON public.versements FOR SELECT TO authenticated USING (true);
CREATE POLICY "vers_insert" ON public.versements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vers_delete" ON public.versements FOR DELETE TO authenticated USING (true);
CREATE POLICY "tx_select" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "tx_insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tx_update" ON public.transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tx_delete" ON public.transactions FOR DELETE TO authenticated USING (true);
CREATE POLICY "oh_select" ON public.order_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "oh_insert" ON public.order_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pm_select" ON public.progressive_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "pm_insert" ON public.progressive_measurements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pm_update" ON public.progressive_measurements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pm_delete" ON public.progressive_measurements FOR DELETE TO authenticated USING (true);
