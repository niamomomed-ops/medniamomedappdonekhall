import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = ["admin", "agent_vente"] as const;

async function assertCaisseAccess(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => (ALLOWED_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: caisse access reserved to admin and agent_vente");
  }
}

export const listCaisses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCaisseAccess(context.supabase, context.userId);
    const { data: caisses, error } = await context.supabase
      .from("caisses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = caisses ?? [];
    if (list.length === 0) return [];

    const ids = list.map((c: any) => c.id);
    const [{ data: txs, error: tErr }, { data: cmds, error: kErr }] = await Promise.all([
      context.supabase.from("transactions").select("caisse_id, type, amount").in("caisse_id", ids),
      context.supabase.from("commandes").select("caisse_id, avance").in("caisse_id", ids),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (kErr) throw new Error(kErr.message);

    const byId: Record<string, { manualIn: number; charges: number; avances: number }> = {};
    for (const id of ids) byId[id] = { manualIn: 0, charges: 0, avances: 0 };
    for (const t of txs ?? []) {
      const b = byId[t.caisse_id];
      if (!b) continue;
      const amt = Number(t.amount ?? 0);
      if (t.type === "entree") b.manualIn += amt;
      else if (t.type === "sortie") b.charges += amt;
    }
    for (const c of cmds ?? []) {
      if (!c.caisse_id) continue;
      const b = byId[c.caisse_id];
      if (!b) continue;
      b.avances += Number(c.avance ?? 0);
    }

    return list.map((c: any) => {
      const b = byId[c.id] ?? { manualIn: 0, charges: 0, avances: 0 };
      const opening = Number(c.opening_balance ?? 0);
      const encaissements = b.avances + b.manualIn;
      const expected = opening + encaissements - b.charges;
      return {
        ...c,
        summary: {
          opening_balance: opening,
          encaissements,
          charges: b.charges,
          expected_balance: expected,
        },
      };
    });
  });

export const getCaisse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCaisseAccess(context.supabase, context.userId);
    const { data: caisse, error } = await context.supabase
      .from("caisses")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!caisse) throw new Error("Caisse introuvable");

    let openedByName: string | null = null;
    if (caisse.opened_by) {
      const { data: p } = await context.supabase
        .from("personnel")
        .select("name")
        .eq("id", caisse.opened_by)
        .maybeSingle();
      openedByName = p?.name ?? null;
    }
    return { ...caisse, opened_by_name: openedByName };
  });

export type JournalMovement = {
  id: string;
  occurred_at: string;
  kind: "ouverture" | "avance" | "entree" | "charge" | "fermeture" | "fermeture_auto";
  reference: string;
  client: string;
  amount: number;
  display_only?: boolean;
};

export const getCaisseJournal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCaisseAccess(context.supabase, context.userId);

    const { data: caisse, error } = await context.supabase
      .from("caisses")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!caisse) throw new Error("Caisse introuvable");

    let openedByName: string | null = null;
    if (caisse.opened_by) {
      const { data: p } = await context.supabase
        .from("personnel")
        .select("name")
        .eq("id", caisse.opened_by)
        .maybeSingle();
      openedByName = p?.name ?? null;
    }

    const [{ data: txs, error: tErr }, { data: cmds, error: kErr }] = await Promise.all([
      context.supabase
        .from("transactions")
        .select("id, created_at, type, amount, description")
        .eq("caisse_id", data.id),
      context.supabase
        .from("commandes")
        .select("id, created_at, numero_commande, avance, client_id")
        .eq("caisse_id", data.id),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (kErr) throw new Error(kErr.message);

    const clientIds = Array.from(
      new Set((cmds ?? []).map((c: any) => c.client_id).filter(Boolean)),
    );
    const clientsById: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: cls, error: clErr } = await context.supabase
        .from("clients")
        .select("id, nom_complet")
        .in("id", clientIds);
      if (clErr) throw new Error(clErr.message);
      for (const c of cls ?? []) clientsById[c.id] = c.nom_complet;
    }

    const opening = Number(caisse.opening_balance ?? 0);
    const movements: JournalMovement[] = [];

    if (caisse.opened_at) {
      movements.push({
        id: `opening-${caisse.id}`,
        occurred_at: caisse.opened_at,
        kind: "ouverture",
        reference: "Solde de démarrage",
        client: "—",
        amount: opening,
      });
    }

    for (const c of cmds ?? []) {
      const avance = Number(c.avance ?? 0);
      if (avance <= 0) continue;
      movements.push({
        id: `cmd-${c.id}`,
        occurred_at: c.created_at,
        kind: "avance",
        reference: c.numero_commande ?? "—",
        client: c.client_id ? clientsById[c.client_id] ?? "—" : "—",
        amount: avance,
      });
    }

    for (const t of txs ?? []) {
      const amt = Number(t.amount ?? 0);
      if (t.type === "entree") {
        movements.push({
          id: `tx-${t.id}`,
          occurred_at: t.created_at,
          kind: "entree",
          reference: t.description ?? "Entrée manuelle",
          client: "—",
          amount: amt,
        });
      } else if (t.type === "sortie") {
        movements.push({
          id: `tx-${t.id}`,
          occurred_at: t.created_at,
          kind: "charge",
          reference: t.description ?? "Charge",
          client: "—",
          amount: -amt,
        });
      }
    }

    if (caisse.status === "closed" && caisse.closed_at) {
      movements.push({
        id: `closing-${caisse.id}`,
        occurred_at: caisse.closed_at,
        kind: caisse.auto_closed ? "fermeture_auto" : "fermeture",
        reference: caisse.auto_closed
          ? "Fermeture automatique — aucun agent connecté"
          : "Solde final",
        client: caisse.auto_closed ? "Système" : "—",
        amount: Number(caisse.closing_balance ?? 0),
        display_only: true,
      });
    }

    movements.sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    );

    const encaissements = movements
      .filter((m) => m.kind === "avance" || m.kind === "entree")
      .reduce((s, m) => s + m.amount, 0);
    const charges = movements
      .filter((m) => m.kind === "charge")
      .reduce((s, m) => s + Math.abs(m.amount), 0);
    const expected = opening + encaissements - charges;
    const finalBal =
      caisse.closing_balance != null ? Number(caisse.closing_balance) : null;
    const ecart = finalBal != null ? finalBal - expected : null;

    return {
      caisse: { ...caisse, opened_by_name: openedByName },
      movements,
      summary: {
        opening_balance: opening,
        encaissements,
        charges,
        expected_balance: expected,
        final_balance: finalBal,
        ecart,
      },
    };
  });

export const openNewCaisse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        opening_balance: z.number().min(0).max(99999999),
        auto_close_at: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCaisseAccess(context.supabase, context.userId);

    // Block if any caisse is already open
    const { data: openOnes, error: checkErr } = await context.supabase
      .from("caisses")
      .select("id")
      .eq("status", "open");
    if (checkErr) throw new Error(checkErr.message);
    if ((openOnes ?? []).length > 0) {
      throw new Error("Une caisse est déjà ouverte. Fermez-la avant d'en ouvrir une autre.");
    }

    const { data: created, error } = await context.supabase
      .from("caisses")
      .insert({
        label: `Caisse ${new Date().toLocaleString("fr-FR")}`,
        opening_balance: data.opening_balance,
        status: "open",
        opened_at: new Date().toISOString(),
        opened_by: context.userId,
        auto_close_at: data.auto_close_at ?? null,
        auto_closed: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const closeCaisse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        closing_balance: z.number().min(0).max(99999999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCaisseAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("caisses")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: context.userId,
        closing_balance: data.closing_balance ?? null,
      })
      .eq("id", data.id)
      .eq("status", "open");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOpenCaisseSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCaisseAccess(context.supabase, context.userId);
    const { data: caisse, error: cErr } = await context.supabase
      .from("caisses")
      .select("*")
      .eq("status", "open")
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!caisse) return null;

    const { data: txs, error: tErr } = await context.supabase
      .from("transactions")
      .select("type, amount")
      .eq("caisse_id", caisse.id);
    if (tErr) throw new Error(tErr.message);

    const { data: cmds, error: kErr } = await context.supabase
      .from("commandes")
      .select("avance")
      .eq("caisse_id", caisse.id);
    if (kErr) throw new Error(kErr.message);

    const manualIn = (txs ?? [])
      .filter((t: any) => t.type === "entree")
      .reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const charges = (txs ?? [])
      .filter((t: any) => t.type === "sortie")
      .reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const avances = (cmds ?? []).reduce(
      (s: number, c: any) => s + Number(c.avance ?? 0),
      0,
    );

    const opening = Number(caisse.opening_balance ?? 0);
    const encaissements = avances + manualIn;
    const expected = opening + encaissements - charges;

    return {
      id: caisse.id,
      opening_balance: opening,
      encaissements,
      avances,
      manual_in: manualIn,
      charges,
      expected_balance: expected,
    };
  });

// Sweep: closes any open caisse whose auto_close_at has passed.
// Closing balance is set equal to the expected balance (ecart = 0).
// Returns the list of caisses that were just auto-closed.
export async function sweepAutoCloseCaisses(supabase: any) {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("caisses")
    .select("*")
    .eq("status", "open")
    .not("auto_close_at", "is", null)
    .lte("auto_close_at", nowIso);
  if (error) throw new Error(error.message);
  if (!due || due.length === 0) return [];

  const closed: any[] = [];
  for (const c of due) {
    const [{ data: txs }, { data: cmds }] = await Promise.all([
      supabase.from("transactions").select("type, amount").eq("caisse_id", c.id),
      supabase.from("commandes").select("avance").eq("caisse_id", c.id),
    ]);
    const opening = Number(c.opening_balance ?? 0);
    const manualIn = (txs ?? [])
      .filter((t: any) => t.type === "entree")
      .reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const charges = (txs ?? [])
      .filter((t: any) => t.type === "sortie")
      .reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const avances = (cmds ?? []).reduce(
      (s: number, k: any) => s + Number(k.avance ?? 0),
      0,
    );
    const expected = opening + manualIn + avances - charges;

    const { data: upd, error: uErr } = await supabase
      .from("caisses")
      .update({
        status: "closed",
        closed_at: nowIso,
        closed_by: null,
        closing_balance: expected,
        auto_closed: true,
      })
      .eq("id", c.id)
      .eq("status", "open")
      .select()
      .single();
    if (!uErr && upd) closed.push(upd);
  }
  return closed;
}

export const runAutoCloseSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCaisseAccess(context.supabase, context.userId);
    const closed = await sweepAutoCloseCaisses(context.supabase);
    return closed.map((c: any) => ({
      id: c.id,
      closed_at: c.closed_at as string,
    }));
  });
