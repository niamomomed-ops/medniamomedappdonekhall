ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS casse_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS casse_resolved_by uuid REFERENCES auth.users(id);
