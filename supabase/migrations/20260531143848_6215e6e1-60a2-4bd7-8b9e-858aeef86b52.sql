
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cin text,
  ADD COLUMN IF NOT EXISTS mutuelle text,
  ADD COLUMN IF NOT EXISTS mutuelle_autre text,
  ADD COLUMN IF NOT EXISTS whatsapp text;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS correction_par text;
