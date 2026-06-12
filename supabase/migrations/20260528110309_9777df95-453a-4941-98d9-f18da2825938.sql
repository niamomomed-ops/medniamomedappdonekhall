ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS casse_eye text,
  ADD COLUMN IF NOT EXISTS casse_note text,
  ADD COLUMN IF NOT EXISTS casse_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS casse_by uuid;

ALTER TABLE public.commandes
  DROP CONSTRAINT IF EXISTS commandes_casse_eye_check;
ALTER TABLE public.commandes
  ADD CONSTRAINT commandes_casse_eye_check
  CHECK (casse_eye IS NULL OR casse_eye IN ('od','og','both'));