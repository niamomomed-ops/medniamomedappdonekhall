import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns the list of client_ids already felicitated today. */
export const listTodayFelicitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("client_felicitations")
      .select("client_id")
      .eq("felicite_date", todayIsoDate());
    if (error) {
      // If the table does not exist yet, fail gracefully so the UI keeps working.
      console.warn("[felicitations] read failed:", error.message);
      return [];
    }
    return (data ?? []).map((r: { client_id: string }) => r.client_id);
  });

/** Marks a client as felicitated for today (idempotent via unique constraint). */
export const markClientFelicite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ client_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const payload = {
      client_id: data.client_id,
      felicite_date: todayIsoDate(),
      felicite_by: context.userId,
    };
    const { error } = await sb
      .from("client_felicitations")
      .upsert(payload, { onConflict: "client_id,felicite_date" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
