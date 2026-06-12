import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MutuelleStatut = "en_attente" | "remplie" | "livree";
export type MutuelleSource = "interne" | "externe" | "mixte";

export type DemandeMutuelleRow = {
  id: string;
  numero_demande: string;
  client_id: string;
  organisme: string | null;
  source_correction: MutuelleSource;
  statut: MutuelleStatut;
  created_by: string | null;
  created_at: string;
  remplie_at: string | null;
  remplie_by: string | null;
  livree?: boolean | null;
  livree_at?: string | null;
  beneficiaire_nom?: string | null;
  beneficiaire_date_naissance?: string | null;
  beneficiaire_organisme?: string | null;
  prix_monture?: number | null;
  prix_verre?: number | null;
  total_remboursement?: number | null;
  clients?: {
    nom_complet: string | null;
    mutuelle: string | null;
    mutuelle_autre: string | null;
    date_naissance?: string | null;
    telephone?: string | null;
    email?: string | null;
  } | null;
  demande_mutuelle_commandes?: Array<{
    commande_id: string;
    source_correction: "interne" | "externe";
    commandes?: {
      id: string;
      numero_commande: string | null;
      type: string;
      montant: number;
      monture_source?: string | null;
      created_at: string;
    } | null;
  }>;
};

const ALLOWED_READ = ["admin", "agent_vente", "agent_montage"] as const;
const ALLOWED_WRITE = ["admin", "agent_vente"] as const;

async function getRoles(sb: any, userId: string): Promise<string[]> {
  const { data, error } = await sb.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { role: string }) => r.role);
}

async function assertAccess(
  sb: any,
  userId: string,
  allowed: readonly string[],
  msg = "Forbidden",
) {
  const roles = await getRoles(sb, userId);
  if (!roles.some((r) => allowed.includes(r))) throw new Error(msg);
  return roles;
}

function clientOrganisme(c: {
  mutuelle?: string | null;
  mutuelle_autre?: string | null;
} | null | undefined): string | null {
  if (!c?.mutuelle) return null;
  if (c.mutuelle === "Autre") return c.mutuelle_autre?.trim() || "Autre";
  return c.mutuelle;
}

async function getAgentName(sb: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await sb.from("personnel").select("name").eq("id", userId).maybeSingle();
  return data?.name ?? null;
}

/** Liste des demandes mutuelles (filtrées par rôle). */
export const listDemandesMutuelles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_READ);
    const q = sb
      .from("demandes_mutuelles")
      .select(
        "id, numero_demande, client_id, organisme, source_correction, statut, created_by, created_at, remplie_at, remplie_by, livree, livree_at, beneficiaire_nom, beneficiaire_date_naissance, beneficiaire_organisme, prix_monture, prix_verre, total_remboursement, clients(nom_complet, mutuelle, mutuelle_autre, date_naissance), demande_mutuelle_commandes(commande_id, source_correction, commandes(id, numero_commande, type, montant, monture_source, created_at))",
      )
      .order("created_at", { ascending: false });
    // Le filtrage par rôle est géré par les RLS policies — même query pour admin et agent de vente.
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as DemandeMutuelleRow[];
  });

/** Compteur léger pour le badge nav Mutuelles (selon rôle). */
export const getMutuellesBadgeCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const roles = await getRoles(sb, context.userId);
    const isAdmin = roles.includes("admin");
    const isAgentVente = roles.includes("agent_vente");
    if (!isAdmin && !isAgentVente) return { count: 0 };
    const statut = isAdmin ? "en_attente" : "remplie";
    let q = sb
      .from("demandes_mutuelles")
      .select("id", { count: "exact", head: true })
      .eq("statut", statut);
    if (!isAdmin) q = q.eq("created_by", context.userId);
    const { count, error } = await q;
    if (error) return { count: 0 };
    return { count: count ?? 0 };
  });

export type MutuelleHistoryEntry = {
  id: string;
  event_type:
    | "created"
    | "statut_remplie"
    | "statut_en_attente"
    | "statut_livraison_livree"
    | "statut_livraison_pas_livree"
    | string;
  old_statut: MutuelleStatut | null;
  new_statut: MutuelleStatut | null;
  changed_by: string | null;
  changed_at: string;
  personnel: { name: string | null; email: string | null } | null;
};

/** Détail d'une demande (avec historique + créateur). */
export const getDemandeMutuelle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_READ);
    const { data: row, error } = await sb
      .from("demandes_mutuelles")
      .select(
        "id, numero_demande, client_id, organisme, source_correction, statut, created_by, created_at, remplie_at, remplie_by, livree, livree_at, beneficiaire_nom, beneficiaire_date_naissance, beneficiaire_organisme, prix_monture, prix_verre, total_remboursement, clients(nom_complet, mutuelle, mutuelle_autre, telephone, email, date_naissance), demande_mutuelle_commandes(commande_id, source_correction, commandes(id, numero_commande, type, montant, monture_source, created_at, status))",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Demande introuvable");

    // Historique (best-effort si la table n'existe pas encore).
    let history: MutuelleHistoryEntry[] = [];
    try {
      const { data: hRaw } = await sb
        .from("demande_mutuelle_history")
        .select("id, event_type, old_statut, new_statut, changed_by, changed_at")
        .eq("demande_id", data.id)
        .order("changed_at", { ascending: false });
      const ids = Array.from(
        new Set([
          ...(hRaw ?? []).map((h: any) => h.changed_by).filter(Boolean),
          row.created_by,
        ].filter(Boolean) as string[]),
      );
      let people: Record<string, { name: string | null; email: string | null }> = {};
      if (ids.length) {
        const { data: p } = await sb
          .from("personnel")
          .select("id, name, email")
          .in("id", ids);
        people = Object.fromEntries(
          (p ?? []).map((x: any) => [x.id, { name: x.name, email: x.email }]),
        );
      }
      history = (hRaw ?? []).map((h: any) => ({
        ...h,
        personnel: h.changed_by ? people[h.changed_by] ?? null : null,
      }));
      (row as any).created_by_personnel = row.created_by ? people[row.created_by] ?? null : null;
      (row as any).remplie_by_personnel = row.remplie_by ? people[row.remplie_by] ?? null : null;
    } catch {
      history = [];
    }
    (row as any).history = history;
    return row as DemandeMutuelleRow & {
      history: MutuelleHistoryEntry[];
      created_by_personnel?: { name: string | null; email: string | null } | null;
      remplie_by_personnel?: { name: string | null; email: string | null } | null;
    };
  });

/** Liste des demandes mutuelles d'un client (pour la fiche client). */
export const listDemandesMutuellesForClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ client_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_READ);
    const { data: rows, error } = await sb
      .from("demandes_mutuelles")
      .select(
        "id, numero_demande, organisme, source_correction, statut, created_at, remplie_at, livree, livree_at, beneficiaire_nom, beneficiaire_date_naissance, beneficiaire_organisme, prix_monture, prix_verre, total_remboursement, demande_mutuelle_commandes(commande_id, commandes(numero_commande, type, montant, monture_source))",
      )
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Création d'une demande mutuelle. */
export const createDemandeMutuelle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        client_id: z.string().uuid(),
        commande_ids: z.array(z.string().uuid()).min(1).max(50),
        beneficiaire: z
          .object({
            nom: z.string().trim().min(1).max(150),
            date_naissance: z.string().min(1),
            organisme: z.string().trim().min(1).max(100),
          })
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_WRITE, "Forbidden: agent_vente/admin requis");

    // Client + organisme
    const { data: client, error: errClient } = await sb
      .from("clients")
      .select("id, nom_complet, mutuelle, mutuelle_autre")
      .eq("id", data.client_id)
      .maybeSingle();
    if (errClient) throw new Error(errClient.message);
    if (!client) throw new Error("Client introuvable");
    const organisme = clientOrganisme(client);

    // Commandes + leur prescription pour déduire interne/externe
    const { data: cmds, error: errCmd } = await sb
      .from("commandes")
      .select("id, client_id, prescription_id, prescriptions(type)")
      .in("id", data.commande_ids);
    if (errCmd) throw new Error(errCmd.message);
    if (!cmds || cmds.length !== data.commande_ids.length) {
      throw new Error("Une ou plusieurs commandes introuvables");
    }
    for (const c of cmds) {
      if (c.client_id !== data.client_id) {
        throw new Error("Toutes les commandes doivent appartenir au client sélectionné");
      }
    }

    const perCmd = cmds.map((c: any) => ({
      commande_id: c.id as string,
      source_correction:
        (c.prescriptions?.type === "externe" ? "externe" : "interne") as "interne" | "externe",
    }));
    const sources = new Set(perCmd.map((c: { source_correction: string }) => c.source_correction));
    const source_correction: MutuelleSource =
      sources.size === 2 ? "mixte" : (perCmd[0].source_correction as MutuelleSource);

    const insertPayload: Record<string, any> = {
      client_id: data.client_id,
      organisme,
      source_correction,
      created_by: context.userId,
    };
    if (data.beneficiaire) {
      insertPayload.beneficiaire_nom = data.beneficiaire.nom;
      insertPayload.beneficiaire_date_naissance = data.beneficiaire.date_naissance;
      insertPayload.beneficiaire_organisme = data.beneficiaire.organisme;
    }

    const { data: created, error: errIns } = await sb
      .from("demandes_mutuelles")
      .insert(insertPayload)
      .select("id, numero_demande")
      .single();
    if (errIns) throw new Error(errIns.message);


    const links = perCmd.map((c: { commande_id: string; source_correction: string }) => ({
      demande_id: created.id,
      commande_id: c.commande_id,
      source_correction: c.source_correction,
    }));
    const { error: errLinks } = await sb.from("demande_mutuelle_commandes").insert(links);
    if (errLinks) throw new Error(errLinks.message);

    // Historique : création (best-effort).
    try {
      await sb.from("demande_mutuelle_history").insert({
        demande_id: created.id,
        event_type: "created",
        old_statut: null,
        new_statut: "en_attente",
        changed_by: context.userId,
      });
    } catch {
      // best-effort
    }

    // Notification → admin (sticky bar côté admin)
    try {
      await sb.from("notifications").insert({
        type: "mutuelle_demande",
        message: `[${created.numero_demande}] Nouvelle demande mutuelle — ${client.nom_complet ?? "Client"}`,
        created_by: context.userId,
        mutuelle_demande_id: created.id,
      });
    } catch {
      // best-effort
    }

    return { id: created.id, numero_demande: created.numero_demande };
  });

/** Marquer une demande comme remplie (admin). */
export const markDemandeRemplie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        prix_monture: z.number().min(0).max(1_000_000),
        prix_verre: z.number().min(0).max(1_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ["admin"] as const, "Forbidden: admin requis");

    const { data: cur, error: errCur } = await sb
      .from("demandes_mutuelles")
      .select("id, numero_demande, statut, created_by, client_id, clients(nom_complet)")
      .eq("id", data.id)
      .maybeSingle();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error("Demande introuvable");
    if (cur.statut === "remplie") return { ok: true, already: true };

    const { error: errUpd } = await sb
      .from("demandes_mutuelles")
      .update({
        statut: "remplie",
        remplie_at: new Date().toISOString(),
        remplie_by: context.userId,
        prix_monture: data.prix_monture,
        prix_verre: data.prix_verre,
      })
      .eq("id", data.id);
    if (errUpd) throw new Error(errUpd.message);

    try {
      await sb.from("demande_mutuelle_history").insert({
        demande_id: cur.id,
        event_type: "statut_remplie",
        old_statut: "en_attente",
        new_statut: "remplie",
        changed_by: context.userId,
      });
    } catch {
      // best-effort
    }

    // Acquitter automatiquement les notifications "mutuelle_demande" liées
    // pour l'admin qui marque comme remplie (fait disparaître le sticky bar).
    try {
      const { data: notifs } = await sb
        .from("notifications")
        .select("id")
        .eq("type", "mutuelle_demande")
        .eq("mutuelle_demande_id", cur.id);
      const rows = (notifs ?? []).map((n: { id: string }) => ({
        notification_id: n.id,
        user_id: context.userId,
      }));
      if (rows.length > 0) {
        await sb
          .from("notification_reads")
          .upsert(rows, { onConflict: "notification_id,user_id" });
      }
    } catch {
      // best-effort
    }

    // Notification → agent de vente créateur
    try {
      await sb.from("notifications").insert({
        type: "mutuelle_remplie",
        message: `[${cur.numero_demande}] Mutuelle prête à récupérer — ${cur.clients?.nom_complet ?? "Client"}`,
        created_by: context.userId,
        mutuelle_demande_id: cur.id,
        target_user_id: cur.created_by,
      });
    } catch {
      // best-effort
    }

    return { ok: true };
  });

/** Supprimer une demande mutuelle (admin ou créateur, uniquement si en_attente). */
export const deleteDemandeMutuelle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_WRITE, "Forbidden: admin/agent_vente requis");

    const { data: cur, error: errCur } = await sb
      .from("demandes_mutuelles")
      .select("id, statut, created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error("Demande introuvable");
    if (cur.statut !== "en_attente") throw new Error("Suppression impossible : la demande n'est plus en attente.");

    const roles = await getRoles(sb, context.userId);
    const isAdmin = roles.includes("admin");
    if (!isAdmin && cur.created_by !== context.userId) {
      throw new Error("Forbidden: seul l'administrateur ou le créateur peut supprimer cette demande.");
    }

    const { data: deleted, error: errDel } = await sb
      .from("demandes_mutuelles")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (errDel) throw new Error(errDel.message);
    if (!deleted || deleted.length === 0) {
      throw new Error(
        "Suppression bloquée par les permissions (RLS). Demandez à un administrateur d'exécuter le script SQL ajoutant la policy DELETE sur public.demandes_mutuelles.",
      );
    }

    return { ok: true };
  });


/** Remettre une demande en attente (admin, pour correction). */
export const unmarkDemandeRemplie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ["admin"] as const, "Forbidden: admin requis");

    const { data: cur, error: errCur } = await sb
      .from("demandes_mutuelles")
      .select("id, numero_demande, statut, created_by, clients(nom_complet)")
      .eq("id", data.id)
      .maybeSingle();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error("Demande introuvable");
    if (cur.statut === "en_attente") return { ok: true, already: true };

    const { error: errUpd } = await sb
      .from("demandes_mutuelles")
      .update({ statut: "en_attente", remplie_at: null, remplie_by: null })
      .eq("id", data.id);
    if (errUpd) throw new Error(errUpd.message);

    try {
      await sb.from("demande_mutuelle_history").insert({
        demande_id: cur.id,
        event_type: "statut_en_attente",
        old_statut: "remplie",
        new_statut: "en_attente",
        changed_by: context.userId,
      });
    } catch {
      // best-effort
    }

    try {
      await sb.from("notifications").insert({
        type: "mutuelle_demande",
        message: `[${cur.numero_demande}] Mutuelle remise en attente — ${cur.clients?.nom_complet ?? "Client"}`,
        created_by: context.userId,
        mutuelle_demande_id: cur.id,
        target_user_id: cur.created_by,
      });
    } catch {
      // best-effort
    }

    return { ok: true };
  });

/** Récupère la dernière demande mutuelle liée à une commande (pour la fiche livraison). */
export const getMutuelleForCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ commande_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_READ);
    const { data: rows, error } = await sb
      .from("demande_mutuelle_commandes")
      .select(
        "demande_id, demandes_mutuelles(id, numero_demande, organisme, statut, created_at, livree, livree_at)",
      )
      .eq("commande_id", data.commande_id);
    if (error) throw new Error(error.message);
    const demandes = (rows ?? [])
      .map((r: any) => r.demandes_mutuelles)
      .filter(Boolean) as Array<{
      id: string;
      numero_demande: string;
      organisme: string | null;
      statut: MutuelleStatut;
      created_at: string;
      livree: boolean | null;
      livree_at: string | null;
    }>;
    if (demandes.length === 0) return null;
    // Préférer une demande remplie, sinon la plus récente
    const remplie = demandes.find((d) => d.statut === "remplie");
    const pick =
      remplie ??
      demandes.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    return pick;
  });

/** Toggle du statut livraison d'une demande mutuelle (admin + agent_vente). */
export const setMutuelleLivraison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), livree: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_WRITE, "Forbidden: admin/agent_vente requis");

    const { data: cur, error: errCur } = await sb
      .from("demandes_mutuelles")
      .select("id, livree")
      .eq("id", data.id)
      .maybeSingle();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error("Demande introuvable");
    if (!!cur.livree === data.livree) return { ok: true, already: true };

    const { data: updRows, error: errUpd } = await sb
      .from("demandes_mutuelles")
      .update({
        livree: data.livree,
        livree_at: data.livree ? new Date().toISOString() : null,
        statut: data.livree ? "livree" : "remplie",
      })
      .eq("id", data.id)
      .select("id, livree, livree_at, statut");
    if (errUpd) throw new Error(errUpd.message);
    if (!updRows || updRows.length === 0) {
      throw new Error(
        "Mise à jour bloquée par RLS. Exécuter le SQL mutuelles_livraison_rls.sql dans l'éditeur Supabase.",
      );
    }

    try {
      await sb.from("demande_mutuelle_history").insert({
        demande_id: data.id,
        event_type: data.livree ? "statut_livraison_livree" : "statut_livraison_pas_livree",
        old_statut: null,
        new_statut: null,
        changed_by: context.userId,
      });
    } catch {
      // best-effort
    }
    return { ok: true };
  });

/** Mettre à jour le bénéficiaire d'une demande mutuelle existante (admin + agent_vente). */
export const updateDemandeBeneficiaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        beneficiaire: z
          .object({
            nom: z.string().trim().min(1).max(150),
            date_naissance: z.string().min(1),
            organisme: z.string().trim().min(1).max(100),
          })
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertAccess(sb, context.userId, ALLOWED_WRITE, "Forbidden: admin/agent_vente requis");

    const payload = data.beneficiaire
      ? {
          beneficiaire_nom: data.beneficiaire.nom,
          beneficiaire_date_naissance: data.beneficiaire.date_naissance,
          beneficiaire_organisme: data.beneficiaire.organisme,
        }
      : {
          beneficiaire_nom: null,
          beneficiaire_date_naissance: null,
          beneficiaire_organisme: null,
        };

    const { error } = await sb
      .from("demandes_mutuelles")
      .update(payload)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
