import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin")) {
    throw new Error("Forbidden: fournisseurs reserved to admin");
  }
}

const fournisseurInput = z.object({
  nom: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(255),
  telephone: z.string().trim().min(1).max(50),
  whatsapp: z.string().trim().max(50).optional().or(z.literal("")),
  adresse: z.string().trim().min(1).max(500),
});

export const listFournisseurs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("fournisseurs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Lightweight list for selectors (sales + admin)
export const listFournisseursForSelect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r: string) => ["admin", "agent_vente"].includes(r))) {
      throw new Error("Forbidden");
    }
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("fournisseurs")
      .select("id, nom")
      .order("nom", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createFournisseur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => fournisseurInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { data: created, error } = await sb
      .from("fournisseurs")
      .insert({
        ...data,
        whatsapp: data.whatsapp ? data.whatsapp : null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateFournisseur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    fournisseurInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    const sb = context.supabase as any;
    const { data: updated, error } = await sb
      .from("fournisseurs")
      .update({ ...rest, whatsapp: rest.whatsapp ? rest.whatsapp : null })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteFournisseur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { error } = await sb.from("fournisseurs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });