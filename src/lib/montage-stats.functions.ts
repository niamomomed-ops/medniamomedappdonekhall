import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  from: z.string(),
  to: z.string(),
  agentId: z.string().uuid().nullable().optional(),
});

async function getRole(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export const getMontageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    const isAdmin = role === "admin";

    // Determine which changed_by filter to apply
    // - agent_montage: always own userId
    // - admin: agentId (specific) or null = all montage agents
    let changedByFilter: string | null = userId;
    let montageAgentIds: string[] = [];

    if (isAdmin) {
      // Load montage agent ids for "all" aggregation
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "agent_montage");
      if (rErr) throw new Error(rErr.message);
      montageAgentIds = (roleRows ?? []).map((r: any) => r.user_id);

      if (data.agentId) {
        changedByFilter = data.agentId;
      } else {
        changedByFilter = null; // means: filter by montageAgentIds list
      }
    }

    let q = supabase
      .from("order_history")
      .select("id, commande_id, new_status, old_status, changed_at, changed_by")
      .gte("changed_at", data.from)
      .lte("changed_at", data.to)
      .order("changed_at", { ascending: true });

    if (changedByFilter) {
      q = q.eq("changed_by", changedByFilter);
    } else if (isAdmin && montageAgentIds.length > 0) {
      q = q.in("changed_by", montageAgentIds);
    } else if (isAdmin && montageAgentIds.length === 0) {
      return { myHistory: [], commandes: [], allHistory: [], userId };
    }

    const { data: myHistory, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set((myHistory ?? []).map((h: any) => h.commande_id).filter(Boolean)),
    );

    let commandes: any[] = [];
    let allHistory: any[] = [];
    if (ids.length > 0) {
      const cmdRes = await supabase
        .from("commandes")
        .select("id, numero_commande, type, casse_eye, clients(nom_complet)")
        .in("id", ids);
      if (cmdRes.error) throw new Error(cmdRes.error.message);
      commandes = cmdRes.data ?? [];

      const hRes = await supabase
        .from("order_history")
        .select("commande_id, new_status, changed_at, changed_by")
        .in("commande_id", ids)
        .order("changed_at", { ascending: true });
      if (hRes.error) throw new Error(hRes.error.message);
      allHistory = hRes.data ?? [];
    }

    return {
      myHistory: myHistory ?? [],
      commandes,
      allHistory,
      userId,
    };
  });

export const listMontageAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    if (role !== "admin") throw new Error("Forbidden");

    const { data: roleRows, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "agent_montage");
    if (rErr) throw new Error(rErr.message);

    const ids = (roleRows ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [] as { id: string; name: string }[];

    const { data: persons, error: pErr } = await supabase
      .from("personnel")
      .select("id, name")
      .in("id", ids)
      .order("name", { ascending: true });
    if (pErr) throw new Error(pErr.message);

    return (persons ?? []).map((p: any) => ({ id: p.id as string, name: p.name as string }));
  });
