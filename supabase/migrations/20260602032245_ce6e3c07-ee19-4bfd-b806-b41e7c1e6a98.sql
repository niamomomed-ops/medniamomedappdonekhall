ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS reclamation_detail jsonb,
  ADD COLUMN IF NOT EXISTS reclamation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reclamation_sent_by uuid,
  ADD COLUMN IF NOT EXISTS reclamation_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reclamation_resolved_by uuid;

CREATE INDEX IF NOT EXISTS idx_commandes_reclamation_active
  ON public.commandes ((reclamation_detail IS NOT NULL AND reclamation_resolved_at IS NULL));