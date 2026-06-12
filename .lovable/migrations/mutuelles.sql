-- Prompt 75 — Section Mutuelles
-- Tables: demandes_mutuelles + demande_mutuelle_commandes
-- Plus colonnes mutuelle_demande_id / target_user_id sur notifications pour le routing UI.

CREATE SEQUENCE IF NOT EXISTS public.mutuelle_numero_seq START 1;

CREATE TABLE IF NOT EXISTS public.demandes_mutuelles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_demande TEXT UNIQUE NOT NULL
    DEFAULT ('MUT-' || lpad(nextval('public.mutuelle_numero_seq')::text, 5, '0')),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organisme TEXT,
  source_correction TEXT NOT NULL CHECK (source_correction IN ('interne','externe','mixte')),
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','remplie')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remplie_at TIMESTAMPTZ,
  remplie_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.demande_mutuelle_commandes (
  demande_id UUID NOT NULL REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  source_correction TEXT NOT NULL CHECK (source_correction IN ('interne','externe')),
  PRIMARY KEY (demande_id, commande_id)
);

CREATE INDEX IF NOT EXISTS demandes_mutuelles_client_idx ON public.demandes_mutuelles(client_id);
CREATE INDEX IF NOT EXISTS demandes_mutuelles_statut_idx ON public.demandes_mutuelles(statut);
CREATE INDEX IF NOT EXISTS demandes_mutuelles_created_by_idx ON public.demandes_mutuelles(created_by);
CREATE INDEX IF NOT EXISTS dmc_commande_idx ON public.demande_mutuelle_commandes(commande_id);

GRANT SELECT, INSERT, UPDATE ON public.demandes_mutuelles TO authenticated;
GRANT ALL ON public.demandes_mutuelles TO service_role;
GRANT SELECT, INSERT, DELETE ON public.demande_mutuelle_commandes TO authenticated;
GRANT ALL ON public.demande_mutuelle_commandes TO service_role;
GRANT USAGE ON SEQUENCE public.mutuelle_numero_seq TO authenticated;

ALTER TABLE public.demandes_mutuelles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demande_mutuelle_commandes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_select" ON public.demandes_mutuelles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente','agent_montage')
    )
  );

CREATE POLICY "dm_insert" ON public.demandes_mutuelles
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente')
    )
  );

CREATE POLICY "dm_update_admin" ON public.demandes_mutuelles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "dmc_select" ON public.demande_mutuelle_commandes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente','agent_montage')
    )
  );

CREATE POLICY "dmc_insert" ON public.demande_mutuelle_commandes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente')
    )
  );

-- Pour cibler les notifications mutuelles (sticky bar, navigation).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS mutuelle_demande_id UUID
    REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_user_id UUID
    REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_mutuelle_demande_idx
  ON public.notifications(mutuelle_demande_id);
CREATE INDEX IF NOT EXISTS notifications_target_user_idx
  ON public.notifications(target_user_id);
