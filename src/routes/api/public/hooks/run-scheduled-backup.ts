import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/run-scheduled-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-backup-secret");
        const expected = process.env.BACKUP_CRON_SECRET;
        if (!expected) {
          return Response.json(
            { ok: false, error: "BACKUP_CRON_SECRET non configuré" },
            { status: 500 },
          );
        }
        if (!secret || secret !== expected) {
          return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        let trigger = "daily";
        try {
          const body = await request.json();
          if (body?.trigger && typeof body.trigger === "string") trigger = body.trigger;
        } catch {
          // body optionnel
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runBackup } = await import("@/lib/backup-runner.server");
          const result = await runBackup(supabaseAdmin as any, { trigger });
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: (e as Error).message },
            { status: 500 },
          );
        }
      },
    },
  },
});
