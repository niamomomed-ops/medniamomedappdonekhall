-- Fix: la suppression d'une demande mutuelle renvoyait "succès"
-- côté UI mais ne supprimait rien — il manquait une policy DELETE
-- sur public.demandes_mutuelles (RLS activé, aucune policy DELETE).
-- À exécuter manuellement dans le SQL Editor Supabase.

GRANT DELETE ON public.demandes_mutuelles TO authenticated;

DROP POLICY IF EXISTS "dm_delete" ON public.demandes_mutuelles;

CREATE POLICY "dm_delete" ON public.demandes_mutuelles
  FOR DELETE TO authenticated
  USING (
    statut = 'en_attente'
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
    )
  );
