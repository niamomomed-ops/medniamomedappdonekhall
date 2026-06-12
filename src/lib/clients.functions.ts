import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = ["admin", "agent_vente"] as const;

async function assertClientsAccess(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => (ALLOWED_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: clients reserved to admin and agent_vente");
  }
}

const clientInput = z.object({
  nom_complet: z.string().trim().min(1).max(150),
  civilite: z.enum(["M.", "Mme", "Mlle", "Enf."]).optional().nullable(),
  nom: z.string().trim().max(100).optional().nullable(),
  prenom: z.string().trim().max(100).optional().nullable(),
  date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  email: z.string().trim().email().max(255),
  telephone: z.string().trim().min(1).max(50),
  adresse: z.string().trim().min(1).max(500),
  cin: z.string().trim().max(50).optional().nullable(),
  mutuelle: z
    .enum(["AMO", "CNSS", "FAR", "CNOPS", "SANLAM", "Autre"])
    .optional()
    .nullable(),
  mutuelle_autre: z.string().trim().max(150).optional().nullable(),
  whatsapp: z.string().trim().max(50).optional().nullable(),
});

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertClientsAccess(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Map { client_id: ISO date of last commande created } */
export const listClientsLastCommande = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, string>> => {
    await assertClientsAccess(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("commandes")
      .select("client_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const r of data ?? []) {
      if (!out[r.client_id]) out[r.client_id] = r.created_at;
    }
    return out;
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => clientInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertClientsAccess(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { data: created, error } = await sb
      .from("clients")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    clientInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClientsAccess(context.supabase, context.userId);
    const { id, ...rest } = data;
    const sb = context.supabase as any;
    const { data: updated, error } = await sb
      .from("clients")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertClientsAccess(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("clients")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });