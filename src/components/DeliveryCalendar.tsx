import { useMemo, useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

type DayCount = { iso: string; count: number };

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS_SHORT = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const todayISO = () => toISO(new Date());

// Monday of the week containing d
function startOfWeek(d: Date) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - offset);
  return out;
}

export function DeliveryCalendar({
  items,
  onPick,
}: {
  items: { date_livraison: string | null; status: string }[];
  onPick: (iso: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = sessionStorage.getItem("delivery-cal-open");
    if (v != null) setOpen(v === "1");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      sessionStorage.setItem("delivery-cal-open", open ? "1" : "0");
  }, [open]);

  const today = todayISO();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of items) {
      if (!c.date_livraison) continue;
      if (c.status === "livree") continue;
      const key = c.date_livraison.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const totalUpcoming = useMemo(() => {
    let n = 0;
    counts.forEach((v, k) => {
      if (k >= today) n += v;
    });
    return n;
  }, [counts, today]);

  const days = useMemo<DayCount[]>(() => {
    const cells: DayCount[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const iso = toISO(d);
      cells.push({ iso, count: counts.get(iso) ?? 0 });
    }
    return cells;
  }, [weekStart, counts]);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const weekLabel = (() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const sameMonth = weekStart.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${weekStart.getDate()} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  })();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium shadow-lg hover:bg-muted"
      >
        <CalendarDays className="h-4 w-4 text-primary" />
        Livraisons
        {totalUpcoming > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground tabular-nums">
            {totalUpcoming}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="w-[300px] rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" />
          Calendrier livraisons
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Réduire"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={prevWeek}
          className="rounded p-1 hover:bg-muted"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={goToday}
          className="text-xs font-semibold capitalize hover:underline"
          title="Revenir à la semaine courante"
        >
          {weekLabel}
        </button>
        <button
          type="button"
          onClick={nextWeek}
          className="rounded p-1 hover:bg-muted"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-3 pb-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
        {WEEKDAYS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-3 pb-3">
        {days.map((cell, i) => {
          const isPast = cell.iso < today;
          const isToday = cell.iso === today;
          const hasCount = cell.count > 0;
          const clickable = !isPast;

          const base =
            "relative h-10 rounded-md text-xs flex flex-col items-center justify-center transition-colors";
          let cls = "text-muted-foreground";
          if (isToday) cls = "ring-2 ring-primary text-foreground font-semibold";
          else if (!isPast) cls = "text-foreground";
          if (clickable) cls += " hover:bg-primary/10 cursor-pointer";
          else cls += " cursor-not-allowed opacity-70";
          if (hasCount && !isPast) cls += " bg-primary/5";
          if (hasCount && isPast) cls += " bg-muted/40";

          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onPick(cell.iso)}
              className={`${base} ${cls}`}
              title={
                clickable
                  ? `${cell.count} commande(s) à livrer`
                  : `Jour passé — ${cell.count} commande(s)`
              }
            >
              <span className="leading-none">{Number(cell.iso.slice(8))}</span>
              {hasCount && (
                <span
                  className={`mt-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
                    isPast
                      ? "bg-muted-foreground/30 text-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {cell.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
