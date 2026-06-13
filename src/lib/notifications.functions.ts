import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationType =
  | "casse_montage"
  | "reclamation_en_cours"
  | "transition"
  | "mutuelle_demande"
  | "mutuelle_remplie"
  | "commande_supprimee";

export type NotificationRow = {
  id: string;
  commande_id: string | null;
  mutuelle_demande_id: string | null;
  target_user_id: string | null;
  type: NotificationType;
  message: string;
  created_at: string;
  read: boolean;
};

const NOTIF_LIMIT = 40;

/**
 * Helper used by other server-fn handlers to insert a notification.
 * Best-effort: never throws (notifications should not break the main action).
 */
export async function insertNotification(
  sb: any,
  params: {
    commande_id: string;
    type: NotificationType;
    numero_commande: string | null;
    client_nom?: string | null;
    label: string;
    agent_name: string | null;
    user_id: string | null;
  },
) {
  try {
    const num = params.numero_commande ?? "Commande";
    const client = params.client_nom ? ` du ${params.client_nom}` : "";
    const agent = params.agent_name ? ` — par ${params.agent_name}` : "";
    const message = `[${num}]${client} ${params.label}${agent}`;
    await sb.from("notifications").insert({
      commande_id: params.commande_id,
      type: params.type,
      message,
      created_by: params.user_id,
    });
  } catch {
    // swallow
  }
}

/** Liste les notifications récentes + flag read pour l'utilisateur courant. */
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationRow[]> => {
    const sb = context.supabase as any;
    const { data: notifs, error } = await sb
      .from("notifications")
      .select("id, commande_id, mutuelle_demande_id, target_user_id, type, message, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(NOTIF_LIMIT);
    if (error) throw new Error(error.message);

    // Filtrer : notifications ciblées doivent matcher l'utilisateur.
    let visible = (notifs ?? []).filter(
      (n: any) => !n.target_user_id || n.target_user_id === context.userId,
    );

    // Filtrage par rôle créateur / viewer
    const creatorIds = Array.from(
      new Set(visible.map((n: any) => n.created_by).filter(Boolean)),
    ) as string[];
    const roleByUser = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: roles } = await sb
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", creatorIds);
      for (const r of roles ?? []) roleByUser.set(r.user_id, r.role);
    }
    const { data: myRoles } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const viewerRole: string | null = myRoles?.[0]?.role ?? null;

    visible = visible.filter((n: any) => {
      // Pas d'auto-notification
      if (n.created_by && n.created_by === context.userId) return false;
      const creatorRole = n.created_by ? roleByUser.get(n.created_by) : null;
      // Agent vente / admin : ne reçoivent de l'agent de montage que
      // casse_montage, reclamation_en_cours, et la transition "Finalisée".
      if (
        creatorRole === "agent_montage" &&
        (viewerRole === "admin" || viewerRole === "agent_vente")
      ) {
        if (n.type === "casse_montage" || n.type === "reclamation_en_cours") return true;
        if (n.type === "transition" && /Finalis/i.test(n.message ?? "")) return true;
        return false;
      }
      return true;
    });

    const ids = visible.map((n: any) => n.id);
    let readSet = new Set<string>();
    if (ids.length > 0) {
      const { data: reads } = await sb
        .from("notification_reads")
        .select("notification_id")
        .eq("user_id", context.userId)
        .in("notification_id", ids);
      readSet = new Set((reads ?? []).map((r: any) => r.notification_id));
    }

    return visible.map((n: any) => ({
      id: n.id,
      commande_id: n.commande_id,
      mutuelle_demande_id: n.mutuelle_demande_id ?? null,
      target_user_id: n.target_user_id ?? null,
      type: n.type,
      message: n.message,
      created_at: n.created_at,
      read: readSet.has(n.id),
    }));
  });

/** Marque une notification comme lue. */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("notification_reads")
      .upsert(
        { notification_id: data.id, user_id: context.userId },
        { onConflict: "notification_id,user_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marque toutes les notifications visibles comme lues. */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: notifs } = await sb
      .from("notifications")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(NOTIF_LIMIT);
    const ids = (notifs ?? []).map((n: any) => n.id);
    if (ids.length === 0) return { ok: true, count: 0 };

    const rows = ids.map((id: string) => ({
      notification_id: id,
      user_id: context.userId,
    }));
    const { error } = await sb
      .from("notification_reads")
      .upsert(rows, { onConflict: "notification_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });
