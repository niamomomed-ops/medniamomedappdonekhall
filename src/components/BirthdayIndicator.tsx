import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listClients } from "@/lib/clients.functions";
import { listTodayFelicitations } from "@/lib/felicitations.functions";
import { isBirthdayToday } from "@/lib/birthday";
import { useAuth } from "@/lib/auth";

type ClientRow = { id: string; date_naissance: string | null };

export function BirthdayIndicator() {
  const { role } = useAuth();
  const fetchList = useServerFn(listClients);
  const fetchFelicitated = useServerFn(listTodayFelicitations);
  const enabled = role === "admin" || role === "agent_vente";

  const { data } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchList(),
    enabled,
  });

  const { data: felicitatedIds } = useQuery({
    queryKey: ["felicitations-today"],
    queryFn: () => fetchFelicitated(),
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;
  const rows = (data as ClientRow[] | undefined) ?? [];
  const felicited = new Set((felicitatedIds as string[] | undefined) ?? []);
  const count = rows.filter(
    (c) => isBirthdayToday(c.date_naissance) && !felicited.has(c.id),
  ).length;
  if (count === 0) return null;

  return (
    <Link
      to="/dashboard/clients"
      search={{ filtre: "anniversaire" } as never}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-lg transition hover:bg-muted"
      title={`${count} anniversaire${count > 1 ? "s" : ""} à féliciter`}
      aria-label="Anniversaires du jour"
    >
      <span className="animate-bounce">🎂</span>
      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-bold text-white">
        {count > 99 ? "99+" : count}
      </span>
    </Link>
  );
}
