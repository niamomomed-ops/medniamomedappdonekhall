import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  listNotifications,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/notifications.functions";
import { listCommandes } from "@/lib/commandes.functions";

const URGENT_TYPES = new Set([
  "casse_montage",
  "reclamation_en_cours",
  "mutuelle_demande",
  "mutuelle_remplie",
  "commande_supprimee",
]);

export function UrgentBanner() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchList = useServerFn(listNotifications);
  const markOne = useServerFn(markNotificationRead);
  const fetchCommandes = useServerFn(listCommandes);

  const isSales = role === "admin" || role === "agent_vente";
  const isMontage = role === "agent_montage";
  const enabled = isSales || isMontage;

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchList(),
    refetchInterval: 30_000,
    enabled: isSales,
  });

  const { data: commandes } = useQuery({
    queryKey: ["commandes-list"],
    queryFn: () => fetchCommandes(),
    refetchInterval: 30_000,
    enabled,
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (!enabled) return null;

  const list = (data as NotificationRow[] | undefined) ?? [];
  const allCmd = (commandes as any[] | undefined) ?? [];
  const cmdById = new Map<string, any>();
  for (const c of allCmd) cmdById.set(c.id, c);
  const urgents = isSales
    ? list.filter((n) => {
        if (!URGENT_TYPES.has(n.type) || n.read) return false;
        // Une nouvelle demande mutuelle ne doit alerter que l'admin
        if (n.type === "mutuelle_demande" && role !== "admin") return false;
        // Suppression de commande : uniquement l'admin reçoit l'alerte
        if (n.type === "commande_supprimee" && role !== "admin") return false;
        // Masquer les bannières devenues obsolètes lorsque la commande a évolué
        if (n.type === "reclamation_en_cours" && n.commande_id) {
          const c = cmdById.get(n.commande_id);
          if (!c) return false;
          if (
            !c.reclamation_detail ||
            c.reclamation_sent_at ||
            c.reclamation_resolved_at ||
            c.status !== "reclamation"
          ) {
            return false;
          }
        }
        if (n.type === "casse_montage" && n.commande_id) {
          const c = cmdById.get(n.commande_id);
          if (!c) return false;
          if (c.status !== "casse_montage") return false;
        }
        return true;
      })
    : [];

  const finalises = isSales
    ? allCmd.filter((c) => c.status === "finalise")
    : [];

  const todayISO = (() => {
    const d = new Date();
    const tz = d.getTimezoneOffset();
    return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
  })();
  const montageToday = isMontage
    ? allCmd.filter(
        (c) =>
          [
            "verre_commande",
            "reception_partielle",
            "verre_recu",
            "en_montage",
            "casse_montage",
          ].includes(c.status) && c.date_livraison === todayISO,
      )
    : [];

  if (
    urgents.length === 0 &&
    finalises.length === 0 &&
    montageToday.length === 0
  )
    return null;

  return (
    <div className="space-y-px">
      {urgents.map((n) => (
        <div
          key={n.id}
          className="flex items-center gap-3 border-b border-red-700 bg-red-600 px-4 py-2 text-sm font-medium text-white"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">🚨 {n.message}</span>
          {n.mutuelle_demande_id ? (
            <button
              type="button"
              className="rounded-md bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25"
              onClick={() =>
                navigate({
                  to: "/dashboard/mutuelles/$id",
                  params: { id: n.mutuelle_demande_id! },
                })
              }
            >
              Voir la demande
            </button>
          ) : n.commande_id ? (
            <button
              type="button"
              className="rounded-md bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25"
              onClick={() =>
                navigate({
                  to: "/dashboard/commandes/$id",
                  params: { id: n.commande_id! },
                })
              }
            >
              Voir la commande
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25"
            onClick={() => ackMut.mutate(n.id)}
            disabled={ackMut.isPending}
            aria-label="Acquitter"
          >
            <X className="h-3 w-3" />
            Acquitter
          </button>
        </div>
      ))}

      {finalises.length > 0 && (
        <div className="flex min-h-[44px] items-center gap-3 border-b border-red-700 bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {finalises.length === 1 ? (
            <span className="flex-1 truncate">
              🟢 {finalises[0].numero_commande ?? "—"} —{" "}
              {finalises[0].clients?.nom_complet ?? "Client"} — est prête. À récupérer et marquer « En réception ».
            </span>
          ) : (
            <span className="flex-1 truncate">
              🟢 {finalises.length} commandes prêtes à récupérer — à marquer « En réception ».
            </span>
          )}
          <button
            type="button"
            className="rounded-md bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25"
            onClick={() => {
              if (finalises.length === 1) {
                navigate({
                  to: "/dashboard/commandes/$id",
                  params: { id: finalises[0].id },
                });
              } else {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("commandes-filter-v2", "en_cours");
                  sessionStorage.setItem(
                    "commandes-active-chips-v1",
                    JSON.stringify(["finalise"]),
                  );
                }
                navigate({ to: "/dashboard/commandes" });
              }
            }}
          >
            {finalises.length === 1 ? "Voir la commande" : "Voir les commandes"}
          </button>
        </div>
      )}

      {montageToday.length > 0 && (
        <div
          className="flex min-h-[44px] items-center gap-3 border-b px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: "#D97706", borderColor: "#B45309" }}
        >
          <Clock className="h-4 w-4 shrink-0" />
          {montageToday.length === 1 ? (
            <span className="flex-1 truncate">
              ⏰ {montageToday[0].numero_commande ?? "—"} —{" "}
              {montageToday[0].clients?.nom_complet ?? "Client"} — est à finaliser aujourd'hui.
            </span>
          ) : (
            <span className="flex-1 truncate">
              ⏰ {montageToday.length} commandes à finaliser aujourd'hui.
            </span>
          )}
          <button
            type="button"
            className="rounded-md bg-white/90 px-3 py-1 text-xs font-semibold hover:bg-white"
            style={{ color: "#D97706" }}
            onClick={() => {
              if (montageToday.length === 1) {
                navigate({
                  to: "/dashboard/commandes/$id",
                  params: { id: montageToday[0].id },
                });
              } else {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("commandes-filter-v2", "today");
                }
                navigate({ to: "/dashboard/commandes" });
              }
            }}
          >
            {montageToday.length === 1 ? "Voir la commande" : "Voir les commandes"}
          </button>
        </div>
      )}
    </div>
  );
}
