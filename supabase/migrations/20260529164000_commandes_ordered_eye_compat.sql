DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commandes'
      AND column_name = 'ordered_eye'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'commandes'
        AND column_name = 'eyes_ordered'
    ) THEN
      EXECUTE 'UPDATE public.commandes SET eyes_ordered = COALESCE(eyes_ordered, ordered_eye, ''both'')';
      EXECUTE 'ALTER TABLE public.commandes DROP COLUMN ordered_eye';
    ELSE
      EXECUTE 'ALTER TABLE public.commandes RENAME COLUMN ordered_eye TO eyes_ordered';
    END IF;
  END IF;
END $$;

ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS eyes_ordered text;

UPDATE public.commandes
SET eyes_ordered = 'both'
WHERE eyes_ordered IS NULL;

ALTER TABLE public.commandes
  ALTER COLUMN eyes_ordered SET DEFAULT 'both',
  ALTER COLUMN eyes_ordered SET NOT NULL;

ALTER TABLE public.commandes
  DROP CONSTRAINT IF EXISTS commandes_eyes_ordered_check;

ALTER TABLE public.commandes
  ADD CONSTRAINT commandes_eyes_ordered_check
  CHECK (eyes_ordered IN ('both', 'od', 'og'));
