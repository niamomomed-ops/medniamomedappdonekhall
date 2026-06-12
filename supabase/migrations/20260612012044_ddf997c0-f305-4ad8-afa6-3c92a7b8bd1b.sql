
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $do$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'agent_vente', 'agent_montage');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

CREATE SEQUENCE IF NOT EXISTS public.mutuelle_numero_seq START 1;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.personnel (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entreprise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT,
  slogan TEXT,
  telephone TEXT,
  whatsapp TEXT,
  email TEXT,
  site_web TEXT,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  logo_url TEXT,
  horaires JSONB,
  couleur_principale TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet TEXT NOT NULL,
  civilite TEXT CHECK (civilite IN ('M.', 'Mme', 'Mlle', 'Enf.')),
  nom TEXT,
  prenom TEXT,
  date_naissance DATE NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  adresse TEXT NOT NULL,
  cin TEXT,
  mutuelle TEXT CHECK (mutuelle IN ('AMO', 'CNSS', 'FAR', 'CNOPS', 'SANLAM', 'Autre')),
  mutuelle_autre TEXT,
  whatsapp TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.entreprise TO authenticated;
GRANT ALL ON public.entreprise TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entreprise ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ur_select" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "pers_select" ON public.personnel FOR SELECT TO authenticated USING (true);
CREATE POLICY "entreprise_select" ON public.entreprise FOR SELECT TO authenticated USING (true);
CREATE POLICY "entreprise_insert" ON public.entreprise FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "entreprise_update" ON public.entreprise FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated USING (true);
