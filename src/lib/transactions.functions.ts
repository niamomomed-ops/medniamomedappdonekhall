import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = ["admin", "agent_vente"] as const;

async function assertTxAccess(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => (ALLOWED_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: transactions reserved to admin and agent_vente");
  }
}

async function getOpenCaisse(supabase: any) {
  const { data, error } = await supabase
    .from("caisses")
    .select("id")
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string } | null;
}

export const getCurrentOpenCaisse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertTxAccess(context.supabase, context.userId);
    return await getOpenCaisse(context.supabase);
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ caisse_id: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertTxAccess(context.supabase, context.userId);
    let query = (context.supabase as any)
      .from("transactions")
      .select("*")
      .eq("is_manual", true)
      .order("created_at", { ascending: false });
    if (data.caisse_id) query = query.eq("caisse_id", data.caisse_id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const txs = rows ?? [];
    const userIds = Array.from(
      new Set(txs.map((t: any) => t.created_by).filter(Boolean)),
    ) as string[];
    let usersById: Record<string, { name: string; email: string }> = {};
    if (userIds.length > 0) {
      const { data: people, error: pErr } = await context.supabase
        .from("personnel")
        .select("id, name, email")
        .in("id", userIds);
      if (pErr) throw new Error(pErr.message);
      usersById = Object.fromEntries(
        (people ?? []).map((p: any) => [p.id, { name: p.name, email: p.email }]),
      );
    }
    return txs.map((t: any) => ({
      ...t,
      created_by_user: usersById[t.created_by] ?? null,
    }));
  });

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        type: z.enum(["entree", "sortie"]),
        amount: z.number().positive().max(99999999),
        description: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertTxAccess(context.supabase, context.userId);

    const open = await getOpenCaisse(context.supabase);
    if (!open) throw new Error("Aucune caisse ouverte");

    const { data: created, error } = await (context.supabase as any)
      .from("transactions")
      .insert({
        caisse_id: open.id,
        type: data.type,
        amount: data.amount,
        description: data.description ?? null,
        created_by: context.userId,
        is_manual: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        type: z.enum(["entree", "sortie"]),
        amount: z.number().positive().max(99999999),
        description: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertTxAccess(context.supabase, context.userId);
    const { data: updated, error } = await context.supabase
      .from("transactions")
      .update({
        type: data.type,
        amount: data.amount,
        description: data.description ?? null,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertTxAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("transactions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
