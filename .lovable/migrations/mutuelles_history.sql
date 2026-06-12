-- Prompt 76 — Historique des demandes mutuelles
-- À exécuter manuellement dans l'éditeur SQL Supabase.

CREATE TABLE IF NOT EXISTS public.demande_mutuelle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','statut_remplie','statut_en_attente')),
  old_statut TEXT,
  new_statut TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dmh_demande_idx
  ON public.demande_mutuelle_history(demande_id, changed_at DESC);

GRANT SELECT, INSERT ON public.demande_mutuelle_history TO authenticated;
GRANT ALL ON public.demande_mutuelle_history TO service_role;

ALTER TABLE public.demande_mutuelle_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmh_select" ON public.demande_mutuelle_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente','agent_montage')
    )
  );

CREATE POLICY "dmh_insert" ON public.demande_mutuelle_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente')
    )
  );
