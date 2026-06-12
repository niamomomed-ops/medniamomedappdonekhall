-- Add eyes_ordered column to commandes: which eye(s) the order covers.
ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS eyes_ordered text NOT NULL DEFAULT 'both'
  CHECK (eyes_ordered IN ('both', 'od', 'og'));
