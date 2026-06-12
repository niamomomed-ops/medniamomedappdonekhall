// Server-only : génération + livraison des sauvegardes.
// Ne jamais importer ce fichier depuis le code client.

type Sb = any;

const STATIC_TABLES = [
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

const EXCLUDED_TABLES = new Set<string>([
  // jamais sauvegardés
  "schema_migrations",
]);

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

export async function getTableList(sb: Sb): Promise<string[]> {
  try {
    const { data, error } = await sb.rpc("list_public_tables");
    if (!error && Array.isArray(data) && data.length > 0) {
      const names = (data as any[])
        .map((r) => (typeof r === "string" ? r : r?.list_public_tables ?? r?.tablename))
        .filter((n: any): n is string => typeof n === "string" && !EXCLUDED_TABLES.has(n));
      if (names.length > 0) return names;
    }
  } catch {
    // ignore
  }
  return [...STATIC_TABLES];
}

export type BackupOutput = {
  jsonContent: string;
  sqlContent: string;
  totalRows: number;
  errors: string[];
};

export async function generateBackup(sb: Sb): Promise<BackupOutput> {
  const tables = await getTableList(sb);
  const errors: string[] = [];
  let totalRows = 0;

  // JSON
  const jsonOut: Record<string, unknown[]> = {};

  // SQL
  let sql =
    [
      `-- OptiGestion SQL Backup`,
      `-- Généré le ${new Date().toISOString()}`,
      `--`,
      `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
      ``,
      `BEGIN;`,
      ``,
    ].join("\n") + "\n";

  for (const table of tables) {
    const { data, error } = await sb.from(table).select("*");
    if (error) {
      errors.push(`${table}: ${error.message}`);
      jsonOut[table] = [];
      sql += `-- Table ${table} : erreur de lecture (${error.message})\n\n`;
      continue;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    jsonOut[table] = rows;

    const colSet = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) colSet.add(k);
    const cols = Array.from(colSet);

    if (cols.length === 0) {
      sql += `-- Table ${table} : vide\n\n`;
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
    sql += `\n-- Erreurs :\n` + errors.map((e) => `-- ${e}`).join("\n") + `\n`;
  }

  const jsonContent = JSON.stringify(
    { export_version: "1.0", exported_at: new Date().toISOString(), tables: jsonOut },
    null,
    2,
  );

  return { jsonContent, sqlContent: sql, totalRows, errors };
}

// ------- Livraison -------

type Attachment = { filename: string; content: string; mime: string };

function toBase64(s: string): string {
  // Node + Workers : Buffer disponible via nodejs_compat
  return Buffer.from(s, "utf8").toString("base64");
}

async function sendEmailResend(recipients: string[], baseName: string, attachments: Attachment[]) {
  const lov = process.env.LOVABLE_API_KEY;
  const key = process.env.RESEND_API_KEY;
  if (!lov || !key) {
    throw new Error("Connecteur Resend non lié (RESEND_API_KEY manquant)");
  }
  const body = {
    from: process.env.BACKUP_EMAIL_FROM ?? "OptiGestion <onboarding@resend.dev>",
    to: recipients,
    subject: `Sauvegarde OptiGestion — ${baseName}`,
    html: `<p>Sauvegarde automatique OptiGestion (${baseName}).</p><p>Voir pièces jointes.</p>`,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: toBase64(a.content),
    })),
  };
  const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lov}`,
      "X-Connection-Api-Key": key,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Resend ${r.status}: ${await r.text()}`);
  }
}

async function uploadToDrive(folderId: string, attachments: Attachment[]) {
  const lov = process.env.LOVABLE_API_KEY;
  const key = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lov || !key) {
    throw new Error("Connecteur Google Drive non lié (GOOGLE_DRIVE_API_KEY manquant)");
  }
  for (const a of attachments) {
    const boundary = "----optigestion" + Math.random().toString(36).slice(2);
    const meta = { name: a.filename, parents: [folderId] };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(meta) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${a.mime}\r\n\r\n` +
      a.content +
      `\r\n--${boundary}--\r\n`;
    const r = await fetch(
      "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
          Authorization: `Bearer ${lov}`,
          "X-Connection-Api-Key": key,
        },
        body,
      },
    );
    if (!r.ok) {
      throw new Error(`Drive ${r.status}: ${await r.text()}`);
    }
  }
}

export async function runBackup(
  sb: Sb,
  params: { trigger: string },
): Promise<{
  ok: boolean;
  status: "success" | "partial" | "failed";
  totalRows: number;
  error: string | null;
  runId: string | null;
}> {
  // Charge config
  const { data: settings } = await sb
    .from("backup_settings")
    .select("*")
    .eq("id", "singleton")
    .maybeSingle();

  // Vérifie si le déclencheur est activé (sauf "manual" qui est toujours autorisé)
  const triggerEnabled =
    params.trigger === "manual" ||
    (params.trigger === "daily" && !!settings?.daily_enabled) ||
    (params.trigger === "weekly" && !!settings?.weekly_enabled) ||
    (params.trigger === "monthly" && !!settings?.monthly_enabled) ||
    (params.trigger === "caisse_close" && !!settings?.on_caisse_close);

  if (!triggerEnabled) {
    return { ok: true, status: "success" as const, totalRows: 0, error: "disabled", runId: null };
  }

  const formats: string[] =
    Array.isArray(settings?.formats) && settings.formats.length > 0
      ? settings.formats
      : ["json", "sql"];

  const destinations: string[] = [];
  if (settings?.email_enabled && Array.isArray(settings?.email_recipients) && settings.email_recipients.length > 0) {
    destinations.push("email");
  }
  if (settings?.drive_enabled && settings?.drive_folder_id) {
    destinations.push("drive");
  }

  const { data: run } = await sb
    .from("backup_runs")
    .insert({
      trigger: params.trigger,
      destinations,
      formats,
      status: "running",
    })
    .select("id")
    .single();

  let status: "success" | "partial" | "failed" = "success";
  let totalRows = 0;
  let error: string | null = null;

  try {
    const out = await generateBackup(sb);
    totalRows = out.totalRows;

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const baseName = `optigestion_${ts}`;
    const attachments: Attachment[] = [];
    if (formats.includes("json")) {
      attachments.push({ filename: `${baseName}.json`, content: out.jsonContent, mime: "application/json" });
    }
    if (formats.includes("sql")) {
      attachments.push({ filename: `${baseName}.sql`, content: out.sqlContent, mime: "application/sql" });
    }

    const errs: string[] = [];

    if (destinations.includes("email")) {
      try {
        await sendEmailResend(settings.email_recipients as string[], baseName, attachments);
      } catch (e: any) {
        errs.push(`email: ${e?.message ?? e}`);
      }
    }
    if (destinations.includes("drive")) {
      try {
        await uploadToDrive(settings.drive_folder_id as string, attachments);
      } catch (e: any) {
        errs.push(`drive: ${e?.message ?? e}`);
      }
    }

    if (errs.length > 0) {
      status = destinations.length > errs.length ? "partial" : "failed";
      error = errs.join(" | ");
    }
    if (out.errors.length > 0) {
      const tablesErr = `tables: ${out.errors.join("; ")}`;
      error = error ? `${error} | ${tablesErr}` : tablesErr;
      if (status === "success") status = "partial";
    }
  } catch (e: any) {
    status = "failed";
    error = e?.message ?? String(e);
  }

  if (run?.id) {
    await sb
      .from("backup_runs")
      .update({
        status,
        total_rows: totalRows,
        error,
        ended_at: new Date().toISOString(),
      })
      .eq("id", run.id);
  }

  return { ok: status !== "failed", status, totalRows, error, runId: run?.id ?? null };
}
