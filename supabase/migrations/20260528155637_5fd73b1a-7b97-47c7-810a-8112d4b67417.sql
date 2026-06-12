ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS reception_client_called_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reception_client_called_by UUID;