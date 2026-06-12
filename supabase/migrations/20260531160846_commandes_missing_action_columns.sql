-- Ensure tracking columns for « marquer comme appelé » and « signaler casse »
-- exist on public.commandes. Defensive / idempotent.
ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS monture_client_called_by uuid,
  ADD COLUMN IF NOT EXISTS monture_client_called_at timestamptz,
  ADD COLUMN IF NOT EXISTS casse_by uuid,
  ADD COLUMN IF NOT EXISTS casse_at timestamptz;
