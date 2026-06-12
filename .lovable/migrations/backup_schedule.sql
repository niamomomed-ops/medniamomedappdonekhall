-- ============================================================
-- OptiGestion — Sauvegarde planifiée (à exécuter manuellement)
-- ============================================================

-- 1. Table de configuration (1 seule ligne, id='singleton')
CREATE TABLE IF NOT EXISTS public.backup_settings (
  id text PRIMARY KEY DEFAULT 'singleton',
  daily_enabled boolean NOT NULL DEFAULT false,
  daily_time time NOT NULL DEFAULT '23:00',
  weekly_enabled boolean NOT NULL DEFAULT false,
  weekly_dow int NOT NULL DEFAULT 0,        -- 0=dimanche … 6=samedi
  monthly_enabled boolean NOT NULL DEFAULT false,
  monthly_day int NOT NULL DEFAULT 1,       -- 1..28
  on_caisse_close boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT false,
  email_recipients text[] NOT NULL DEFAULT '{}',
  drive_enabled boolean NOT NULL DEFAULT false,
  drive_folder_id text,
  formats text[] NOT NULL DEFAULT ARRAY['json','sql'],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (id = 'singleton')
);
INSERT INTO public.backup_settings (id) VALUES ('singleton') ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.backup_settings TO authenticated;
GRANT ALL ON public.backup_settings TO service_role;

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_settings_admin_select" ON public.backup_settings;
DROP POLICY IF EXISTS "backup_settings_admin_insert" ON public.backup_settings;
DROP POLICY IF EXISTS "backup_settings_admin_update" ON public.backup_settings;

CREATE POLICY "backup_settings_admin_select" ON public.backup_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "backup_settings_admin_insert" ON public.backup_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "backup_settings_admin_update" ON public.backup_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Historique des sauvegardes
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  trigger text NOT NULL,                    -- manual | daily | weekly | monthly | caisse_close
  destinations text[] NOT NULL DEFAULT '{}',-- email, drive
  formats text[] NOT NULL DEFAULT '{}',     -- json, sql
  status text NOT NULL DEFAULT 'running',   -- running | success | partial | failed
  total_rows int,
  error text
);
CREATE INDEX IF NOT EXISTS backup_runs_started_idx ON public.backup_runs(started_at DESC);

GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backup_runs_admin_select" ON public.backup_runs;
CREATE POLICY "backup_runs_admin_select" ON public.backup_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. RPC : liste dynamique des tables publiques (utilisée par reset / JSON / SQL)
CREATE OR REPLACE FUNCTION public.list_public_tables()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
$$;
GRANT EXECUTE ON FUNCTION public.list_public_tables() TO authenticated, service_role;

-- 4. Secret partagé pour pg_cron → ajoutez BACKUP_CRON_SECRET dans Lovable Cloud (Secrets)
--    puis remplacez YOUR_SECRET ci-dessous par la même valeur.

-- 5. Jobs pg_cron (nécessite extensions pg_cron + pg_net)
--    Remplacez YOUR_PROJECT_ID et YOUR_SECRET.
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- SELECT cron.schedule(
--   'optigestion-backup-daily', '0 23 * * *',
--   $$ SELECT net.http_post(
--        url := 'https://project--YOUR_PROJECT_ID.lovable.app/api/public/hooks/run-scheduled-backup',
--        headers := jsonb_build_object('Content-Type','application/json','X-Backup-Secret','YOUR_SECRET'),
--        body := jsonb_build_object('trigger','daily')
--      ); $$
-- );
-- SELECT cron.schedule(
--   'optigestion-backup-weekly', '0 23 * * 0',
--   $$ SELECT net.http_post(
--        url := 'https://project--YOUR_PROJECT_ID.lovable.app/api/public/hooks/run-scheduled-backup',
--        headers := jsonb_build_object('Content-Type','application/json','X-Backup-Secret','YOUR_SECRET'),
--        body := jsonb_build_object('trigger','weekly')
--      ); $$
-- );
-- SELECT cron.schedule(
--   'optigestion-backup-monthly', '0 23 1 * *',
--   $$ SELECT net.http_post(
--        url := 'https://project--YOUR_PROJECT_ID.lovable.app/api/public/hooks/run-scheduled-backup',
--        headers := jsonb_build_object('Content-Type','application/json','X-Backup-Secret','YOUR_SECRET'),
--        body := jsonb_build_object('trigger','monthly')
--      ); $$
-- );
