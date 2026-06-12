ALTER TABLE public.caisses
  ADD COLUMN IF NOT EXISTS auto_close_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_caisses_open_auto_close
  ON public.caisses(auto_close_at)
  WHERE status = 'open' AND auto_close_at IS NOT NULL;