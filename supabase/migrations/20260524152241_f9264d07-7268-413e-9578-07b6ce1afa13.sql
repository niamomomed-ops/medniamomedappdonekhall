-- Enum for caisse status
DO $$ BEGIN
  CREATE TYPE public.caisse_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.caisses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  status public.caisse_status NOT NULL DEFAULT 'closed',
  opened_at timestamptz,
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one open caisse at a time
CREATE UNIQUE INDEX IF NOT EXISTS caisses_only_one_open
  ON public.caisses ((status))
  WHERE status = 'open';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS caisses_set_updated_at ON public.caisses;
CREATE TRIGGER caisses_set_updated_at
BEFORE UPDATE ON public.caisses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;

-- Helper: admin OR agent_vente
CREATE POLICY "Admin or vente can view caisses"
ON public.caisses FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'agent_vente'::app_role)
);

CREATE POLICY "Admin or vente can insert caisses"
ON public.caisses FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'agent_vente'::app_role)
);

CREATE POLICY "Admin or vente can update caisses"
ON public.caisses FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'agent_vente'::app_role)
);

CREATE POLICY "Admins can delete caisses"
ON public.caisses FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));
