import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Liste de repli si la RPC list_public_tables n'est pas disponible.
const SQL_EXPORT_TABLES_FALLBACK = [
  "entreprise",
  "personnel",
  "clients",
  "client_felicitations",
  "client_versements",
  "fournisseurs",
  "caisses",
  "prescriptions",
  "correction_annexes",
  "commandes",
  "order_history",
  "versements",
  "transactions",
  "progressive_measurements",
  "demandes_mutuelles",
  "demande_mutuelle_history",
  "demande_mutuelle_commandes",
  "dettes",
  "notifications",
  "notification_reads",
  "backup_settings",
  "backup_runs",
] as const;

async function resolveTables(supabase: any): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("list_public_tables");
    if (!error && Array.isArray(data) && data.length > 0) {
      const names = (data as any[])
        .map((r) =>
          typeof r === "string" ? r : r?.list_public_tables ?? r?.tablename,
        )
        .filter((n: any): n is string => typeof n === "string" && n !== "user_roles");
      if (names.length > 0) return names;
    }
  } catch {
    // fallback
  }
  return [...SQL_EXPORT_TABLES_FALLBACK];
}

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès réservé aux administrateurs");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function inferType(values: unknown[]): string {
  let sawInt = false;
  let sawFloat = false;
  let candidate: string | null = null;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "number") {
      if (Number.isInteger(v)) sawInt = true;
      else sawFloat = true;
      continue;
    }
    if (typeof v === "object") return "jsonb";
    if (typeof v === "string") {
      let t: string;
      if (UUID_RE.test(v)) t = "uuid";
      else if (ISO_TS_RE.test(v)) t = "timestamptz";
      else if (ISO_DATE_RE.test(v)) t = "date";
      else t = "text";
      if (candidate === null) candidate = t;
      else if (candidate !== t) candidate = "text";
    }
  }
  if (sawFloat) return "numeric";
  if (sawInt) return "bigint";
  return candidate ?? "text";
}

function sqlLiteral(v: unknown, type: string): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  const s = String(v).replace(/'/g, "''");
  if (type === "uuid") return `'${s}'::uuid`;
  if (type === "timestamptz") return `'${s}'::timestamptz`;
  if (type === "date") return `'${s}'::date`;
  if (type === "jsonb") return `'${s}'::jsonb`;
  return `'${s}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export const exportSqlBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const header = [
      `-- OptiGestion SQL Backup`,
      `-- Généré le ${new Date().toISOString()}`,
      `--`,
      `-- Dump portable, réinstallable sur n'importe quel PostgreSQL.`,
      `-- Limites connues (non incluses dans ce dump) :`,
      `--   * pas de clés étrangères (FOREIGN KEY)`,
      `--   * pas d'index secondaires`,
      `--   * pas de types ENUM (les colonnes concernées sont exportées en text)`,
      `--   * pas de politiques RLS, ni de GRANT`,
      `--   * types inférés depuis les valeurs (peuvent différer du schéma source)`,
      `--`,
      `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
      ``,
      `BEGIN;`,
      ``,
    ].join("\n");

    let sql = header;
    let totalRows = 0;
    const errors: string[] = [];

    const tables = await resolveTables(supabase);
    for (const table of tables) {
      const { data, error } = await supabase.from(table as any).select("*");
      if (error) {
        errors.push(`${table}: ${error.message}`);
        sql += `-- Table ${table} : erreur de lecture (${error.message})\n\n`;
        continue;
      }
      const rows = ((data ?? []) as unknown) as Record<string, unknown>[];

      // Détermine les colonnes : union de toutes les clés rencontrées
      const colSet = new Set<string>();
      for (const r of rows) for (const k of Object.keys(r)) colSet.add(k);
      const cols = Array.from(colSet);

      // Si la table est vide, on ne peut pas inférer les types : on saute la création
      if (cols.length === 0) {
        sql += `-- Table ${table} : vide (création ignorée, schéma inconnu)\n\n`;
        continue;
      }

      const types: Record<string, string> = {};
      for (const c of cols) types[c] = inferType(rows.map((r) => r[c]));

      const hasId = cols.includes("id");
      const colDefs = cols.map((c) => {
        const t = types[c];
        const def = `${quoteIdent(c)} ${t}`;
        if (c === "id") {
          if (t === "uuid") return `${def} PRIMARY KEY DEFAULT gen_random_uuid()`;
          return `${def} PRIMARY KEY`;
        }
        return def;
      });

      sql += `-- Table: ${table} (${rows.length} lignes)\n`;
      sql += `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n  ${colDefs.join(",\n  ")}\n);\n`;

      if (rows.length === 0) {
        sql += `\n`;
        continue;
      }

      totalRows += rows.length;
      const colList = cols.map(quoteIdent).join(", ");
      for (const row of rows) {
        const vals = cols.map((c) => sqlLiteral(row[c], types[c])).join(", ");
        const conflict = hasId ? ` ON CONFLICT (id) DO NOTHING` : ``;
        sql += `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${vals})${conflict};\n`;
      }
      sql += `\n`;
    }

    sql += `COMMIT;\n`;
    if (errors.length) {
      sql += `\n-- Erreurs rencontrées :\n` + errors.map((e) => `-- ${e}`).join("\n") + `\n`;
    }
    return { sql, totalRows };
  });

/**
 * Migration complète + seed : DDL (schéma, FK, RLS, policies, index, fonctions,
 * triggers, buckets) via la fonction public.dump_full_schema(), puis INSERTs
 * de toutes les lignes. Exécutable sur un projet Supabase vierge.
 */
export const exportFullMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // 1) DDL via RPC (typage Supabase non régénéré : cast en any)
    const { data: ddl, error: ddlErr } = await (supabase as any).rpc("dump_full_schema");
    if (ddlErr) {
      throw new Error(
        `RPC dump_full_schema indisponible : ${ddlErr.message}. ` +
          `Exécutez d'abord la migration .lovable/migrations/dump_full_schema.sql ` +
          `dans l'éditeur SQL Supabase.`,
      );
    }
    if (typeof ddl !== "string" || !ddl.length) {
      throw new Error("dump_full_schema a renvoyé un résultat vide.");
    }

    // 2) DML : INSERTs pour chaque table
    let dml =
      `\n-- =====================================================\n` +
      `-- DONNÉES (seed)\n` +
      `-- =====================================================\n\n` +
      `BEGIN;\n\n`;

    let totalRows = 0;
    const errors: string[] = [];
    const tables = await resolveTables(supabase);

    for (const table of tables) {
      const { data, error } = await supabase.from(table as any).select("*");
      if (error) {
        errors.push(`${table}: ${error.message}`);
        dml += `-- Table ${table} : erreur de lecture (${error.message})\n\n`;
        continue;
      }
      const rows = ((data ?? []) as unknown) as Record<string, unknown>[];
      if (rows.length === 0) {
        dml += `-- Table ${table} : vide\n\n`;
        continue;
      }

      const colSet = new Set<string>();
      for (const r of rows) for (const k of Object.keys(r)) colSet.add(k);
      const cols = Array.from(colSet);
      const types: Record<string, string> = {};
      for (const c of cols) types[c] = inferType(rows.map((r) => r[c]));
      const hasId = cols.includes("id");
      const colList = cols.map(quoteIdent).join(", ");

      dml += `-- Table: ${table} (${rows.length} lignes)\n`;
      totalRows += rows.length;
      for (const row of rows) {
        const vals = cols.map((c) => sqlLiteral(row[c], types[c])).join(", ");
        const conflict = hasId ? ` ON CONFLICT (id) DO NOTHING` : ``;
        dml += `INSERT INTO public.${quoteIdent(table)} (${colList}) VALUES (${vals})${conflict};\n`;
      }
      dml += `\n`;
    }

    dml += `COMMIT;\n`;
    if (errors.length) {
      dml += `\n-- Erreurs :\n` + errors.map((e) => `-- ${e}`).join("\n") + `\n`;
    }

    return { sql: ddl + dml, totalRows };
  });
