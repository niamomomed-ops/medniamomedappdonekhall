ALTER TYPE public.commande_status ADD VALUE IF NOT EXISTS 'reception_partielle';

ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS od_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS og_received_at TIMESTAMPTZ;
