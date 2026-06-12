
CREATE TABLE IF NOT EXISTS public.correction_annexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID REFERENCES public.commandes(id) ON DELETE CASCADE,
  mutuelle_demande_id UUID REFERENCES public.demandes_mutuelles(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.backup_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  daily_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_time TIME NOT NULL DEFAULT '23:00',
  weekly_enabled BOOLEAN NOT NULL DEFAULT false,
  weekly_dow INTEGER NOT NULL DEFAULT 0,
  monthly_enabled BOOLEAN NOT NULL DEFAULT false,
  monthly_day INTEGER NOT NULL DEFAULT 1,
  on_caisse_close BOOLEAN NOT NULL DEFAULT false,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  email_recipients TEXT[] NOT NULL DEFAULT '{}',
  drive_enabled BOOLEAN NOT NULL DEFAULT false,
  drive_folder_id TEXT,
  formats TEXT[] NOT NULL DEFAULT ARRAY['json', 'sql'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (id = 'singleton')
);

INSERT INTO public.backup_settings (id) VALUES ('singleton') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  trigger TEXT NOT NULL,
  destinations TEXT[] NOT NULL DEFAULT '{}',
  formats TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  total_rows INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS notification_reads_user_idx ON public.notification_reads(user_id);
CREATE INDEX IF NOT EXISTS notifications_mutuelle_demande_idx ON public.notifications(mutuelle_demande_id);
CREATE INDEX IF NOT EXISTS notifications_target_user_idx ON public.notifications(target_user_id);
CREATE INDEX IF NOT EXISTS backup_runs_started_idx ON public.backup_runs(started_at DESC);

GRANT SELECT, INSERT, DELETE ON public.correction_annexes TO authenticated;
GRANT ALL ON public.correction_annexes TO service_role;
GRANT SELECT, INSERT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.backup_settings TO authenticated;
GRANT ALL ON public.backup_settings TO service_role;
GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;

ALTER TABLE public.correction_annexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ca_select" ON public.correction_annexes FOR SELECT TO authenticated USING (true);
CREATE POLICY "ca_insert" ON public.correction_annexes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ca_delete" ON public.correction_annexes FOR DELETE TO authenticated USING (true);

CREATE POLICY "notif_select" ON public.notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notif_reads_select" ON public.notification_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_reads_insert" ON public.notification_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_reads_delete" ON public.notification_reads FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "backup_settings_admin_select" ON public.backup_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "backup_settings_admin_insert" ON public.backup_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "backup_settings_admin_update" ON public.backup_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "backup_runs_admin_select" ON public.backup_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
