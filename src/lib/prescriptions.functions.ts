import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WRITE_ROLES = ["admin", "agent_vente"] as const;
const READ_ROLES = ["admin", "agent_vente", "agent_montage"] as const;

async function assertRoles(
  supabase: any,
  userId: string,
  allowed: readonly string[],
  msg: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => allowed.includes(r))) {
    throw new Error(msg);
  }
}

const prescriptionInput = z.object({
  client_id: z.string().uuid(),
  type: z.enum(["interne", "externe"]),
  date_prescription: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  od_sphere: z.number(),
  od_cylinder: z.number(),
  od_axe: z.number().int().min(0).max(180),
  od_addition: z.number(),
  og_sphere: z.number(),
  og_cylinder: z.number(),
  og_axe: z.number().int().min(0).max(180),
  og_addition: z.number(),
  correction_par: z.string().trim().max(150).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const listPrescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ client_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      READ_ROLES,
      "Forbidden",
    );
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("prescriptions")
      .select("*")
      .eq("client_id", data.client_id)
      .order("date_prescription", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => prescriptionInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      WRITE_ROLES,
      "Forbidden: réservé à admin et agent_vente",
    );
    const sb = context.supabase as any;
    const { data: created, error } = await sb
      .from("prescriptions")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updatePrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    prescriptionInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      WRITE_ROLES,
      "Forbidden: réservé à admin et agent_vente",
    );
    const { id, ...rest } = data;
    const sb = context.supabase as any;
    const { data: updated, error } = await sb
      .from("prescriptions")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deletePrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      WRITE_ROLES,
      "Forbidden",
    );
    const sb = context.supabase as any;
    const { error } = await sb.from("prescriptions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      READ_ROLES,
      "Forbidden",
    );
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("clients")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Client introuvable");
    return row;
  });

export const listCommandesForClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ client_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      READ_ROLES,
      "Forbidden",
    );
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("commandes")
      .select("id, status, created_at, prescription_id, prescriptions(date_prescription, type)")
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createCommandeFromPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        client_id: z.string().uuid(),
        prescription_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      WRITE_ROLES,
      "Forbidden: réservé à admin et agent_vente",
    );
    const sb = context.supabase as any;
    const { data: created, error } = await sb
      .from("commandes")
      .insert({
        client_id: data.client_id,
        prescription_id: data.prescription_id,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });