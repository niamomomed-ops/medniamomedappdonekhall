-- Prompt 87 — Table d'historique pour demandes_mutuelles (OPTIONNEL).
-- À exécuter manuellement dans l'éditeur SQL Supabase UNIQUEMENT si la table
-- demande_mutuelle_history n'existe pas déjà dans le projet.
-- (Le code applicatif utilise déjà demande_mutuelle_history en best-effort.)

CREATE TABLE IF NOT EXISTS public.demandes_mutuelles_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,           -- 'en_attente', 'remplie', 'livree'
  changed_by UUID REFERENCES public.personnel(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT ON public.demandes_mutuelles_history TO authenticated;
GRANT ALL ON public.demandes_mutuelles_history TO service_role;

ALTER TABLE public.demandes_mutuelles_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mutuelle_history_read" ON public.demandes_mutuelles_history;
CREATE POLICY "mutuelle_history_read" ON public.demandes_mutuelles_history
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mutuelle_history_insert" ON public.demandes_mutuelles_history;
CREATE POLICY "mutuelle_history_insert" ON public.demandes_mutuelles_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'agent_vente')
  ));
