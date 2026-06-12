
CREATE TABLE IF NOT EXISTS public.demandes_mutuelles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_demande TEXT UNIQUE NOT NULL DEFAULT ('MUT-' || lpad(nextval('public.mutuelle_numero_seq')::text, 5, '0')),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organisme TEXT,
  source_correction TEXT NOT NULL CHECK (source_correction IN ('interne', 'externe', 'mixte')),
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'remplie', 'livree')),
  livree BOOLEAN DEFAULT false,
  livree_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remplie_at TIMESTAMPTZ,
  remplie_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  beneficiaire_nom TEXT,
  beneficiaire_date_naissance DATE,
  beneficiaire_organisme TEXT,
  prix_monture NUMERIC(10,2),
  prix_verre NUMERIC(10,2),
  total_remboursement NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS public.demande_mutuelle_commandes (
  demande_id UUID NOT NULL REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  source_correction TEXT NOT NULL CHECK (source_correction IN ('interne', 'externe')),
  PRIMARY KEY (demande_id, commande_id)
);

CREATE TABLE IF NOT EXISTS public.demande_mutuelle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'statut_remplie', 'statut_en_attente', 'statut_livraison_livree')),
  old_statut TEXT,
  new_statut TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demandes_mutuelles_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changed_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mutuelle_justificatifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  commande_id UUID REFERENCES public.commandes(id) ON DELETE CASCADE,
  montant NUMERIC(10,2) NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_felicitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  felicite_date DATE NOT NULL,
  felicite_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (client_id, felicite_date)
);

CREATE TABLE IF NOT EXISTS public.client_versements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS demandes_mutuelles_client_idx ON public.demandes_mutuelles(client_id);
CREATE INDEX IF NOT EXISTS demandes_mutuelles_statut_idx ON public.demandes_mutuelles(statut);
CREATE INDEX IF NOT EXISTS demandes_mutuelles_created_by_idx ON public.demandes_mutuelles(created_by);
CREATE INDEX IF NOT EXISTS dmc_commande_idx ON public.demande_mutuelle_commandes(commande_id);
CREATE INDEX IF NOT EXISTS dmh_demande_idx ON public.demande_mutuelle_history(demande_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS client_versements_client_id_idx ON public.client_versements(client_id);
CREATE INDEX IF NOT EXISTS client_versements_caisse_id_idx ON public.client_versements(caisse_id);
CREATE INDEX IF NOT EXISTS dettes_client_idx ON public.dettes(client_id);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.demandes_mutuelles TO authenticated;
GRANT ALL ON public.demandes_mutuelles TO service_role;
GRANT SELECT, INSERT, DELETE ON public.demande_mutuelle_commandes TO authenticated;
GRANT ALL ON public.demande_mutuelle_commandes TO service_role;
GRANT SELECT, INSERT ON public.demande_mutuelle_history TO authenticated;
GRANT ALL ON public.demande_mutuelle_history TO service_role;
GRANT SELECT, INSERT ON public.demandes_mutuelles_history TO authenticated;
GRANT ALL ON public.demandes_mutuelles_history TO service_role;
GRANT SELECT, INSERT, DELETE ON public.mutuelle_justificatifs TO authenticated;
GRANT ALL ON public.mutuelle_justificatifs TO service_role;
GRANT SELECT, INSERT ON public.dettes TO authenticated;
GRANT ALL ON public.dettes TO service_role;
GRANT SELECT, INSERT ON public.client_felicitations TO authenticated;
GRANT ALL ON public.client_felicitations TO service_role;
GRANT SELECT, INSERT, DELETE ON public.client_versements TO authenticated;
GRANT ALL ON public.client_versements TO service_role;

-- RLS
ALTER TABLE public.demandes_mutuelles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demande_mutuelle_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demande_mutuelle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_mutuelles_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutuelle_justificatifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_felicitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_versements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "dm_select" ON public.demandes_mutuelles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente','agent_montage')
    )
  );
CREATE POLICY "dm_insert" ON public.demandes_mutuelles
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente')
    )
  );
CREATE POLICY "dm_update_admin_agent" ON public.demandes_mutuelles
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente')
    )
  );
CREATE POLICY "dm_delete" ON public.demandes_mutuelles
  FOR DELETE TO authenticated USING (
    statut = 'en_attente'
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
    )
  );

CREATE POLICY "dmc_select" ON public.demande_mutuelle_commandes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente','agent_montage')
    )
  );
CREATE POLICY "dmc_insert" ON public.demande_mutuelle_commandes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente')
    )
  );

CREATE POLICY "dmh_select" ON public.demande_mutuelle_history
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente','agent_montage')
    )
  );
CREATE POLICY "dmh_insert" ON public.demande_mutuelle_history
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','agent_vente')
    )
  );

CREATE POLICY "mutuelle_history_read" ON public.demandes_mutuelles_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "mutuelle_history_insert" ON public.demandes_mutuelles_history
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'agent_vente')
  ));

CREATE POLICY "mj_select" ON public.mutuelle_justificatifs FOR SELECT TO authenticated USING (true);
CREATE POLICY "mj_insert" ON public.mutuelle_justificatifs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mj_delete" ON public.mutuelle_justificatifs FOR DELETE TO authenticated USING (true);

CREATE POLICY "dettes_select" ON public.dettes FOR SELECT TO authenticated USING (true);
CREATE POLICY "dettes_insert" ON public.dettes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "cf_select" ON public.client_felicitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "cf_insert" ON public.client_felicitations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "cv_select_auth" ON public.client_versements FOR SELECT TO authenticated USING (true);
CREATE POLICY "cv_insert_auth" ON public.client_versements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cv_delete_auth" ON public.client_versements FOR DELETE TO authenticated USING (true);
