import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sweepAutoCloseCaisses } from "@/lib/caisses.functions";

export const Route = createFileRoute("/api/public/hooks/auto-close-caisses")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const closed = await sweepAutoCloseCaisses(supabaseAdmin);
          return Response.json({ ok: true, closed: closed.length });
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