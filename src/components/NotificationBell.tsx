import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/notifications.functions";
import { useAuth } from "@/lib/auth";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function typeIcon(t: string): string {
  if (t === "casse_montage") return "🔴";
  if (t === "reclamation_en_cours") return "🟠";
  if (t === "mutuelle_demande") return "🔔";
  if (t === "mutuelle_remplie") return "✅";
  return "🔔";
}

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();
  const fetchList = useServerFn(listNotifications);
  const markAll = useServerFn(markAllNotificationsRead);
  const markOne = useServerFn(markNotificationRead);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchList(),
    refetchInterval: 30_000,
  });
  const raw = (data as NotificationRow[] | undefined) ?? [];
  const list = raw.filter((n) => {
    if (role === "agent_montage") {
      return n.type !== "mutuelle_demande" && n.type !== "mutuelle_remplie";
    }
    // Les nouvelles demandes mutuelles ne notifient que l'admin
    if (n.type === "mutuelle_demande" && role !== "admin") return false;
    return true;
  });
  const unread = list.filter((n) => !n.read).length;

  const allMut = useMutation({
    mutationFn: () => markAll(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotificationRow[]>(["notifications"]);
      qc.setQueryData<NotificationRow[]>(["notifications"], (old) =>
        (old ?? []).map((n) => ({ ...n, read: true })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const oneMut = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotificationRow[]>(["notifications"]);
      qc.setQueryData<NotificationRow[]>(["notifications"], (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const openCmd = (n: NotificationRow) => {
    if (n.mutuelle_demande_id) {
      navigate({ to: "/dashboard/mutuelles/$id", params: { id: n.mutuelle_demande_id } });
    } else if (n.commande_id) {
      navigate({ to: "/dashboard/commandes/$id", params: { id: n.commande_id } });
    }
    if (!n.read) oneMut.mutate(n.id);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => allMut.mutate()}
              disabled={allMut.isPending}
            >
              <Check className="mr-1 h-3 w-3" />
              Tout marquer lu
            </Button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {list.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Aucune notification.
            </p>
          )}
          {list.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openCmd(n)}
              className={`flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                n.read ? "opacity-60" : ""
              }`}
            >
              <span className="text-base leading-none">{typeIcon(n.type)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{n.message}</p>
                <p className="text-xs text-muted-foreground">
                  {timeAgo(n.created_at)}
                </p>
              </div>
              {!n.read && (
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
