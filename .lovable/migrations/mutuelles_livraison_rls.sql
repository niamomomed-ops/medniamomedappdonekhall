-- Prompt 86 — Autoriser admin + agent_vente à mettre à jour le statut de livraison
-- À exécuter manuellement dans l'éditeur SQL Supabase.

-- Remplace l'ancienne policy admin-only par une policy admin + agent_vente.
DROP POLICY IF EXISTS "dm_update_admin" ON public.demandes_mutuelles;
DROP POLICY IF EXISTS "dm_update_admin_agent" ON public.demandes_mutuelles;

CREATE POLICY "dm_update_admin_agent" ON public.demandes_mutuelles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','agent_vente')
    )
  );

-- Vérification :
-- SELECT id, numero_demande, livree, livree_at, statut FROM public.demandes_mutuelles;
