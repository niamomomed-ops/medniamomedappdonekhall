DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent_vente';
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent_montage';
EXCEPTION
  WHEN undefined_object THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');
END $$;

DO $$
BEGIN
  CREATE TYPE public.caisse_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.tx_type AS ENUM ('entree', 'sortie');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.personnel (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage personnel" ON public.personnel;
CREATE POLICY "Authenticated users can manage personnel"
ON public.personnel
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.caisses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  status public.caisse_status NOT NULL DEFAULT 'open',
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  auto_close_at timestamptz,
  auto_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisses TO authenticated;
GRANT ALL ON public.caisses TO service_role;
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage caisses" ON public.caisses;
CREATE POLICY "Authenticated users can manage caisses"
ON public.caisses
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
CREATE UNIQUE INDEX IF NOT EXISTS idx_caisses_only_one_open
ON public.caisses(status)
WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caisse_id uuid NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
  type public.tx_type NOT NULL,
  amount numeric NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage transactions" ON public.transactions;
CREATE POLICY "Authenticated users can manage transactions"
ON public.transactions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_transactions_caisse ON public.transactions(caisse_id);

CREATE TABLE IF NOT EXISTS public.commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_commande text UNIQUE,
  client_id uuid,
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE SET NULL,
  avance numeric NOT NULL DEFAULT 0,
  montant numeric NOT NULL DEFAULT 0,
  reste numeric,
  status text NOT NULL DEFAULT 'commande_creee',
  type text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes TO authenticated;
GRANT ALL ON public.commandes TO service_role;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage commandes" ON public.commandes;
CREATE POLICY "Authenticated users can manage commandes"
ON public.commandes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_commandes_caisse ON public.commandes(caisse_id);

CREATE TABLE IF NOT EXISTS public.versements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid REFERENCES public.commandes(id) ON DELETE CASCADE,
  caisse_id uuid REFERENCES public.caisses(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versements TO authenticated;
GRANT ALL ON public.versements TO service_role;
ALTER TABLE public.versements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage versements" ON public.versements;
CREATE POLICY "Authenticated users can manage versements"
ON public.versements
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_versements_caisse ON public.versements(caisse_id);
CREATE INDEX IF NOT EXISTS idx_versements_commande ON public.versements(commande_id);

CREATE OR REPLACE VIEW public.caisse
WITH (security_invoker = on)
AS SELECT * FROM public.caisses;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caisse TO authenticated;
GRANT ALL ON public.caisse TO service_role;

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

DROP TRIGGER IF EXISTS personnel_set_updated_at ON public.personnel;
CREATE TRIGGER personnel_set_updated_at
BEFORE UPDATE ON public.personnel
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS caisses_set_updated_at ON public.caisses;
CREATE TRIGGER caisses_set_updated_at
BEFORE UPDATE ON public.caisses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS commandes_set_updated_at ON public.commandes;
CREATE TRIGGER commandes_set_updated_at
BEFORE UPDATE ON public.commandes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();