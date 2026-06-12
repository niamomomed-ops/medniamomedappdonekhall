import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(sb: any, userId: string) {
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès réservé aux administrateurs");
}

export type BackupSettings = {
  daily_enabled: boolean;
  daily_time: string;
  weekly_enabled: boolean;
  weekly_dow: number;
  monthly_enabled: boolean;
  monthly_day: number;
  on_caisse_close: boolean;
  email_enabled: boolean;
  email_recipients: string[];
  drive_enabled: boolean;
  drive_folder_id: string | null;
  formats: string[];
  updated_at: string | null;
};

const DEFAULTS: BackupSettings = {
  daily_enabled: false,
  daily_time: "23:00",
  weekly_enabled: false,
  weekly_dow: 0,
  monthly_enabled: false,
  monthly_day: 1,
  on_caisse_close: false,
  email_enabled: false,
  email_recipients: [],
  drive_enabled: false,
  drive_folder_id: null,
  formats: ["json", "sql"],
  updated_at: null,
};

export const listPublicTables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const sb = context.supabase as any;
    try {
      const { data, error } = await sb.rpc("list_public_tables");
      if (!error && Array.isArray(data)) {
        return (data as any[])
          .map((r) =>
            typeof r === "string" ? r : r?.list_public_tables ?? r?.tablename,
          )
          .filter((n: any): n is string => typeof n === "string");
      }
    } catch {
      // fallback below
    }
    return [];
  });

export const getBackupSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupSettings> => {
    const sb = context.supabase as any;
    await assertAdmin(sb, context.userId);
    const { data, error } = await sb
      .from("backup_settings")
      .select("*")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULTS;
    return {
      daily_enabled: !!data.daily_enabled,
      daily_time: (data.daily_time ?? "23:00").slice(0, 5),
      weekly_enabled: !!data.weekly_enabled,
      weekly_dow: data.weekly_dow ?? 0,
      monthly_enabled: !!data.monthly_enabled,
      monthly_day: data.monthly_day ?? 1,
      on_caisse_close: !!data.on_caisse_close,
      email_enabled: !!data.email_enabled,
      email_recipients: Array.isArray(data.email_recipients) ? data.email_recipients : [],
      drive_enabled: !!data.drive_enabled,
      drive_folder_id: data.drive_folder_id ?? null,
      formats: Array.isArray(data.formats) && data.formats.length ? data.formats : ["json", "sql"],
      updated_at: data.updated_at ?? null,
    };
  });

const SettingsInput = z.object({
  daily_enabled: z.boolean(),
  daily_time: z.string().regex(/^\d{2}:\d{2}$/),
  weekly_enabled: z.boolean(),
  weekly_dow: z.number().int().min(0).max(6),
  monthly_enabled: z.boolean(),
  monthly_day: z.number().int().min(1).max(28),
  on_caisse_close: z.boolean(),
  email_enabled: z.boolean(),
  email_recipients: z.array(z.string().email()).max(20),
  drive_enabled: z.boolean(),
  drive_folder_id: z.string().nullable(),
  formats: z.array(z.enum(["json", "sql"])).min(1),
});

export const saveBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAdmin(sb, context.userId);
    const payload = {
      id: "singleton",
      ...data,
      daily_time: data.daily_time + ":00",
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    const { error } = await sb
      .from("backup_settings")
      .upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        trigger: z.enum(["manual", "caisse_close", "daily", "weekly", "monthly"]).default("manual"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAdmin(sb, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runBackup } = await import("@/lib/backup-runner.server");
    return runBackup(supabaseAdmin as any, { trigger: data.trigger });
  });

export type BackupRunRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  trigger: string;
  destinations: string[];
  formats: string[];
  status: string;
  total_rows: number | null;
  error: string | null;
};

export const listBackupRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupRunRow[]> => {
    const sb = context.supabase as any;
    await assertAdmin(sb, context.userId);
    const { data, error } = await sb
      .from("backup_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as BackupRunRow[];
  });
