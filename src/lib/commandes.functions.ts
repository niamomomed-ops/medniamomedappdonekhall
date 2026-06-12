import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { insertNotification, type NotificationType } from "@/lib/notifications.functions";

const STATUS_NOTIF_LABEL: Record<string, string> = {
  commande_creee: "Commande créée",
  verre_commande: "Verre commandé",
  reception_partielle: "Réception partielle",
  verre_recu: "Verre reçu",
  en_montage: "En montage",
  casse_montage: "Casse montage déclarée",
  finalise: "Finalisée",
  en_reception: "En réception",
  reclamation: "Réclamation",
  livree: "Livrée",
};

async function getAgentName(sb: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await sb
    .from("personnel")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return data?.name ?? null;
}

function notifTypeForStatus(status: string): NotificationType {
  if (status === "casse_montage") return "casse_montage";
  return "transition";
}


export const COMMANDE_TYPES = [
  "vision_loin",
  "vision_pres",
  "double_foyer",
  "progressif",
  "lentilles",
] as const;

export const COMMANDE_STATUSES = [
  "commande_creee",
  "verre_commande",
  "reception_partielle",
  "reclamation",
  "verre_recu",
  "en_montage",
  "casse_montage",
  "finalise",
  "en_reception",
  "livree",
] as const;

export type CommandeStatus = (typeof COMMANDE_STATUSES)[number];
export type AppRole = "admin" | "agent_vente" | "agent_montage";

function isMissingOrderedEyeColumn(error: unknown): boolean {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  return (
    code === "PGRST204" ||
    code === "42703" ||
    message.includes("eyes_ordered") ||
    message.includes("ordered_eye")
  );
}

async function insertCommandeWithEyeFallback(sb: any, payload: Record<string, unknown>) {
  const attemptPrimary = await sb.from("commandes").insert(payload).select().single();
  if (!attemptPrimary.error) return attemptPrimary;

  // The lentille_type column may not exist yet (migration not applied) — retry without it.
  const primaryMsg = String((attemptPrimary.error as any)?.message ?? "");
  if ("lentille_type" in payload && primaryMsg.includes("lentille_type")) {
    const { lentille_type, ...withoutLentilleType } = payload;
    return insertCommandeWithEyeFallback(sb, withoutLentilleType);
  }

  if (!isMissingOrderedEyeColumn(attemptPrimary.error)) {
    return attemptPrimary;
  }

  const { eyes_ordered, ...restPayload } = payload;
  const attemptLegacy = await sb
    .from("commandes")
    .insert({ ...restPayload, ordered_eye: eyes_ordered })
    .select()
    .single();
  if (!attemptLegacy.error || !isMissingOrderedEyeColumn(attemptLegacy.error)) {
    return attemptLegacy;
  }

  return sb.from("commandes").insert(restPayload).select().single();
}

async function listCommandesWithEyeFallback(sb: any) {
  const reclamationCols =
    ", reclamation_detail, reclamation_sent_at, reclamation_resolved_at";
  const correctionCols =
    ", od_sphere, od_cylinder, od_axe, od_addition, og_sphere, og_cylinder, og_axe, og_addition";
  const progressiveRel =
    ", progressive:progressive_measurements(ecart_pupillaire_od, ecart_pupillaire_og, hauteur_pupillaire_od, hauteur_pupillaire_og, grand_diametre, hauteur_calibre, pont)";
  const clientsRel =
    ", clients(nom_complet, telephone, whatsapp, mutuelle, mutuelle_autre, cin, email), prescriptions(type, date_prescription), fournisseurs(id, nom, telephone, whatsapp)";
  const deleteCols =
    ", deleted_at, deleted_by, deletion_reason, deletion_caisse_id, status_before_delete";
  const primarySelect =
    "id, numero_commande, status, type, montant, avance, urgent, eyes_ordered, od_received_at, og_received_at, created_at, date_livraison, client_id, prescription_id, caisse_id, monture_source, monture_marque, monture_client_provided, monture_client_called_at, monture_client_received_at, reception_client_called_at, casse_eye, casse_note, casse_at, casse_sent_at, casse_resolved_at" +
    correctionCols +
    reclamationCols +
    clientsRel +
    progressiveRel;
  const legacySelect =
    "id, numero_commande, status, type, montant, avance, urgent, eyes_ordered:ordered_eye, od_received_at, og_received_at, created_at, date_livraison, client_id, prescription_id, caisse_id, monture_source, monture_marque, monture_client_provided, monture_client_called_at, monture_client_received_at, reception_client_called_at, casse_eye, casse_note, casse_at, casse_sent_at, casse_resolved_at" +
    correctionCols +
    reclamationCols +
    clientsRel +
    progressiveRel;
  const baseSelect =
    "id, numero_commande, status, type, montant, avance, urgent, od_received_at, og_received_at, created_at, date_livraison, client_id, prescription_id, caisse_id, monture_source, monture_marque, monture_client_provided, monture_client_called_at, monture_client_received_at, reception_client_called_at, casse_eye, casse_note, casse_at, casse_sent_at, casse_resolved_at" +
    correctionCols +
    reclamationCols +
    clientsRel +
    progressiveRel;

  const runList = (selectClause: string) =>
    sb
      .from("commandes")
      .select(selectClause)
      .order("urgent", { ascending: false })
      .order("created_at", { ascending: false });

  // Try with delete columns first; fall back if migration not applied yet
  const isMissingDeleteCol = (err: unknown) => {
    const m = String((err as any)?.message ?? "");
    return /deleted_at|deletion_caisse_id|deletion_reason|status_before_delete|deleted_by/.test(m);
  };
  const withDelete = (s: string) => s + deleteCols;
  const isMissingCasseResolved = (err: unknown) =>
    /casse_resolved_at/.test(String((err as any)?.message ?? ""));
  const stripCasseResolved = (s: string) => s.replace(", casse_resolved_at", "");

  const normalizeProgressive = (res: any) => {
    if (!res || res.error || !Array.isArray(res.data)) return res;
    return {
      ...res,
      data: res.data.map((row: any) => ({
        ...row,
        progressive: Array.isArray(row?.progressive)
          ? row.progressive[0] ?? null
          : row?.progressive ?? null,
      })),
    };
  };

  let primary = await runList(withDelete(primarySelect));
  if (primary.error && isMissingDeleteCol(primary.error)) {
    primary = await runList(primarySelect);
  }
  if (primary.error && isMissingCasseResolved(primary.error)) {
    primary = await runList(stripCasseResolved(withDelete(primarySelect)));
    if (primary.error && isMissingDeleteCol(primary.error)) {
      primary = await runList(stripCasseResolved(primarySelect));
    }
  }
  if (!primary.error || !isMissingOrderedEyeColumn(primary.error)) {
    return normalizeProgressive(primary);
  }

  let legacy = await runList(withDelete(legacySelect));
  if (legacy.error && isMissingDeleteCol(legacy.error)) {
    legacy = await runList(legacySelect);
  }
  if (legacy.error && isMissingCasseResolved(legacy.error)) {
    legacy = await runList(stripCasseResolved(withDelete(legacySelect)));
    if (legacy.error && isMissingDeleteCol(legacy.error)) {
      legacy = await runList(stripCasseResolved(legacySelect));
    }
  }
  if (!legacy.error || !isMissingOrderedEyeColumn(legacy.error)) {
    return normalizeProgressive(legacy);
  }

  const base = await runList(baseSelect);
  if (base.error) return base;

  return normalizeProgressive({
    ...base,
    data: (base.data ?? []).map((row: any) => ({ ...row, eyes_ordered: "both" })),
  });
}


// Role-based allowed transitions
const TRANSITIONS: Record<AppRole, Record<string, CommandeStatus[]>> = {
  admin: Object.fromEntries(
    COMMANDE_STATUSES.map((s) => [
      s,
      COMMANDE_STATUSES.filter((x) => x !== s) as CommandeStatus[],
    ]),
  ) as Record<string, CommandeStatus[]>,
  agent_vente: {
    commande_creee: ["verre_commande"],
    casse_montage: ["verre_commande"],
    finalise: ["en_reception"],
    en_reception: ["livree"],
  },
  agent_montage: {
    verre_commande: ["verre_recu"],
    verre_recu: ["en_montage"],
    en_montage: ["finalise", "casse_montage"],
  },
};

export function allowedNextStatuses(
  role: AppRole,
  current: CommandeStatus,
  type_vision?: string | null,
): CommandeStatus[] {
  const base = TRANSITIONS[role]?.[current] ?? [];
  if (type_vision === "lentilles") {
    // Lentilles : court-circuite l'étape montage
    if (current === "verre_commande") return ["verre_recu"];
    if (current === "verre_recu") return ["en_reception"];
    if (["en_montage", "finalise", "casse_montage"].includes(current)) return [];
  }
  return base;
}

async function getUserRoles(supabase: any, userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { role: AppRole }) => r.role);
}

async function assertAnyRole(
  supabase: any,
  userId: string,
  allowed: readonly AppRole[],
  msg = "Forbidden",
) {
  const roles = await getUserRoles(supabase, userId);
  if (!roles.some((r) => allowed.includes(r))) throw new Error(msg);
  return roles;
}

const createInput = z.object({
  client_id: z.string().uuid(),
  prescription_id: z.string().uuid().optional().nullable(),
  fournisseur_id: z.string().uuid().optional().nullable(),
  type: z.enum(COMMANDE_TYPES),
  date_livraison: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  montant: z.number().min(0).max(99999999),
  avance: z.number().min(0).max(99999999),
  monture_source: z.enum(["boutique", "donnee"]).optional().nullable(),
  monture_marque: z.string().trim().max(255).optional().nullable(),
  monture_client_provided: z.boolean().optional().nullable(),
  type_verres: z.string().trim().max(255).optional().nullable(),
  lentilles: z.string().trim().max(255).optional().nullable(),
  quantite: z.number().int().min(1).max(1000).default(1),
  notes: z.string().trim().max(2000).optional().nullable(),
  urgent: z.boolean().optional().default(false),
  od_sphere: z.number().optional().nullable(),
  od_cylinder: z.number().optional().nullable(),
  od_axe: z.number().int().min(0).max(180).optional().nullable(),
  od_addition: z.number().optional().nullable(),
  og_sphere: z.number().optional().nullable(),
  og_cylinder: z.number().optional().nullable(),
  og_axe: z.number().int().min(0).max(180).optional().nullable(),
  og_addition: z.number().optional().nullable(),
  eyes_ordered: z.enum(["both", "od", "og"], {
    required_error: "Veuillez sélectionner les yeux à commander",
    invalid_type_error: "Veuillez sélectionner les yeux à commander",
  }),
  lentille_type: z.enum(["origine", "spherique"]).optional().nullable(),
  based_on_id: z.string().uuid().optional().nullable(),
  progressive: z
    .object({
      ecart_pupillaire_od: z.number().optional().nullable(),
      ecart_pupillaire_og: z.number().optional().nullable(),
      hauteur_pupillaire_od: z.number().optional().nullable(),
      hauteur_pupillaire_og: z.number().optional().nullable(),
      grand_diametre: z.number().optional().nullable(),
      hauteur_calibre: z.number().optional().nullable(),
      pont: z.number().optional().nullable(),
    })
    .optional()
    .nullable(),
}).refine((d) => d.avance <= d.montant, {
  message: "L'avance ne peut pas être supérieure au montant total",
  path: ["avance"],
});



export const createCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.supabase,
      context.userId,
      ["admin", "agent_vente"],
      "Forbidden: création réservée à admin et agent_vente",
    );

    // Require an open caisse
    const { data: openCaisse, error: caisseErr } = await context.supabase
      .from("caisses")
      .select("id")
      .eq("status", "open")
      .maybeSingle();
    if (caisseErr) throw new Error(caisseErr.message);
    if (!openCaisse) throw new Error("Impossible de créer une commande sans caisse ouverte");

    const sb = context.supabase as any;
    const { data: created, error } = await insertCommandeWithEyeFallback(sb, {
      client_id: data.client_id,
      prescription_id: data.prescription_id ?? null,
      fournisseur_id: data.fournisseur_id ?? null,
      caisse_id: openCaisse.id,
      type: data.type,
      date_livraison: data.date_livraison ?? null,
      montant: data.montant,
      avance: data.avance,
      monture_source: data.monture_source ?? null,
      monture_marque: data.monture_marque ?? null,
      monture_client_provided:
        data.monture_source === "donnee"
          ? data.monture_client_provided ?? false
          : null,
      type_verres: data.type_verres ?? null,
      lentilles: data.lentilles ?? null,
      quantite: data.quantite,
      notes: data.notes ?? null,
      urgent: data.urgent ?? false,
      od_sphere: data.od_sphere ?? null,
      od_cylinder: data.od_cylinder ?? null,
      od_axe: data.od_axe ?? null,
      od_addition: data.od_addition ?? null,
      og_sphere: data.og_sphere ?? null,
      og_cylinder: data.og_cylinder ?? null,
      og_axe: data.og_axe ?? null,
      og_addition: data.og_addition ?? null,
      eyes_ordered: data.eyes_ordered,
      lentille_type: data.type === "lentilles" ? data.lentille_type ?? "origine" : null,
      based_on_id: data.based_on_id ?? null,
      status: "commande_creee",
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    // Log history (initial creation)
    await sb.from("order_history").insert({
      commande_id: created.id,
      old_status: null,
      new_status: "commande_creee",
      changed_by: context.userId,
    });

    if (data.type === "progressif" && data.progressive) {
      await sb.from("progressive_measurements").insert({
        commande_id: created.id,
        ...data.progressive,
      });
    }

    return created;
  });

export const listCommandes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data, error } = await listCommandesWithEyeFallback(sb);

    if (error) throw new Error(error.message);
    const rawRows = data ?? [];

    // Recalculer le vrai reste pour chaque commande (montant - avance - Σversements)
    // Fetch all versements for these commandes in one query
    const commandeIds = rawRows.map((r: any) => r.id);
    let versementsMap: Record<string, number> = {};
    if (commandeIds.length > 0) {
      const { data: allVers } = await sb
        .from("versements")
        .select("commande_id, amount")
        .in("commande_id", commandeIds);
      for (const v of allVers ?? []) {
        versementsMap[v.commande_id] = (versementsMap[v.commande_id] ?? 0) + Number(v.amount);
      }
    }
    const rows = rawRows.map((r: any) => ({
      ...r,
      reste: Math.max(0, Number(r.montant) - Number(r.avance) - (versementsMap[r.id] ?? 0)),
    }));

    // Fetch real delivery date from order_history for livrée commandes
    const livreeIds = rows
      .filter((r: any) => r.status === "livree")
      .map((r: any) => r.id);
    const deliveredMap: Record<string, string> = {};
    if (livreeIds.length > 0) {
      const { data: oh } = await sb
        .from("order_history")
        .select("commande_id, created_at, new_status")
        .eq("new_status", "livree")
        .in("commande_id", livreeIds)
        .order("created_at", { ascending: false });
      for (const h of oh ?? []) {
        if (!deliveredMap[h.commande_id]) {
          deliveredMap[h.commande_id] = h.created_at;
        }
      }
    }
    for (const r of rows) {
      (r as any).delivered_at = deliveredMap[r.id] ?? null;
    }

    const isMontageOnly =
      roles.includes("agent_montage") &&
      !roles.includes("admin") &&
      !roles.includes("agent_vente");
    if (!isMontageOnly) return rows;
    const VISIBLE: CommandeStatus[] = [
      "verre_commande",
      "reception_partielle",
      "reclamation",
      "verre_recu",
      "en_montage",
      "finalise",
      "casse_montage",
      "livree",
    ];
    return rows.filter(
      (r: any) => r.type !== "lentilles" && VISIBLE.includes(r.status),
    );
  });


export const getCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("commandes")
      .select(
        "*, clients(id, nom_complet, date_naissance, telephone, whatsapp, mutuelle, mutuelle_autre), prescriptions(*), fournisseurs(id, nom, telephone, whatsapp), caisses!commandes_caisse_id_fkey(id, label, opened_at, status)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Commande introuvable");

    const { data: historyRaw, error: histErr } = await sb
      .from("order_history")
      .select("id, old_status, new_status, changed_at, changed_by")
      .eq("commande_id", data.id)
      .order("changed_at", { ascending: false });
    const changerIds = Array.from(
      new Set((historyRaw ?? []).map((h: any) => h.changed_by).filter(Boolean)),
    );
    let personnelMap: Record<string, { name: string; email: string }> = {};
    if (changerIds.length) {
      const { data: people } = await sb
        .from("personnel")
        .select("id, name, email")
        .in("id", changerIds);
      personnelMap = Object.fromEntries(
        (people ?? []).map((p: any) => [p.id, { name: p.name, email: p.email }]),
      );
    }
    const history = (historyRaw ?? []).map((h: any) => ({
      ...h,
      personnel: h.changed_by ? personnelMap[h.changed_by] ?? null : null,
    }));
    if (histErr) throw new Error(histErr.message);

    let progressive: any = null;
    if (row.type === "progressif") {
      const { data: pm } = await sb
        .from("progressive_measurements")
        .select("*")
        .eq("commande_id", data.id)
        .maybeSingle();
      progressive = pm ?? null;
    }

    let based_on: { id: string; numero_commande: string | null } | null = null;
    if ((row as any).based_on_id) {
      const { data: src } = await sb
        .from("commandes")
        .select("id, numero_commande")
        .eq("id", (row as any).based_on_id)
        .maybeSingle();
      based_on = src ?? null;
    }

    return {
      ...row,
      eyes_ordered: (row as any).eyes_ordered ?? (row as any).ordered_eye ?? null,
      history: history ?? [],
      progressive,
      based_on,
    };
  });

export const changeCommandeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        new_status: z.enum(COMMANDE_STATUSES),
        casse_eye: z.enum(["od", "og", "both"]).optional().nullable(),
        casse_note: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);

    const sb = context.supabase as any;
    const { data: current, error: curErr } = await sb
      .from("commandes")
      .select(
        "id, numero_commande, status, type, monture_source, monture_client_provided, monture_client_received_at, eyes_ordered, od_received_at, og_received_at, reclamation_detail, reclamation_sent_at, clients(nom_complet)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!current) throw new Error("Commande introuvable");

    if (current.status === data.new_status) {
      return current;
    }


    const allowed = new Set<CommandeStatus>();
    for (const r of roles) {
      for (const s of allowedNextStatuses(r, current.status as CommandeStatus, (current as any).type)) {
        allowed.add(s);
      }
    }
    if (!allowed.has(data.new_status)) {
      throw new Error("Transition de statut non autorisée pour votre rôle");
    }

    const needsClientFrame =
      current.monture_source === "donnee" && current.monture_client_provided !== true;

    if (
      data.new_status === "en_montage" &&
      needsClientFrame &&
      !current.monture_client_received_at
    ) {
      throw new Error(
        "Impossible de démarrer le montage : monture client non encore reçue.",
      );
    }

    if (data.new_status === "casse_montage" && !data.casse_eye) {
      throw new Error("Préciser l'œil cassé pour déclarer une casse au montage.");
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, any> = { status: data.new_status };
    if (data.new_status === "casse_montage") {
      update.casse_eye = data.casse_eye;
      update.casse_note = data.casse_note ?? null;
      update.casse_at = nowIso;
      update.casse_by = context.userId;
    }
    // Transitioning to verre_recu marks both eyes as received (if applicable).
    let secondEye: "od" | "og" | null = null;
    if (data.new_status === "verre_recu") {
      const eyes = (current.eyes_ordered ?? "both") as "od" | "og" | "both";
      if (eyes === "both" || eyes === "od") {
        if (!current.od_received_at) {
          update.od_received_at = nowIso;
          if (current.status === "reception_partielle" && !current.od_received_at) secondEye = "od";
        }
      }
      if (eyes === "both" || eyes === "og") {
        if (!current.og_received_at) {
          update.og_received_at = nowIso;
          if (current.status === "reception_partielle" && !current.og_received_at) secondEye = "og";
        }
      }
    }

    const { data: updated, error: upErr } = await sb
      .from("commandes")
      .update(update)
      .eq("id", data.id)
      .select()
      .single();
    if (upErr) throw new Error(upErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: current.status,
      new_status: data.new_status,
      changed_by: context.userId,
    });

    if (data.new_status === "casse_montage") {
      const eyeKey =
        data.casse_eye === "od"
          ? "monture_casse_od"
          : data.casse_eye === "og"
          ? "monture_casse_og"
          : "monture_casse_both";
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: data.casse_note ? data.casse_note.slice(0, 500) : null,
        new_status: eyeKey,
        changed_by: context.userId,
      });
    }

    if (data.new_status === "verre_recu" && needsClientFrame) {
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: null,
        new_status: "monture_client_attendue",
        changed_by: context.userId,
      });
    }

    if (data.new_status === "verre_recu" && secondEye) {
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: null,
        new_status: secondEye === "od" ? "reception_complete_od" : "reception_complete_og",
        changed_by: context.userId,
      });
    }

    if (data.new_status === "en_reception") {
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: null,
        new_status: "reception_client_attendu",
        changed_by: context.userId,
      });
    }


    // Notification (best-effort)
    {
      const agentName = await getAgentName(sb, context.userId);
      await insertNotification(sb, {
        commande_id: data.id,
        type: notifTypeForStatus(data.new_status),
        numero_commande: current.numero_commande ?? null,
        client_nom: (current as any).clients?.nom_complet ?? null,
        label:
          STATUS_NOTIF_LABEL[data.new_status] ?? data.new_status,
        agent_name: agentName,
        user_id: context.userId,
      });
    }

    return updated;
  });



// ============================================================
// Contrôle qualité à la réception verre + réclamation fournisseur
// ============================================================

const RECLAMATION_STATES = ["correct", "manquant", "errone"] as const;
type ReclamationState = (typeof RECLAMATION_STATES)[number];

function summarizeReclamation(
  detail: { od?: ReclamationState | null; og?: ReclamationState | null },
  meta?: { numero_commande?: string | null; created_at?: string | null },
): string {
  const parts: string[] = [];
  if (detail.od === "manquant") parts.push("OD manquant");
  if (detail.od === "errone") parts.push("OD erroné");
  if (detail.og === "manquant") parts.push("OG manquant");
  if (detail.og === "errone") parts.push("OG erroné");
  const problem = parts.join(" · ");
  const ref = meta?.numero_commande ?? null;
  const dateStr = meta?.created_at
    ? new Date(meta.created_at).toLocaleDateString("fr-FR")
    : null;
  const prefix = [ref, dateStr ? `créée le ${dateStr}` : null]
    .filter(Boolean)
    .join(" — ");
  return prefix ? `${prefix} : ${problem}` : problem;
}

export const submitQualityCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        checks: z.object({
          od: z.enum(RECLAMATION_STATES).optional().nullable(),
          og: z.enum(RECLAMATION_STATES).optional().nullable(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select(
        "id, status, type, eyes_ordered, casse_eye, casse_at, casse_resolved_at, od_received_at, og_received_at, numero_commande, created_at, reclamation_detail, reclamation_sent_at, reclamation_resolved_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    // Lentilles : agent_vente est autorisé (l'agent montage ne voit pas les lentilles).
    // Lunettes : reste admin / agent_montage.
    const allowedRoles: AppRole[] =
      (cur as any).type === "lentilles"
        ? ["admin", "agent_vente", "agent_montage"]
        : ["admin", "agent_montage"];
    await assertAnyRole(context.supabase, context.userId, allowedRoles);
    if (cur.status !== "verre_commande") {
      throw new Error(
        "Le contrôle qualité n'est possible qu'au statut « Verre commandé ».",
      );
    }

// Déterminer les yeux concernés (cas casse partielle ou réclamation active)
const eyes = (cur.eyes_ordered ?? "both") as "both" | "od" | "og";
const reclamationDetail = cur.reclamation_detail as
  | { od?: ReclamationState | null; og?: ReclamationState | null }
  | null;
const hasActiveReclamation =
  reclamationDetail &&
  !cur.reclamation_resolved_at &&
  (reclamationDetail.od === "manquant" || reclamationDetail.od === "errone" ||
   reclamationDetail.og === "manquant" || reclamationDetail.og === "errone");
let checkOD: boolean;
let checkOG: boolean;
if (hasActiveReclamation) {
  checkOD = reclamationDetail.od === "manquant" || reclamationDetail.od === "errone";
  checkOG = reclamationDetail.og === "manquant" || reclamationDetail.og === "errone";
} else {
  const casseOnly =
    cur.casse_eye && cur.casse_eye !== "both" ? (cur.casse_eye as "od" | "og") : null;
  checkOD = casseOnly ? casseOnly === "od" : eyes === "both" || eyes === "od";
  checkOG = casseOnly ? casseOnly === "og" : eyes === "both" || eyes === "og";
}

    const odState = checkOD ? (data.checks.od ?? null) : null;
    const ogState = checkOG ? (data.checks.og ?? null) : null;

    if (checkOD && !odState) throw new Error("État OD requis");
    if (checkOG && !ogState) throw new Error("État OG requis");

    const allCorrect =
      (!checkOD || odState === "correct") && (!checkOG || ogState === "correct");

    const nowIso = new Date().toISOString();
    const update: Record<string, any> = {};

    if (allCorrect) {
      // Tout est OK → passage normal au statut verre_recu
      update.status = "verre_recu";
      if (checkOD && !cur.od_received_at) update.od_received_at = nowIso;
      if (checkOG && !cur.og_received_at) update.og_received_at = nowIso;
      update.reclamation_detail = null;
      update.reclamation_sent_at = null;
      update.reclamation_sent_by = null;
      update.reclamation_resolved_at = null;
      update.reclamation_resolved_by = null;
      // Auto-résolution casse si une casse active existait sur cette commande
      if (cur.casse_eye && cur.casse_at && !cur.casse_resolved_at) {
        update.casse_resolved_at = nowIso;
        update.casse_resolved_by = context.userId;
      }
    } else {
      // Au moins un problème → passer en reclamation avec reclamation_detail
      const detail: Record<string, ReclamationState> = {};
      if (checkOD && odState) detail.od = odState;
      if (checkOG && ogState) detail.og = ogState;
      update.status = "reclamation";
      update.reclamation_detail = detail;
      update.reclamation_sent_at = null;
      update.reclamation_sent_by = null;
      update.reclamation_resolved_at = null;
      update.reclamation_resolved_by = null;
      // Marquer comme reçus uniquement les verres "correct"
      if (checkOD && odState === "correct" && !cur.od_received_at)
        update.od_received_at = nowIso;
      if (checkOG && ogState === "correct" && !cur.og_received_at)
        update.og_received_at = nowIso;
    }

    const { data: updated, error: uErr } = await sb
      .from("commandes")
      .update(update)
      .eq("id", data.id)
      .select()
      .single();
    if (uErr) throw new Error(uErr.message);

    if (allCorrect) {
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: cur.status,
        new_status: "verre_recu",
        changed_by: context.userId,
      });
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: null,
        new_status: "controle_qualite_ok",
        changed_by: context.userId,
      });
      if (cur.casse_eye && cur.casse_at && !cur.casse_resolved_at) {
        await sb.from("order_history").insert({
          commande_id: data.id,
          old_status: null,
          new_status: "casse_resolue",
          changed_by: context.userId,
        });
      }
    } else {
      const summary = summarizeReclamation(update.reclamation_detail, {
        numero_commande: cur.numero_commande,
        created_at: cur.created_at,
      });
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: summary || null,
        new_status: "reclamation_declaree",
        changed_by: context.userId,
      });
    }

    // Notification
    {
      const agentName = await getAgentName(sb, context.userId);
      if (allCorrect) {
        await insertNotification(sb, {
          commande_id: data.id,
          type: "transition",
          numero_commande: cur.numero_commande ?? null,
          label: "Verre reçu",
          agent_name: agentName,
          user_id: context.userId,
        });
      } else {
        await insertNotification(sb, {
          commande_id: data.id,
          type: "reclamation_en_cours",
          numero_commande: cur.numero_commande ?? null,
          label: "Réclamation déclarée",
          agent_name: agentName,
          user_id: context.userId,
        });
      }
    }

    return updated;
  });


export const markReclamationSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
    ]);
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select("id, reclamation_detail, reclamation_sent_at, reclamation_resolved_at")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    if (!cur.reclamation_detail || cur.reclamation_resolved_at) {
      throw new Error("Aucune réclamation active sur cette commande.");
    }
    if (cur.reclamation_sent_at) return cur;

    const nowIso = new Date().toISOString();
    const { error: uErr } = await sb
      .from("commandes")
      .update({
        status: "verre_commande",
        reclamation_sent_at: nowIso,
        reclamation_sent_by: context.userId,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: "reclamation",
      new_status: "verre_commande",
      changed_by: context.userId,
    });

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: "reclamation_envoyee",
      changed_by: context.userId,
    });

    return { ok: true };
  });

export const markCasseSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
    ]);
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select("id, status, casse_eye, casse_sent_at")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    if (cur.status !== "casse_montage") {
      throw new Error("Cette commande n'est pas en casse au montage.");
    }
    if (cur.casse_sent_at) return cur;

    const nowIso = new Date().toISOString();
    const { error: uErr } = await sb
      .from("commandes")
      .update({
        status: "verre_commande",
        casse_sent_at: nowIso,
        casse_sent_by: context.userId,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: "casse_montage",
      new_status: "verre_commande",
      changed_by: context.userId,
    });

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: "casse_envoyee",
      changed_by: context.userId,
    });

    return { ok: true };
  });

export const resolveReclamation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select(
        "id, status, eyes_ordered, casse_eye, reclamation_detail, reclamation_resolved_at, od_received_at, og_received_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    if (!cur.reclamation_detail || cur.reclamation_resolved_at) {
      throw new Error("Aucune réclamation active à résoudre.");
    }

    const eyes = (cur.eyes_ordered ?? "both") as "both" | "od" | "og";
    const casseOnly =
      cur.casse_eye && cur.casse_eye !== "both" ? (cur.casse_eye as "od" | "og") : null;
    const checkOD = casseOnly ? casseOnly === "od" : eyes === "both" || eyes === "od";
    const checkOG = casseOnly ? casseOnly === "og" : eyes === "both" || eyes === "og";

    const nowIso = new Date().toISOString();
    const update: Record<string, any> = {
      status: "verre_recu",
      reclamation_resolved_at: nowIso,
      reclamation_resolved_by: context.userId,
    };
    if (checkOD && !cur.od_received_at) update.od_received_at = nowIso;
    if (checkOG && !cur.og_received_at) update.og_received_at = nowIso;

    const { data: updated, error: uErr } = await sb
      .from("commandes")
      .update(update)
      .eq("id", data.id)
      .select()
      .single();
    if (uErr) throw new Error(uErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: cur.status,
      new_status: "verre_recu",
      changed_by: context.userId,
    });
    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: "reclamation_resolue",
      changed_by: context.userId,
    });

    return updated;
  });



export const resolveCasse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select(
        "id, status, casse_eye, casse_at, casse_sent_at, casse_resolved_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    if (!cur.casse_eye || !cur.casse_at) {
      throw new Error("Aucune casse à résoudre sur cette commande.");
    }
    if (cur.casse_resolved_at) return cur;

    const nowIso = new Date().toISOString();
    const { data: updated, error: uErr } = await sb
      .from("commandes")
      .update({
        casse_resolved_at: nowIso,
        casse_resolved_by: context.userId,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (uErr) throw new Error(uErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: "casse_resolue",
      changed_by: context.userId,
    });

    return updated;
  });



export const markMontureClientCalled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), via_app: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select("id, monture_source, monture_client_called_at")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    if (cur.monture_source !== "donnee")
      throw new Error("Cette commande n'utilise pas une monture client.");
    if (cur.monture_client_called_at) return cur;

    const now = new Date().toISOString();
    const { error: uErr } = await sb
      .from("commandes")
      .update({
        monture_client_called_at: now,
        monture_client_called_by: context.userId,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: data.via_app ? "monture_client_appel_app" : "monture_client_appel",
      changed_by: context.userId,
    });

    return { ok: true };
  });

export const markMontureClientReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select("id, monture_source, monture_client_received_at")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    if (cur.monture_source !== "donnee")
      throw new Error("Cette commande n'utilise pas une monture client.");
    if (cur.monture_client_received_at) return cur;

    const now = new Date().toISOString();
    const { error: uErr } = await sb
      .from("commandes")
      .update({
        monture_client_received_at: now,
        monture_client_received_by: context.userId,
        monture_client_provided: true,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: "monture_client_recue",
      changed_by: context.userId,
    });

    return { ok: true };
  });


export const listCommandesForClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ client_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("commandes")
      .select(
        "id, numero_commande, status, type, montant, avance, created_at, prescription_id, prescriptions(date_prescription, type)",
      )
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rawRows = rows ?? [];
    // Calculer le vrai reste pour chaque commande en incluant les versements
    const enriched = await Promise.all(
      rawRows.map(async (row: any) => {
        const { data: vs } = await sb
          .from("versements")
          .select("amount")
          .eq("commande_id", row.id);
        const sumVers = (vs ?? []).reduce((s: number, v: any) => s + Number(v.amount), 0);
        const reste = Math.max(0, Number(row.montant) - Number(row.avance) - sumVers);
        return { ...row, reste };
      }),
    );
    return enriched;
  });

export const isCaisseOpen = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("caisses")
      .select("id, label, opened_at")
      .eq("status", "open")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const markReceptionClientCalled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), via_app: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: cur, error: cErr } = await sb
      .from("commandes")
      .select("id, status, reception_client_called_at")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cur) throw new Error("Commande introuvable");
    if (cur.status !== "en_reception")
      throw new Error("La commande n'est pas en réception.");
    if (cur.reception_client_called_at) return cur;

    const now = new Date().toISOString();
    const { error: uErr } = await sb
      .from("commandes")
      .update({
        reception_client_called_at: now,
        reception_client_called_by: context.userId,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: data.via_app ? "reception_client_appel_app" : "reception_client_appel",
      changed_by: context.userId,
    });

    return { ok: true };
  });


export const PAYMENT_MODES = ["especes", "carte", "virement", "autre"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  especes: "Espèces",
  carte: "Carte",
  virement: "Virement",
  autre: "Autre",
};

/** Résumé paiement d'une commande (pour le popup de livraison). */
export const getCommandePaymentSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: cmd, error } = await sb
      .from("commandes")
      .select(
        "id, numero_commande, status, montant, avance, reste, clients(nom_complet)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cmd) throw new Error("Commande introuvable");

    const { data: vs, error: vErr } = await sb
      .from("versements")
      .select("amount")
      .eq("commande_id", data.id);
    if (vErr) throw new Error(vErr.message);
    const sumVers = (vs ?? []).reduce(
      (s: number, v: any) => s + Number(v.amount),
      0,
    );

    const total = Number(cmd.montant);
    const deja_paye = Number(cmd.avance) + sumVers;
    const reste = Math.max(0, total - deja_paye);

    return {
      id: cmd.id,
      numero_commande: cmd.numero_commande as string | null,
      status: cmd.status as CommandeStatus,
      client_nom: (cmd.clients?.nom_complet as string | null) ?? null,
      total,
      deja_paye,
      reste,
    };
  });

/**
 * Confirmer la livraison d'une commande avec encaissement.
 * - encaissé > 0 → entrée caisse "Règlement récupération — CMD-XXX — [Nom client]"
 * - encaissé < reste → la différence reste due (dette)
 * - encaissé = 0 → la totalité du reste reste due (dette)
 * Dans tous les cas → statut "livree" + trace dans le journal.
 */
export const deliverCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        amount: z.number().min(0).max(99999999),
        payment_mode: z.enum(PAYMENT_MODES),
        note: z.string().trim().max(500).optional().nullable(),
        livrer_mutuelle_demande_id: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertAnyRole(
      context.supabase,
      context.userId,
      ["admin", "agent_vente"],
      "Forbidden: livraison réservée à admin et agent_vente",
    );
    const sb = context.supabase as any;

    const { data: cmd, error: cmdErr } = await sb
      .from("commandes")
      .select(
        "id, numero_commande, status, type, montant, avance, reste, client_id, clients(nom_complet)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cmdErr) throw new Error(cmdErr.message);
    if (!cmd) throw new Error("Commande introuvable");

    if (cmd.status === "livree") throw new Error("Commande déjà livrée");

    // Transition autorisée vers "livree" pour le rôle ?
    const allowed = new Set<CommandeStatus>();
    for (const r of roles) {
      for (const s of allowedNextStatuses(r, cmd.status as CommandeStatus, (cmd as any).type)) {
        allowed.add(s);
      }
    }
    if (!allowed.has("livree")) {
      throw new Error("Transition vers « Livrée » non autorisée pour votre rôle");
    }

    // Reste réel à partir des versements (source de vérité)
    const { data: vs, error: vErr } = await sb
      .from("versements")
      .select("amount")
      .eq("commande_id", data.id);
    if (vErr) throw new Error(vErr.message);
    const sumVers = (vs ?? []).reduce(
      (s: number, v: any) => s + Number(v.amount),
      0,
    );
    const reste = Math.max(0, Number(cmd.montant) - Number(cmd.avance) - sumVers);

    if (data.amount > reste + 0.001) {
      throw new Error(
        `Le montant encaissé (${data.amount}) dépasse le reste à payer (${reste.toFixed(2)})`,
      );
    }

    const clientNom = (cmd.clients?.nom_complet as string | null) ?? "Client";
    const cmdLabel = cmd.numero_commande ?? cmd.id;

    // Caisse ouverte requise dès qu'on encaisse
    let openCaisseId: string | null = null;
    if (data.amount > 0) {
      const { data: openCaisse, error: cErr } = await sb
        .from("caisses")
        .select("id")
        .eq("status", "open")
        .maybeSingle();
      if (cErr) throw new Error(cErr.message);
      if (!openCaisse)
        throw new Error("Aucune caisse ouverte pour encaisser le règlement");
      openCaisseId = openCaisse.id;

      const modeLabel = PAYMENT_MODE_LABELS[data.payment_mode];
      const versNote = [`Mode: ${modeLabel}`, data.note?.trim()]
        .filter(Boolean)
        .join(" — ");

      await sb.from("versements").insert({
        commande_id: data.id,
        caisse_id: openCaisseId,
        amount: data.amount,
        note: versNote,
        created_by: context.userId,
      });

      await sb.from("transactions").insert({
        caisse_id: openCaisseId,
        type: "entree",
        amount: data.amount,
        description: `Règlement récupération — ${cmdLabel} — ${clientNom} (${modeLabel})`,
        created_by: context.userId,
        is_manual: false,
      });
    }

    const newReste = Math.max(0, reste - data.amount);

    // Update status + persist the real reste (overrides the generated column if writable,
    // or at least records the correct value for reads that use this column)
    const { data: updated, error: upErr } = await sb
      .from("commandes")
      .update({ status: "livree", reste: newReste })
      .eq("id", data.id)
      .select()
      .single();
    if (upErr) throw new Error(upErr.message);

    // Journal
    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: cmd.status,
      new_status: "livree",
      changed_by: context.userId,
    });

    // Créer une dette client si reste impayé
    if (newReste > 0) {
      // Essayer d'insérer dans la table dettes (si elle existe)
      const { error: detteErr } = await sb.from("dettes").insert({
        client_id: cmd.client_id ?? (cmd.clients as any)?.id ?? null,
        commande_id: data.id,
        montant: newReste,
        created_by: context.userId,
      });
      // Si la table dettes n'existe pas encore, on tombe en fallback sur order_history
      if (detteErr) {
        await sb.from("order_history").insert({
          commande_id: data.id,
          old_status: `dette_${newReste.toFixed(2)}`,
          new_status: "dette_recuperation",
          changed_by: context.userId,
        });
      }
    }

    // Marquer la mutuelle liée comme livrée, si demandé
    if (data.livrer_mutuelle_demande_id) {
      try {
        const { data: dm } = await sb
          .from("demandes_mutuelles")
          .select("id, livree, statut")
          .eq("id", data.livrer_mutuelle_demande_id)
          .maybeSingle();
        if (dm && !dm.livree) {
          await sb
            .from("demandes_mutuelles")
            .update({ livree: true, livree_at: new Date().toISOString(), statut: "livree" })
            .eq("id", data.livrer_mutuelle_demande_id);
          try {
            await sb.from("demande_mutuelle_history").insert({
              demande_id: data.livrer_mutuelle_demande_id,
              event_type: "statut_livraison_livree",
              old_statut: null,
              new_statut: null,
              changed_by: context.userId,
            });
          } catch {
            // best-effort
          }
        }
      } catch {
        // best-effort: ne pas bloquer la livraison commande
      }
    }

    return {
      ...updated,
      encaisse: data.amount,
      reste_du: newReste,
      dette_creee: newReste > 0,
    };
  });

// ============================================================
// Versements liés à une commande (bloc Paiement)
// ============================================================

export type CommandeVersement = {
  id: string;
  amount: number;
  created_at: string;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
  caisse_id: string | null;
};

async function resolveAgentsMap(sb: any, userIds: string[]) {
  const map: Record<string, { name: string; role: string }> = {};
  if (!userIds.length) return map;
  const { data } = await sb
    .from("personnel")
    .select("id, name, role")
    .in("id", userIds);
  for (const p of data ?? []) map[p.id] = { name: p.name, role: p.role };
  return map;
}

async function getOpenCaisseId(sb: any): Promise<string> {
  const { data, error } = await sb
    .from("caisses")
    .select("id")
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aucune caisse ouverte");
  return data.id as string;
}

async function loadCommandeBase(sb: any, id: string) {
  const { data, error } = await sb
    .from("commandes")
    .select("id, numero_commande, montant, avance, client_id, clients(nom_complet)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Commande introuvable");
  return data;
}

async function sumOtherVersements(sb: any, commandeId: string, excludeId?: string) {
  let q = sb.from("versements").select("id, amount").eq("commande_id", commandeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((v: any) => (excludeId ? v.id !== excludeId : true))
    .reduce((s: number, v: any) => s + Number(v.amount), 0);
}

export const listCommandeVersements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CommandeVersement[]> => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
      "agent_montage",
    ]);
    const sb = context.supabase as any;
    const { data: vs, error } = await sb
      .from("versements")
      .select("id, amount, created_at, note, created_by, caisse_id")
      .eq("commande_id", data.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = Array.from(
      new Set((vs ?? []).map((v: any) => v.created_by).filter(Boolean)),
    ) as string[];
    const agents = await resolveAgentsMap(sb, ids);
    return (vs ?? []).map((v: any) => ({
      id: v.id,
      amount: Number(v.amount),
      created_at: v.created_at,
      note: v.note,
      created_by: v.created_by,
      created_by_name: v.created_by ? agents[v.created_by]?.name ?? null : null,
      created_by_role: v.created_by ? agents[v.created_by]?.role ?? null : null,
      caisse_id: v.caisse_id ?? null,
    }));
  });

export const createCommandeVersement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        commande_id: z.string().uuid(),
        amount: z.number().positive().max(99999999),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/)
          .optional()
          .nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.supabase,
      context.userId,
      ["admin", "agent_vente"],
      "Forbidden: versements réservés à admin et agent_vente",
    );
    const sb = context.supabase as any;
    const cmd = await loadCommandeBase(sb, data.commande_id);
    if (cmd.status === "livree") {
      throw new Error(
        "Cette commande est livrée. Les versements ne sont plus acceptés ici — utilisez la fiche client ou la page Dettes."
      );
    }
    const sumOthers = await sumOtherVersements(sb, data.commande_id);
    const reste = Math.max(
      0,
      Number(cmd.montant) - Number(cmd.avance) - sumOthers,
    );
    if (data.amount > reste + 0.001) {
      throw new Error(
        `Le versement ne peut pas dépasser le reste dû (${reste.toFixed(2)})`,
      );
    }
    const caisseId = await getOpenCaisseId(sb);
    const createdAt = data.date
      ? new Date(
          data.date.length === 10 ? `${data.date}T${new Date().toTimeString().slice(0, 8)}` : data.date,
        ).toISOString()
      : new Date().toISOString();

    const { data: created, error } = await sb
      .from("versements")
      .insert({
        commande_id: data.commande_id,
        client_id: cmd.client_id,
        caisse_id: caisseId,
        amount: data.amount,
        note: data.note ?? null,
        created_by: context.userId,
        created_at: createdAt,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await sb.from("transactions").insert({
      caisse_id: caisseId,
      type: "entree",
      amount: data.amount,
      description: `Versement commande ${cmd.numero_commande ?? cmd.id} — ${cmd.clients?.nom_complet ?? "Client"}`,
      created_by: context.userId,
      is_manual: false,
    });

    return created;
  });

export const updateCommandeVersement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        amount: z.number().positive().max(99999999),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/)
          .optional()
          .nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.supabase,
      context.userId,
      ["admin", "agent_vente"],
      "Forbidden: versements réservés à admin et agent_vente",
    );
    const sb = context.supabase as any;
    const { data: existing, error: exErr } = await sb
      .from("versements")
      .select("id, commande_id, amount, caisse_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing || !existing.commande_id)
      throw new Error("Versement introuvable");

    const currentCaisseId = await getOpenCaisseId(sb);
    if (existing.caisse_id && existing.caisse_id !== currentCaisseId) {
      throw new Error(
        "Ce versement ne peut être modifié que dans la caisse où il a été créé.",
      );
    }

    const cmd = await loadCommandeBase(sb, existing.commande_id);
    const sumOthers = await sumOtherVersements(sb, existing.commande_id, data.id);
    const resteAvail = Math.max(
      0,
      Number(cmd.montant) - Number(cmd.avance) - sumOthers,
    );
    if (data.amount > resteAvail + 0.001) {
      throw new Error(
        `Le versement ne peut pas dépasser le reste dû (${resteAvail.toFixed(2)})`,
      );
    }

    const newCreatedAt = data.date
      ? new Date(
          data.date.length === 10
            ? `${data.date}T${new Date(existing.created_at).toTimeString().slice(0, 8)}`
            : data.date,
        ).toISOString()
      : existing.created_at;

    const { data: updated, error } = await sb
      .from("versements")
      .update({
        amount: data.amount,
        note: data.note ?? null,
        created_at: newCreatedAt,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const diff = Number(data.amount) - Number(existing.amount);
    if (Math.abs(diff) > 0.001) {
      const caisseId = await getOpenCaisseId(sb);
      await sb.from("transactions").insert({
        caisse_id: caisseId,
        type: diff > 0 ? "entree" : "sortie",
        amount: Math.abs(diff),
        description: `Ajustement versement commande ${cmd.numero_commande ?? cmd.id}`,
        created_by: context.userId,
        is_manual: false,
      });
    }

    return updated;
  });

export const deleteCommandeVersement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.supabase,
      context.userId,
      ["admin", "agent_vente"],
      "Forbidden: versements réservés à admin et agent_vente",
    );
    const sb = context.supabase as any;
    const { data: existing, error: exErr } = await sb
      .from("versements")
      .select("id, commande_id, amount, caisse_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing || !existing.commande_id)
      throw new Error("Versement introuvable");

    const cmd = await loadCommandeBase(sb, existing.commande_id);
    const caisseId = await getOpenCaisseId(sb);
    if (existing.caisse_id && existing.caisse_id !== caisseId) {
      throw new Error(
        "Ce versement ne peut être supprimé que dans la caisse où il a été créé.",
      );
    }

    const { error: delErr } = await sb
      .from("versements")
      .delete()
      .eq("id", data.id);
    if (delErr) throw new Error(delErr.message);

    if (Number(existing.amount) > 0) {
      await sb.from("transactions").insert({
        caisse_id: caisseId,
        type: "sortie",
        amount: Number(existing.amount),
        description: `Annulation versement commande ${cmd.numero_commande ?? cmd.id}`,
        created_by: context.userId,
        is_manual: false,
      });
    }
    return { ok: true };
  });
export const updateCommandePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        montant: z.number().min(0).max(99999999),
        avance: z.number().min(0).max(99999999),
      })
      .refine((d) => d.avance <= d.montant, {
        message: "L'avance ne peut pas être supérieure au montant total",
        path: ["avance"],
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.supabase,
      context.userId,
      ["admin", "agent_vente"],
      "Forbidden: modification réservée à admin et agent_vente",
    );

    const sb = context.supabase as any;
    const { data: cmd, error: cErr } = await sb
      .from("commandes")
      .select("id, status, montant, avance, caisse_id, numero_commande, client_id, clients(nom_complet)")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cmd) throw new Error("Commande introuvable");
    if (cmd.status === "livree") {
      throw new Error("Impossible de modifier le paiement d'une commande livrée");
    }

    const oldMontant = Number(cmd.montant);
    const oldAvance = Number(cmd.avance);
    const newMontant = Number(data.montant);
    const newAvance = Number(data.avance);

    const montantChanged = Math.abs(oldMontant - newMontant) > 0.005;
    const avanceChanged = Math.abs(oldAvance - newAvance) > 0.005;
    if (!montantChanged && !avanceChanged) return { ok: true };

    // Sum of existing versements (must remain valid against new montant)
    const { data: versRows } = await sb
      .from("versements")
      .select("amount")
      .eq("commande_id", data.id);
    const sumVers = (versRows ?? []).reduce((s: number, v: any) => s + Number(v.amount), 0);

    if (newAvance + sumVers > newMontant + 0.005) {
      throw new Error(
        `Le montant total (${newMontant.toFixed(2)}) doit couvrir l'avance et les versements déjà encaissés (${(newAvance + sumVers).toFixed(2)}).`,
      );
    }

    // If avance changes, must be done in the caisse where the commande was created
    if (avanceChanged) {
      const openCaisseId = await getOpenCaisseId(sb);
      if (cmd.caisse_id !== openCaisseId) {
        throw new Error(
          "L'avance ne peut être modifiée que dans la caisse où la commande a été créée.",
        );
      }
    }

    const { error: upErr } = await sb
      .from("commandes")
      .update({ montant: newMontant, avance: newAvance })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    // Cash transaction for avance delta
    if (avanceChanged) {
      const delta = newAvance - oldAvance;
      if (Math.abs(delta) > 0.005) {
        await sb.from("transactions").insert({
          caisse_id: cmd.caisse_id,
          type: delta > 0 ? "entree" : "sortie",
          amount: Math.abs(delta),
          description: `Modification avance commande ${cmd.numero_commande ?? cmd.id} — ${cmd.clients?.nom_complet ?? "Client"} (${oldAvance.toFixed(2)} → ${newAvance.toFixed(2)})`,
          created_by: context.userId,
          is_manual: false,
        });
      }
    }

    // History entries
    if (montantChanged) {
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: `${oldMontant.toFixed(2)} → ${newMontant.toFixed(2)}`,
        new_status: "paiement_montant_modifie",
        changed_by: context.userId,
      });
    }
    if (avanceChanged) {
      await sb.from("order_history").insert({
        commande_id: data.id,
        old_status: `${oldAvance.toFixed(2)} → ${newAvance.toFixed(2)}`,
        new_status: "paiement_avance_modifie",
        changed_by: context.userId,
      });
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Update commande infos (type, livraison, fournisseur, monture, verres,
// corrections, mesures progressif) — un seul historique avec détails.
// ─────────────────────────────────────────────────────────────────────────────

const updateInfosInput = z.object({
  id: z.string().uuid(),
  type: z.enum(COMMANDE_TYPES),
  date_livraison: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  fournisseur_id: z.string().uuid().nullable(),
  monture_source: z.enum(["boutique", "donnee"]).nullable(),
  monture_marque: z.string().trim().max(255).nullable(),
  monture_client_provided: z.boolean().nullable(),
  type_verres: z.string().trim().max(255).nullable(),
  lentilles: z.string().trim().max(255).nullable(),
  lentille_type: z.enum(["origine", "spherique"]).nullable(),
  od_sphere: z.number().nullable(),
  od_cylinder: z.number().nullable(),
  od_axe: z.number().int().min(0).max(180).nullable(),
  od_addition: z.number().nullable(),
  og_sphere: z.number().nullable(),
  og_cylinder: z.number().nullable(),
  og_axe: z.number().int().min(0).max(180).nullable(),
  og_addition: z.number().nullable(),
  progressive: z
    .object({
      ecart_pupillaire_od: z.number().nullable(),
      ecart_pupillaire_og: z.number().nullable(),
      hauteur_pupillaire_od: z.number().nullable(),
      hauteur_pupillaire_og: z.number().nullable(),
      grand_diametre: z.number().nullable(),
      hauteur_calibre: z.number().nullable(),
      pont: z.number().nullable(),
    })
    .nullable(),
});

export const updateCommandeInfos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateInfosInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "agent_vente"]);

    // Date livraison ne peut pas être antérieure à aujourd'hui
    if (data.date_livraison) {
      const today = new Date().toISOString().slice(0, 10);
      if (data.date_livraison < today) {
        throw new Error("La date de livraison ne peut pas être antérieure à aujourd'hui");
      }
    }

    const sb = context.supabase as any;
    const { data: current, error: getErr } = await sb
      .from("commandes")
      .select("*, fournisseurs(id, nom)")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!current) throw new Error("Commande introuvable");

    const TYPE_LBL: Record<string, string> = {
      vision_loin: "Vision de loin",
      vision_pres: "Vision de près",
      double_foyer: "Double foyer",
      progressif: "Progressif",
      lentilles: "Lentilles",
    };

    const fmtSigned = (n: number | null | undefined) => {
      if (n === null || n === undefined) return "—";
      const v = Number(n);
      if (!Number.isFinite(v)) return "—";
      return (v >= 0 ? "+" : "") + v.toFixed(2);
    };
    const fmtAxe = (n: number | null | undefined) =>
      n === null || n === undefined ? "—" : `${Math.round(Number(n))}°`;
    const fmtMontureSrc = (s: string | null, m: string | null, p: boolean | null) => {
      if (s === "boutique") return `Boutique${m ? ` — ${m}` : ""}`;
      if (s === "donnee") return `Client (${p ? "Fournie" : "Non fournie"})`;
      return "—";
    };

    const changes: string[] = [];
    const push = (label: string, oldV: string, newV: string) => {
      if (oldV !== newV) changes.push(`${label}: ${oldV} → ${newV}`);
    };

    push("Type", TYPE_LBL[current.type] ?? current.type ?? "—", TYPE_LBL[data.type] ?? data.type);
    push(
      "Date de livraison",
      current.date_livraison ?? "—",
      data.date_livraison ?? "—",
    );

    // Fournisseur — récupérer le nom du nouveau si modifié
    let newFournName: string | null = null;
    if (data.fournisseur_id && data.fournisseur_id !== current.fournisseur_id) {
      const { data: f } = await sb
        .from("fournisseurs")
        .select("nom")
        .eq("id", data.fournisseur_id)
        .maybeSingle();
      newFournName = f?.nom ?? null;
    } else if (data.fournisseur_id === current.fournisseur_id) {
      newFournName = current.fournisseurs?.nom ?? null;
    }
    push(
      "Fournisseur",
      current.fournisseurs?.nom ?? "—",
      data.fournisseur_id ? newFournName ?? "—" : "—",
    );

    push(
      "Monture",
      fmtMontureSrc(current.monture_source, current.monture_marque, current.monture_client_provided),
      data.type === "lentilles"
        ? "—"
        : fmtMontureSrc(data.monture_source, data.monture_marque, data.monture_client_provided),
    );
    push(
      "Type de verre",
      current.type_verres ?? "—",
      data.type === "lentilles" ? "—" : data.type_verres ?? "—",
    );
    if (data.type === "lentilles" || current.type === "lentilles") {
      push("Lentilles", current.lentilles ?? "—", data.type === "lentilles" ? data.lentilles ?? "—" : "—");
      push(
        "Type lentille",
        current.lentille_type ?? "—",
        data.type === "lentilles" ? data.lentille_type ?? "—" : "—",
      );
    }

    // Corrections OD/OG
    const eyes = (current.eyes_ordered ?? "both") as "both" | "od" | "og";
    if (eyes !== "og") {
      push("OD sphère", fmtSigned(current.od_sphere), fmtSigned(data.od_sphere));
      push("OD cylindre", fmtSigned(current.od_cylinder), fmtSigned(data.od_cylinder));
      push("OD axe", fmtAxe(current.od_axe), fmtAxe(data.od_axe));
      push("OD addition", fmtSigned(current.od_addition), fmtSigned(data.od_addition));
    }
    if (eyes !== "od") {
      push("OG sphère", fmtSigned(current.og_sphere), fmtSigned(data.og_sphere));
      push("OG cylindre", fmtSigned(current.og_cylinder), fmtSigned(data.og_cylinder));
      push("OG axe", fmtAxe(current.og_axe), fmtAxe(data.og_axe));
      push("OG addition", fmtSigned(current.og_addition), fmtSigned(data.og_addition));
    }

    // Update commande
    const updatePayload: Record<string, unknown> = {
      type: data.type,
      date_livraison: data.date_livraison,
      fournisseur_id: data.fournisseur_id,
      monture_source: data.type === "lentilles" ? null : data.monture_source,
      monture_marque:
        data.type !== "lentilles" && data.monture_source === "boutique" ? data.monture_marque : null,
      monture_client_provided:
        data.type !== "lentilles" && data.monture_source === "donnee"
          ? data.monture_client_provided ?? false
          : null,
      type_verres: data.type === "lentilles" ? null : data.type_verres,
      lentilles: data.type === "lentilles" ? data.lentilles : null,
      lentille_type: data.type === "lentilles" ? data.lentille_type ?? "origine" : null,
      od_sphere: data.od_sphere,
      od_cylinder: data.od_cylinder,
      od_axe: data.od_axe,
      od_addition: data.od_addition,
      og_sphere: data.og_sphere,
      og_cylinder: data.og_cylinder,
      og_axe: data.og_axe,
      og_addition: data.og_addition,
    };

    const tryUpdate = async (payload: Record<string, unknown>) => {
      const { error } = await sb.from("commandes").update(payload).eq("id", data.id);
      return error;
    };
    let updErr = await tryUpdate(updatePayload);
    if (updErr && String(updErr.message ?? "").includes("lentille_type")) {
      const { lentille_type, ...rest } = updatePayload;
      updErr = await tryUpdate(rest);
    }
    if (updErr) throw new Error(updErr.message);

    // Progressive measurements
    if (data.type === "progressif" && data.progressive) {
      const { data: existing } = await sb
        .from("progressive_measurements")
        .select("*")
        .eq("commande_id", data.id)
        .maybeSingle();
      const progFields: Array<[string, string]> = [
        ["ecart_pupillaire_od", "EP OD"],
        ["ecart_pupillaire_og", "EP OG"],
        ["hauteur_pupillaire_od", "HP OD"],
        ["hauteur_pupillaire_og", "HP OG"],
        ["grand_diametre", "Grand diamètre"],
        ["hauteur_calibre", "Hauteur calibre"],
        ["pont", "Pont"],
      ];
      for (const [key, label] of progFields) {
        const ov = existing?.[key] ?? null;
        const nv = (data.progressive as any)[key] ?? null;
        const fmt = (v: any) => (v === null || v === undefined ? "—" : String(v));
        if (fmt(ov) !== fmt(nv)) changes.push(`${label}: ${fmt(ov)} → ${fmt(nv)}`);
      }
      if (existing) {
        await sb
          .from("progressive_measurements")
          .update(data.progressive)
          .eq("commande_id", data.id);
      } else {
        await sb
          .from("progressive_measurements")
          .insert({ commande_id: data.id, ...data.progressive });
      }
    }

    if (changes.length === 0) {
      return { ok: true, changed: 0 };
    }

    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: changes.join("\n"),
      new_status: "infos_modifiees",
      changed_by: context.userId,
    });

    return { ok: true, changed: changes.length };
  });

// =====================================================================
// Suppression logique d'une commande (statut "commande_creee" uniquement)
// =====================================================================

export const deleteCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
    ]);
    const sb = context.supabase as any;

    const { data: cmd, error: cErr } = await sb
      .from("commandes")
      .select(
        "id, numero_commande, status, avance, caisse_id, deleted_at, clients(nom_complet)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cmd) throw new Error("Commande introuvable");
    if (cmd.deleted_at) throw new Error("Commande déjà supprimée");
    if (cmd.status !== "commande_creee")
      throw new Error(
        "Seules les commandes au statut « Commande créée » peuvent être supprimées.",
      );

    const { data: openCaisse } = await sb
      .from("caisses")
      .select("id")
      .eq("status", "open")
      .maybeSingle();

    const sameCaisse = openCaisse && openCaisse.id === cmd.caisse_id;
    const avance = Number(cmd.avance ?? 0);
    const avanceRefund = sameCaisse ? avance : 0;

    // Total des versements encaissés sur la caisse courante ouverte
    let versementsRefund = 0;
    if (openCaisse) {
      const { data: vers, error: vErr } = await sb
        .from("versements")
        .select("amount")
        .eq("commande_id", data.id)
        .eq("caisse_id", openCaisse.id);
      if (vErr) throw new Error(vErr.message);
      versementsRefund = (vers ?? []).reduce(
        (sum: number, v: any) => sum + Number(v.amount ?? 0),
        0,
      );
    }
    const refundTotal = avanceRefund + versementsRefund;

    let chargeId: string | null = null;
    let chargeAmount = 0;

    if (openCaisse && refundTotal > 0) {
      const clientNom = cmd.clients?.nom_complet ?? "client";
      const parts: string[] = [];
      if (avanceRefund > 0) parts.push(`avance ${avanceRefund.toFixed(2)}`);
      if (versementsRefund > 0)
        parts.push(`versements ${versementsRefund.toFixed(2)}`);
      const desc = `Remboursement commande supprimée ${cmd.numero_commande ?? ""} — ${clientNom} — ${parts.join(" + ")} — Motif: ${data.reason}`;
      const { data: tx, error: txErr } = await sb
        .from("transactions")
        .insert({
          caisse_id: openCaisse.id,
          type: "sortie",
          amount: refundTotal,
          description: desc,
          created_by: context.userId,
          is_manual: false,
        })
        .select("id")
        .single();
      if (txErr) throw new Error(txErr.message);
      chargeId = tx?.id ?? null;
      chargeAmount = refundTotal;
    }

    const nowIso = new Date().toISOString();
    const { error: uErr } = await sb
      .from("commandes")
      .update({
        deleted_at: nowIso,
        deleted_by: context.userId,
        deletion_reason: data.reason,
        deletion_caisse_id: cmd.caisse_id,
        status_before_delete: cmd.status,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("commande_history").insert({
      commande_id: data.id,
      action: "deleted",
      reason: data.reason,
      from_status: cmd.status,
      to_status: null,
      caisse_id: cmd.caisse_id,
      charge_id: chargeId,
      amount: chargeAmount,
      actor_id: context.userId,
    });

    // Trace dans order_history pour la fiche commande
    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: data.reason,
      new_status: "commande_supprimee",
      changed_by: context.userId,
    });

    // Notification admin (UI restreint l'affichage aux admins)
    {
      const agentName = await getAgentName(sb, context.userId);
      await insertNotification(sb, {
        commande_id: data.id,
        type: "commande_supprimee",
        numero_commande: cmd.numero_commande ?? null,
        label: `Commande supprimée — Motif: ${data.reason}`,
        agent_name: agentName,
        user_id: context.userId,
      });
    }

    return { ok: true, refunded: chargeAmount, sameCaisse: Boolean(sameCaisse) };
  });

export const restoreCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, [
      "admin",
      "agent_vente",
    ]);
    const sb = context.supabase as any;

    const { data: cmd, error: cErr } = await sb
      .from("commandes")
      .select(
        "id, numero_commande, status, avance, caisse_id, deleted_at, deletion_caisse_id, status_before_delete, clients(nom_complet)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cmd) throw new Error("Commande introuvable");
    if (!cmd.deleted_at) throw new Error("Cette commande n'est pas supprimée");

    const { data: openCaisse } = await sb
      .from("caisses")
      .select("id")
      .eq("status", "open")
      .maybeSingle();
    if (!openCaisse || openCaisse.id !== cmd.deletion_caisse_id) {
      throw new Error(
        "Le rétablissement n'est possible que depuis la caisse d'origine, ouverte.",
      );
    }

    // Symétrique de deleteCommande : on recrédite l'avance et les versements
    // qui ont été effectués dans cette caisse.
    const avance = Number(cmd.avance ?? 0);
    const avanceCredit = openCaisse.id === cmd.caisse_id ? avance : 0;

    const { data: vers, error: vErr } = await sb
      .from("versements")
      .select("amount")
      .eq("commande_id", data.id)
      .eq("caisse_id", openCaisse.id);
    if (vErr) throw new Error(vErr.message);
    const versementsCredit = (vers ?? []).reduce(
      (sum: number, v: any) => sum + Number(v.amount ?? 0),
      0,
    );
    const creditTotal = avanceCredit + versementsCredit;

    let chargeId: string | null = null;
    if (creditTotal > 0) {
      const clientNom = (cmd as any).clients?.nom_complet ?? "client";
      const parts: string[] = [];
      if (avanceCredit > 0) parts.push(`avance ${avanceCredit.toFixed(2)}`);
      if (versementsCredit > 0)
        parts.push(`versements ${versementsCredit.toFixed(2)}`);
      const desc = `Rétablissement commande ${cmd.numero_commande ?? ""} — ${clientNom} — ${parts.join(" + ")}`;
      const { data: tx, error: txErr } = await sb
        .from("transactions")
        .insert({
          caisse_id: openCaisse.id,
          type: "entree",
          amount: creditTotal,
          description: desc,
          created_by: context.userId,
          is_manual: false,
        })
        .select("id")
        .single();
      if (txErr) throw new Error(txErr.message);
      chargeId = tx?.id ?? null;
    }

    const targetStatus =
      (cmd.status_before_delete as CommandeStatus) ?? "commande_creee";

    const { error: uErr } = await sb
      .from("commandes")
      .update({
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
        deletion_caisse_id: null,
        status_before_delete: null,
        status: targetStatus,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("commande_history").insert({
      commande_id: data.id,
      action: "restored",
      reason: null,
      from_status: "deleted",
      to_status: targetStatus,
      caisse_id: openCaisse.id,
      charge_id: chargeId,
      amount: creditTotal,
      actor_id: context.userId,
    });

    // Trace dans order_history pour la fiche commande
    await sb.from("order_history").insert({
      commande_id: data.id,
      old_status: null,
      new_status: "commande_retablie",
      changed_by: context.userId,
    });

    return { ok: true, status: targetStatus, credited: creditTotal };
  });
