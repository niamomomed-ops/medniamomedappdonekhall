import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_READ = ["admin", "agent_vente", "agent_montage"] as const;
const ALLOWED_WRITE = ["admin", "agent_vente"] as const;

async function assertRoles(
  supabase: any,
  userId: string,
  allowed: readonly string[],
  msg = "Forbidden",
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => allowed.includes(r))) throw new Error(msg);
}

/**
 * Architecture dette (Prompt 60) :
 *
 *  Dette brute(client) = Σ pour chaque commande livrée :
 *      max(0, montant − avance − Σ versements.amount WHERE commande_id = c.id)
 *
 *  Dette nette(client) = max(0, Dette brute − Σ client_versements.amount)
 *
 * - `versements` (avec commande_id) = paiements PRÉ-livraison, visibles
 *    uniquement dans la fiche commande.
 * - `client_versements` (client_id seul) = remboursements POST-livraison,
 *    visibles uniquement dans la fiche client.
 */

export type ClientVersement = {
  id: string;
  amount: number;
  created_at: string;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
};

export type ClientDebtRow = {
  client_id: string;
  client_nom: string;
  total_restes_livrees: number;
  total_versements: number;
  dette: number;
};

export type ClientDebtCommande = {
  id: string;
  numero_commande: string | null;
  created_at: string;
  montant: number;
  avance: number;
  reste: number;
};

export type ClientDebtDetail = {
  client_id: string;
  total_restes_livrees: number;
  total_versements: number;
  dette: number;
  commandes_livrees: ClientDebtCommande[];
  versements: ClientVersement[];
};

async function resolveAgents(sb: any, userIds: string[]) {
  const map: Record<string, { name: string; role: string }> = {};
  if (userIds.length === 0) return map;
  const { data: pers } = await sb
    .from("personnel")
    .select("id, name, role")
    .in("id", userIds);
  for (const p of pers ?? []) map[p.id] = { name: p.name, role: p.role };
  return map;
}

/** Calcule la dette brute (restes commandes livrées) d'un client. */
async function computeBrutDebt(sb: any, clientId: string) {
  const { data: cmds, error: cErr } = await sb
    .from("commandes")
    .select("id, numero_commande, created_at, montant, avance")
    .eq("client_id", clientId)
    .eq("status", "livree")
    .order("created_at", { ascending: false });
  if (cErr) throw new Error(cErr.message);

  const list = (cmds ?? []) as any[];
  const ids = list.map((c) => c.id);

  const versByCmd: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: vs, error: vErr } = await sb
      .from("versements")
      .select("commande_id, amount")
      .in("commande_id", ids);
    if (vErr) throw new Error(vErr.message);
    for (const v of vs ?? []) {
      versByCmd[v.commande_id] =
        (versByCmd[v.commande_id] ?? 0) + Number(v.amount);
    }
  }

  const commandes: ClientDebtCommande[] = list
    .map((c) => {
      const reste = Math.max(
        0,
        Number(c.montant) - Number(c.avance) - (versByCmd[c.id] ?? 0),
      );
      return {
        id: c.id,
        numero_commande: c.numero_commande,
        created_at: c.created_at,
        montant: Number(c.montant),
        avance: Number(c.avance),
        reste,
      };
    })
    .filter((c) => c.reste > 0);

  const total = commandes.reduce((s, c) => s + c.reste, 0);
  return { commandes, total };
}

/** Dette globale détaillée pour un client. */
export const getClientDebt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ client_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ClientDebtDetail> => {
    await assertRoles(context.supabase, context.userId, ALLOWED_READ);
    const sb = context.supabase as any;

    const { commandes: commandes_livrees, total: total_restes_livrees } =
      await computeBrutDebt(sb, data.client_id);

    const { data: vs, error: vErr } = await sb
      .from("client_versements")
      .select("id, amount, created_at, note, created_by")
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false });
    if (vErr) throw new Error(vErr.message);

    const userIds = Array.from(
      new Set((vs ?? []).map((v: any) => v.created_by).filter(Boolean)),
    ) as string[];
    const agents = await resolveAgents(sb, userIds);

    const versements: ClientVersement[] = (vs ?? []).map((v: any) => ({
      id: v.id,
      amount: Number(v.amount),
      created_at: v.created_at,
      note: v.note,
      created_by: v.created_by,
      created_by_name: v.created_by ? agents[v.created_by]?.name ?? null : null,
      created_by_role: v.created_by ? agents[v.created_by]?.role ?? null : null,
    }));

    const total_versements = versements.reduce((s, v) => s + v.amount, 0);
    const dette = Math.max(0, total_restes_livrees - total_versements);

    return {
      client_id: data.client_id,
      total_restes_livrees,
      total_versements,
      dette,
      commandes_livrees,
      versements,
    };
  });

/** Liste de tous les clients avec leur dette globale (dette > 0). */
export const listAllClientsDebt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientDebtRow[]> => {
    await assertRoles(context.supabase, context.userId, ALLOWED_READ);
    const sb = context.supabase as any;

    const { data: cmds, error: cErr } = await sb
      .from("commandes")
      .select("id, client_id, montant, avance, clients(nom_complet)")
      .eq("status", "livree");
    if (cErr) throw new Error(cErr.message);

    const cmdList = (cmds ?? []) as any[];
    const cmdIds = cmdList.map((c) => c.id);

    const versByCmd: Record<string, number> = {};
    if (cmdIds.length > 0) {
      const { data: vs, error: vErr } = await sb
        .from("versements")
        .select("commande_id, amount")
        .in("commande_id", cmdIds);
      if (vErr) throw new Error(vErr.message);
      for (const v of vs ?? []) {
        versByCmd[v.commande_id] =
          (versByCmd[v.commande_id] ?? 0) + Number(v.amount);
      }
    }

    const restesByClient: Record<string, number> = {};
    const nomByClient: Record<string, string> = {};
    for (const c of cmdList) {
      const reste = Math.max(
        0,
        Number(c.montant) - Number(c.avance) - (versByCmd[c.id] ?? 0),
      );
      if (reste > 0) {
        restesByClient[c.client_id] =
          (restesByClient[c.client_id] ?? 0) + reste;
        nomByClient[c.client_id] = c.clients?.nom_complet ?? "—";
      }
    }

    const { data: cvs, error: cvErr } = await sb
      .from("client_versements")
      .select("client_id, amount");
    if (cvErr) throw new Error(cvErr.message);

    const versByClient: Record<string, number> = {};
    for (const v of cvs ?? []) {
      versByClient[v.client_id] =
        (versByClient[v.client_id] ?? 0) + Number(v.amount);
    }

    const missing = Object.keys(restesByClient).filter((id) => !nomByClient[id]);
    if (missing.length > 0) {
      const { data: cs } = await sb
        .from("clients")
        .select("id, nom_complet")
        .in("id", missing);
      for (const c of cs ?? []) nomByClient[c.id] = c.nom_complet;
    }

    const rows: ClientDebtRow[] = [];
    for (const client_id of Object.keys(restesByClient)) {
      const total_restes_livrees = restesByClient[client_id] ?? 0;
      const total_versements = versByClient[client_id] ?? 0;
      const dette = Math.max(0, total_restes_livrees - total_versements);
      if (dette > 0) {
        rows.push({
          client_id,
          client_nom: nomByClient[client_id] ?? "—",
          total_restes_livrees,
          total_versements,
          dette,
        });
      }
    }
    rows.sort((a, b) => b.dette - a.dette);
    return rows;
  });

/** Map { client_id: dette nette } pour les listings. */
export const listClientDebtsMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, number>> => {
    await assertRoles(context.supabase, context.userId, ALLOWED_READ);
    const sb = context.supabase as any;

    const { data: cmds, error: cErr } = await sb
      .from("commandes")
      .select("id, client_id, montant, avance")
      .eq("status", "livree");
    if (cErr) throw new Error(cErr.message);

    const cmdList = (cmds ?? []) as any[];
    const cmdIds = cmdList.map((c) => c.id);

    const versByCmd: Record<string, number> = {};
    if (cmdIds.length > 0) {
      const { data: vs } = await sb
        .from("versements")
        .select("commande_id, amount")
        .in("commande_id", cmdIds);
      for (const v of vs ?? []) {
        versByCmd[v.commande_id] =
          (versByCmd[v.commande_id] ?? 0) + Number(v.amount);
      }
    }

    const restes: Record<string, number> = {};
    for (const c of cmdList) {
      const r = Math.max(
        0,
        Number(c.montant) - Number(c.avance) - (versByCmd[c.id] ?? 0),
      );
      if (r > 0) restes[c.client_id] = (restes[c.client_id] ?? 0) + r;
    }

    const { data: cvs, error: vErr } = await sb
      .from("client_versements")
      .select("client_id, amount");
    if (vErr) throw new Error(vErr.message);
    const vers: Record<string, number> = {};
    for (const v of cvs ?? []) {
      vers[v.client_id] = (vers[v.client_id] ?? 0) + Number(v.amount);
    }

    const out: Record<string, number> = {};
    for (const client_id of Object.keys(restes)) {
      const d = Math.max(0, restes[client_id] - (vers[client_id] ?? 0));
      if (d > 0) out[client_id] = d;
    }
    return out;
  });

/** Enregistre un remboursement de dette global pour un client. */
export const createClientVersement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        client_id: z.string().uuid(),
        amount: z.number().positive().max(99999999),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(
      context.supabase,
      context.userId,
      ALLOWED_WRITE,
      "Forbidden: versements réservés à admin et agent_vente",
    );
    const sb = context.supabase as any;

    const { data: openCaisse, error: cErr } = await sb
      .from("caisses")
      .select("id")
      .eq("status", "open")
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!openCaisse) throw new Error("Aucune caisse ouverte");

    const { data: client, error: clErr } = await sb
      .from("clients")
      .select("id, nom_complet")
      .eq("id", data.client_id)
      .maybeSingle();
    if (clErr) throw new Error(clErr.message);
    if (!client) throw new Error("Client introuvable");

    // Recalcule dette actuelle (brute - remboursements)
    const { total: detteBrute } = await computeBrutDebt(sb, data.client_id);
    const { data: vs } = await sb
      .from("client_versements")
      .select("amount")
      .eq("client_id", data.client_id);
    const totalVers = (vs ?? []).reduce(
      (s: number, v: any) => s + Number(v.amount),
      0,
    );
    const detteActuelle = Math.max(0, detteBrute - totalVers);
    if (detteActuelle <= 0) throw new Error("Ce client n'a aucune dette");
    if (data.amount > detteActuelle + 0.001)
      throw new Error(
        `Le versement (${data.amount}) dépasse la dette (${detteActuelle.toFixed(2)})`,
      );

    const { data: vCreated, error: insErr } = await sb
      .from("client_versements")
      .insert({
        client_id: data.client_id,
        caisse_id: openCaisse.id,
        amount: data.amount,
        note: data.note ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    await sb.from("transactions").insert({
      caisse_id: openCaisse.id,
      type: "entree",
      amount: data.amount,
      description: `Remboursement dette client ${client.nom_complet}`,
      created_by: context.userId,
      is_manual: false,
    });

    return vCreated;
  });
