-- À exécuter dans le SQL Editor de Lovable Cloud (Prompt 60)

-- 1. Nouvelle table
CREATE TABLE IF NOT EXISTS public.client_versements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  caisse_id UUID REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS client_versements_client_id_idx
  ON public.client_versements(client_id);
CREATE INDEX IF NOT EXISTS client_versements_caisse_id_idx
  ON public.client_versements(caisse_id);

GRANT SELECT, INSERT, DELETE ON public.client_versements TO authenticated;
GRANT ALL ON public.client_versements TO service_role;

ALTER TABLE public.client_versements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_select_auth" ON public.client_versements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cv_insert_auth" ON public.client_versements
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cv_delete_auth" ON public.client_versements
  FOR DELETE TO authenticated USING (true);

-- 2. Migration des anciens versements globaux (commande_id NULL) vers client_versements
INSERT INTO public.client_versements
  (id, client_id, caisse_id, amount, note, created_by, created_at)
SELECT id, client_id, caisse_id, amount, note, created_by, created_at
FROM public.versements
WHERE commande_id IS NULL
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.versements WHERE commande_id IS NULL;
