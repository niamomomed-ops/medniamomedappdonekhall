import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getMontageStats,
  listMontageAgents,
} from "@/lib/montage-stats.functions";
import { TYPE_LABELS, CASSE_EYE_LABELS } from "@/lib/commande-labels";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard/mes-stats")({
  component: () => (
    <RoleGuard allow={["agent_montage", "admin"]}>
      <MesStatsPage />
    </RoleGuard>
  ),
});

type PeriodPreset = "today" | "week" | "month" | "custom";
type Granularity = "day" | "week" | "month";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // monday=0
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function fmtDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("fr-FR");
}
function bucketKey(d: Date, g: Granularity) {
  if (g === "day") return d.toISOString().slice(0, 10);
  if (g === "month") return d.toISOString().slice(0, 7);
  const sow = startOfWeek(d);
  return sow.toISOString().slice(0, 10);
}

function MesStatsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [agentFilter, setAgentFilter] = useState<string>("tous"); // 'tous' or uuid
  const today = useMemo(() => new Date(), []);
  const [customFrom, setCustomFrom] = useState(fmtDateInput(startOfMonth(today)));
  const [customTo, setCustomTo] = useState(fmtDateInput(today));

  const { from, to } = useMemo(() => {
    if (preset === "today")
      return { from: startOfDay(today), to: endOfDay(today) };
    if (preset === "week")
      return { from: startOfWeek(today), to: endOfDay(today) };
    if (preset === "month")
      return { from: startOfMonth(today), to: endOfDay(today) };
    return {
      from: startOfDay(new Date(customFrom)),
      to: endOfDay(new Date(customTo)),
    };
  }, [preset, customFrom, customTo, today]);

  const fetcher = useServerFn(getMontageStats);
  const agentIdParam = isAdmin && agentFilter !== "tous" ? agentFilter : null;
  const { data, isLoading } = useQuery({
    queryKey: [
      "montage-stats",
      from.toISOString(),
      to.toISOString(),
      isAdmin ? agentFilter : "self",
    ],
    queryFn: () =>
      fetcher({
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          agentId: agentIdParam,
        },
      }),
  });

  const fetchAgents = useServerFn(listMontageAgents);
  const { data: agents } = useQuery({
    queryKey: ["montage-agents-list"],
    queryFn: () => fetchAgents(),
    enabled: isAdmin,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const { myHistory, commandes, allHistory } = data;
    const cmdMap = new Map<string, any>(commandes.map((c: any) => [c.id, c]));

    const finalizedEntries = myHistory.filter(
      (h: any) => h.new_status === "finalise",
    );
    const casseEntries = myHistory.filter(
      (h: any) => h.new_status === "casse_montage",
    );
    const finalized = finalizedEntries.length;
    const casses = casseEntries.length;
    const recues = new Set(myHistory.map((h: any) => h.commande_id)).size;
    const taux = recues > 0 ? Math.round((finalized / recues) * 100) : 0;

    // Average delay: per finalized entry, find earliest verre_recu in allHistory for same commande
    let totalMs = 0;
    let delayCount = 0;
    finalizedEntries.forEach((f: any) => {
      const recu = allHistory
        .filter(
          (h: any) =>
            h.commande_id === f.commande_id && h.new_status === "verre_recu",
        )
        .map((h: any) => new Date(h.changed_at).getTime())
        .sort((a: number, b: number) => a - b)[0];
      if (recu) {
        const fin = new Date(f.changed_at).getTime();
        if (fin > recu) {
          totalMs += fin - recu;
          delayCount++;
        }
      }
    });
    const avgHours =
      delayCount > 0 ? totalMs / delayCount / (1000 * 60 * 60) : 0;
    const delayLabel =
      avgHours >= 48
        ? `${(avgHours / 24).toFixed(1)} j`
        : `${avgHours.toFixed(1)} h`;

    // Time series: finalized & casses bucketed
    const bucketsMap = new Map<string, { fin: number; casse: number }>();
    finalizedEntries.forEach((f: any) => {
      const k = bucketKey(new Date(f.changed_at), granularity);
      const cur = bucketsMap.get(k) ?? { fin: 0, casse: 0 };
      cur.fin++;
      bucketsMap.set(k, cur);
    });
    casseEntries.forEach((c: any) => {
      const k = bucketKey(new Date(c.changed_at), granularity);
      const cur = bucketsMap.get(k) ?? { fin: 0, casse: 0 };
      cur.casse++;
      bucketsMap.set(k, cur);
    });
    const series = Array.from(bucketsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ bucket: k, finalise: v.fin, casse: v.casse }));

    // Pie by type
    const typeMap = new Map<string, number>();
    finalizedEntries.forEach((f: any) => {
      const c = cmdMap.get(f.commande_id);
      const t = c?.type ?? "autre";
      typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    });
    const pie = Array.from(typeMap.entries()).map(([type, value]) => ({
      name: TYPE_LABELS[type] ?? type,
      value,
    }));

    // Table rows
    const casseByCmd = new Map<string, string>();
    casseEntries.forEach((c: any) => {
      const cmd = cmdMap.get(c.commande_id);
      if (cmd?.casse_eye)
        casseByCmd.set(c.commande_id, CASSE_EYE_LABELS[cmd.casse_eye] ?? cmd.casse_eye);
    });

    const rows = finalizedEntries
      .map((f: any) => {
        const c = cmdMap.get(f.commande_id);
        return {
          id: f.id,
          numero: c?.numero_commande ?? "—",
          client: c?.clients?.nom_complet ?? "—",
          type: TYPE_LABELS[c?.type] ?? c?.type ?? "—",
          finalizedAt: f.changed_at,
          casse: casseByCmd.get(f.commande_id) ?? "Non",
        };
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.finalizedAt).getTime() -
          new Date(a.finalizedAt).getTime(),
      );

    return {
      kpis: { finalized, casses, taux, delayLabel },
      series,
      pie,
      rows,
    };
  }, [data, granularity]);

  const agentLabel = useMemo(() => {
    if (!isAdmin) return "moi";
    if (agentFilter === "tous") return "TousAgents";
    const a = (agents ?? []).find((x: any) => x.id === agentFilter);
    return a?.name?.replace(/\s+/g, "_") ?? "Agent";
  }, [isAdmin, agentFilter, agents]);

  const titleText = isAdmin ? "Stats agents montage" : "Mes Stats";
  const pdfTitle = isAdmin
    ? agentFilter === "tous"
      ? "Stats — Tous les agents montage"
      : `Stats — ${(agents ?? []).find((x: any) => x.id === agentFilter)?.name ?? "Agent"}`
    : "Mes Stats — Agent montage";
  const fileBase = isAdmin ? `stats-${agentLabel}` : "mes-stats";

  const handleExportCSV = () => {
    if (!stats) return;
    const header = ["N° commande", "Client", "Type", "Date finalisé", "Casse"];
    const lines = [
      header.join(","),
      ...stats.rows.map((r: any) =>
        [r.numero, r.client, r.type, fmtDateTime(r.finalizedAt), r.casse]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}-${fmtDateInput(from)}_${fmtDateInput(to)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!stats) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(pdfTitle, 14, 18);
    doc.setFontSize(10);
    doc.text(`Période : ${fmtDateInput(from)} → ${fmtDateInput(to)}`, 14, 26);
    doc.setFontSize(11);
    const kpis = [
      ["Commandes traitées", String(stats.kpis.finalized)],
      ["Casses déclarées", String(stats.kpis.casses)],
      ["Taux de réussite", `${stats.kpis.taux} %`],
      ["Délai moyen", stats.kpis.delayLabel],
    ];
    autoTable(doc, {
      head: [["Indicateur", "Valeur"]],
      body: kpis,
      startY: 32,
      theme: "grid",
    });
    autoTable(doc, {
      head: [["N° commande", "Client", "Type", "Date finalisé", "Casse"]],
      body: stats.rows.map((r: any) => [
        r.numero,
        r.client,
        r.type,
        fmtDateTime(r.finalizedAt),
        r.casse,
      ]),
      startY: (doc as any).lastAutoTable.finalY + 10,
      styles: { fontSize: 9 },
    });
    doc.save(`${fileBase}-${fmtDateInput(from)}_${fmtDateInput(to)}.pdf`);
  };

  const PIE_COLORS = [
    "hsl(var(--primary))",
    "#f59e0b",
    "#10b981",
    "#6366f1",
    "#ec4899",
    "#06b6d4",
  ];

  const empty = stats && stats.kpis.finalized === 0 && stats.kpis.casses === 0;

  return (
    <DashboardShell
      role={isAdmin ? "admin" : "agent_montage"}
      title={titleText}
      subtitle={
        isAdmin
          ? "Suivi global de l'activité des agents de montage."
          : "Suivez vos performances et votre activité de montage."
      }
      accent={isAdmin ? "bg-primary" : "bg-amber-500"}
    >
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["today", "Aujourd'hui"],
              ["week", "Cette semaine"],
              ["month", "Ce mois-ci"],
              ["custom", "Personnalisée"],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={preset === k ? "default" : "outline"}
              onClick={() => setPreset(k)}
            >
              {label}
            </Button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Du</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div>
              <Label className="text-xs">Au</Label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Agent</span>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Tous les agents montage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les agents montage</SelectItem>
                {(agents ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Granularité</span>
          {(
            [
              ["day", "Jour"],
              ["week", "Semaine"],
              ["month", "Mois"],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={granularity === k ? "default" : "outline"}
              onClick={() => setGranularity(k)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          Chargement…
        </div>
      )}

      {!isLoading && empty && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="text-base font-medium">
            Aucune activité sur cette période
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Continuez sur votre lancée — vos prochaines commandes apparaîtront ici.
          </p>
        </div>
      )}

      {!isLoading && stats && !empty && (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Wrench}
              label="Commandes traitées"
              value={String(stats.kpis.finalized)}
              desc={isAdmin ? "Finalisées sur la période" : "Finalisées par vous"}
            />
            <KpiCard
              icon={AlertTriangle}
              label="Casses déclarées"
              value={String(stats.kpis.casses)}
              desc="Sur la période"
              accent="text-red-600"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Taux de réussite"
              value={`${stats.kpis.taux} %`}
              desc="Finalisées / Reçues"
            />
            <KpiCard
              icon={Clock}
              label="Délai moyen"
              value={stats.kpis.delayLabel}
              desc="Verre reçu → Finalisé"
            />
          </div>

          {/* Charts */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Évolution des commandes traitées">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={stats.series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="bucket" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="finalise"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    name="Finalisées"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Casses déclarées dans le temps">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="bucket" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="casse" fill="#ef4444" name="Casses" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Répartition par type de vision" className="lg:col-span-2">
              {stats.pie.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Aucune commande finalisée
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={stats.pie}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={100}
                      label
                    >
                      {stats.pie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Table + exports */}
          <div className="mt-6 rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <h3 className="text-sm font-semibold">
                Commandes traitées ({stats.rows.length})
              </h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExportCSV}>
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>
                <Button size="sm" onClick={handleExportPDF}>
                  <FileText className="mr-2 h-4 w-4" /> PDF
                </Button>
              </div>
            </div>
            <div className="p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° commande</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type de vision</TableHead>
                    <TableHead>Date finalisé</TableHead>
                    <TableHead>Casse</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        Aucune commande finalisée sur la période
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.numero}</TableCell>
                        <TableCell>{r.client}</TableCell>
                        <TableCell>{r.type}</TableCell>
                        <TableCell>{fmtDateTime(r.finalizedAt)}</TableCell>
                        <TableCell
                          className={
                            r.casse === "Non" ? "" : "text-red-600 font-medium"
                          }
                        >
                          {r.casse}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  desc,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  desc: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <Icon className={`h-5 w-5 ${accent ?? "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-4 text-2xl font-semibold text-card-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className ?? ""}`}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
