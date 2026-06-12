import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLES = ["admin", "agent_vente", "agent_montage"] as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

function getPersonnelAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Les mutations de gestion du personnel nécessitent une configuration serveur Lovable Cloud complète.",
    );
  }

  return supabaseAdmin;
}

export const listPersonnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: personnel, error: pErr } = await context.supabase
      .from("personnel")
      .select("*")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    return personnel ?? [];
  });

export const createPersonnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(72),
        role: z.enum(ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const adminClient = getPersonnelAdminClient();

    const { data: created, error: createErr } =
      await adminClient.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { name: data.name },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create user");
    }
    const newId = created.user.id;

    const { error: roleErr } = await adminClient
      .from("user_roles")
      .insert({ user_id: newId, role: data.role });
    if (roleErr) {
      await adminClient.auth.admin.deleteUser(newId);
      throw new Error(roleErr.message);
    }

    const { error: persErr } = await adminClient.from("personnel").insert({
      id: newId,
      name: data.name,
      email: data.email,
      role: data.role,
      status: "active",
    });
    if (persErr) {
      await adminClient.auth.admin.deleteUser(newId);
      throw new Error(persErr.message);
    }

    return { id: newId };
  });

export const updatePersonnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        role: z.enum(ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const adminClient = getPersonnelAdminClient();

    const { error: pErr } = await adminClient
      .from("personnel")
      .update({ name: data.name, role: data.role })
      .eq("id", data.id);
    if (pErr) throw new Error(pErr.message);

    // Replace role in user_roles
    const { error: delErr } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", data.id);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await adminClient
      .from("user_roles")
      .insert({ user_id: data.id, role: data.role });
    if (insErr) throw new Error(insErr.message);

    await adminClient.auth.admin.updateUserById(data.id, {
      user_metadata: { name: data.name },
    });

    return { ok: true };
  });

export const setPersonnelStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "suspended"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const adminClient = getPersonnelAdminClient();

    if (data.id === context.userId && data.status === "suspended") {
      throw new Error("Vous ne pouvez pas suspendre votre propre compte");
    }

    const { error: pErr } = await adminClient
      .from("personnel")
      .update({ status: data.status })
      .eq("id", data.id);
    if (pErr) throw new Error(pErr.message);

    // Ban or unban at the auth level so suspended users cannot sign in
    const { error: authErr } = await adminClient.auth.admin.updateUserById(
      data.id,
      { ban_duration: data.status === "suspended" ? "876000h" : "none" } as Parameters<
        typeof adminClient.auth.admin.updateUserById
      >[1],
    );
    if (authErr) throw new Error(authErr.message);

    return { ok: true };
  });

export const getMyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("personnel")
      .select("status")
      .eq("id", context.userId)
      .maybeSingle();
    return { status: (data?.status as "active" | "suspended" | undefined) ?? null };
  });
