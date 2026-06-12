ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS caisse_id uuid,
  ADD COLUMN IF NOT EXISTS avance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS numero_commande text;

ALTER TABLE public.caisses
  ADD COLUMN IF NOT EXISTS closing_balance numeric;

CREATE INDEX IF NOT EXISTS idx_commandes_caisse_id ON public.commandes(caisse_id);