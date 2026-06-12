
ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS monture_client_called_at timestamptz,
  ADD COLUMN IF NOT EXISTS monture_client_called_by uuid,
  ADD COLUMN IF NOT EXISTS monture_client_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS monture_client_received_by uuid;
