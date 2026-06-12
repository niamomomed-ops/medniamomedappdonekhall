ALTER TABLE public.commandes ADD COLUMN IF NOT EXISTS based_on_id uuid REFERENCES public.commandes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commandes_based_on_id ON public.commandes(based_on_id);