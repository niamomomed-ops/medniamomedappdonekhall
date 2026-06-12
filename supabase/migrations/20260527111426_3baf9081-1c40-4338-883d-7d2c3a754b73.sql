ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS monture_marque text,
  ADD COLUMN IF NOT EXISTS monture_client_provided boolean;