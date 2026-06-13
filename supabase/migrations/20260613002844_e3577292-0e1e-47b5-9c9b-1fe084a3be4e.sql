GRANT UPDATE ON public.notification_reads TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_reads'
      AND policyname = 'notif_reads_update'
  ) THEN
    CREATE POLICY "notif_reads_update"
    ON public.notification_reads
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;