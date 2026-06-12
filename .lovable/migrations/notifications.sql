-- Prompt 63 — Notifications system
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  commande_id UUID REFERENCES public.commandes(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'casse_montage' | 'reclamation_en_cours' | 'transition'
  message TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS notification_reads_user_idx
  ON public.notification_reads(user_id);

GRANT SELECT, INSERT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "notif_insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notif_reads_select" ON public.notification_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_reads_insert" ON public.notification_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_reads_delete" ON public.notification_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());
