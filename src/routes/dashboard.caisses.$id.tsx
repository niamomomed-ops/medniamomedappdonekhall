import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Search } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { BackButton } from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/lib/auth";
import { getCaisseJournal, type JournalMovement } from "@/lib/caisses.functions";

export const Route = createFileRoute("/dashboard/caisses/$id")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <CaisseJournalPage />
    </RoleGuard>
  ),
});

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fr-FR") : "—";

const KIND_LABEL: Record<JournalMovement["kind"], string> = {
  ouverture: "Ouverture",
  avance: "Avance commande",
  entree: "Entrée manuelle",
  charge: "Charge",
  fermeture: "Fermeture",
  fermeture_auto: "Fermeture automatique",
};

const KIND_BADGE: Record<JournalMovement["kind"], string> = {
  ouverture: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  avance: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  entree: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  charge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  fermeture: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  fermeture_auto: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
};

function CaisseJournalPage() {
  const { role } = useAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchJournal = useServerFn(getCaisseJournal);

  const { data, isLoading, error } = useQuery({
    queryKey: ["caisse-journal", id],
    queryFn: () => fetchJournal({ data: { id } }),
  });

  const guardRole = role === "agent_vente" ? "agent_vente" : "admin";

  const [kindFilter, setKindFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Compute cumulative balance on chronological-asc list, then apply filters
  // for display while preserving the original cumulative balance per row.
  const rows = useMemo(() => {
    if (!data) return [];
    let running = 0;
    const enriched = data.movements.map((m) => {
      if (m.kind === "fermeture") {
        // display-only — show final balance directly, no impact on running
        return { ...m, running };
      }
      running += m.amount;
      return { ...m, running };
    });
    // Apply filters
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 3600 * 1000 - 1 : null;
    const q = search.trim().toLowerCase();
    const filtered = enriched.filter((m) => {
      if (kindFilter !== "all" && m.kind !== kindFilter) return false;
      const t = new Date(m.occurred_at).getTime();
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      if (q) {
        const hay = `${m.reference} ${m.client}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Default display order: most recent first.
    return filtered.sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
  }, [data, kindFilter, dateFrom, dateTo, search]);

  const handleExport = () => {
    if (!data) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const caisse = data.caisse;
    const s = data.summary;

    doc.setFontSize(16);
    doc.text("Journal de caisse", 14, 16);
    doc.setFontSize(10);
    doc.text(
      [
        `Statut : ${caisse.status === "open" ? "Ouverte" : "Fermée"}`,
        `Ouverture : ${fmtDateTime(caisse.opened_at)}`,
        `Fermeture : ${caisse.closed_at ? fmtDateTime(caisse.closed_at) : "En cours"}`,
      ].join("    "),
      14,
      24,
    );

    const summaryRows: [string, string][] = [
      ["Solde de démarrage", fmt(s.opening_balance)],
      ["Encaissé (+)", fmt(s.encaissements)],
      ["Charges (-)", fmt(s.charges)],
      ["Solde attendu", fmt(s.expected_balance)],
    ];
    if (s.final_balance != null) summaryRows.push(["Solde final", fmt(s.final_balance)]);
    if (s.ecart != null) summaryRows.push(["Écart", `${s.ecart >= 0 ? "+" : ""}${fmt(s.ecart)}`]);

    autoTable(doc, {
      startY: 30,
      head: [["Récapitulatif", "Montant"]],
      body: summaryRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
      theme: "grid",
    });

    // Movements in chronological order (oldest first) for the printed journal.
    const chrono = [...rows].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    );
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      head: [["Date", "Type", "Référence", "Client", "Montant", "Solde"]],
      body: chrono.map((m) => [
        fmtDateTime(m.occurred_at),
        KIND_LABEL[m.kind],
        m.reference,
        m.client,
        m.display_only
          ? fmt(m.amount)
          : `${m.amount >= 0 ? "+" : "-"}${fmt(Math.abs(m.amount))}`,
        fmt(m.running),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
      theme: "striped",
    });

    doc.save(`journal-caisse-${caisse.id.slice(0, 8)}.pdf`);
  };

  return (
    <DashboardShell
      role={guardRole}
      title="Journal de caisse"
      subtitle="Détail des ouvertures, fermetures et mouvements."
      accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
    >
      <div className="mb-4 flex items-center justify-between">
        <BackButton fallback="/dashboard/caisses" />
        <Button onClick={handleExport} disabled={!data} variant="outline">
          <Download className="mr-2 h-4 w-4" /> Exporter PDF
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
          Chargement…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-card p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Header */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">
                Caisse {data.caisse.id.slice(0, 8).toUpperCase()}
              </h2>
              {data.caisse.status === "open" ? (
                <Badge>Ouverte</Badge>
              ) : (
                <Badge variant="secondary">Fermée</Badge>
              )}
            </div>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Ouverture" value={fmtDateTime(data.caisse.opened_at)} />
              <Field
                label="Fermeture"
                value={data.caisse.closed_at ? fmtDateTime(data.caisse.closed_at) : "En cours"}
              />
              <Field label="Ouverte par" value={data.caisse.opened_by_name ?? "—"} />
            </dl>
          </div>

          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label="Solde de démarrage" value={fmt(data.summary.opening_balance)} />
            <SummaryCard
              label="Encaissé"
              value={`+ ${fmt(data.summary.encaissements)}`}
              tone="positive"
            />
            <SummaryCard
              label="Charges"
              value={`- ${fmt(data.summary.charges)}`}
              tone="negative"
            />
            <SummaryCard
              label="Solde attendu"
              value={fmt(data.summary.expected_balance)}
              emphasis
            />
            <SummaryCard
              label="Solde final"
              value={data.summary.final_balance != null ? fmt(data.summary.final_balance) : "—"}
            />
            <SummaryCard
              label="Écart"
              value={
                data.summary.ecart == null
                  ? "—"
                  : `${data.summary.ecart >= 0 ? "+" : ""}${fmt(data.summary.ecart)}`
              }
              tone={
                data.summary.ecart == null
                  ? "neutral"
                  : Math.abs(data.summary.ecart) < 0.005
                    ? "positive"
                    : "negative"
              }
            />
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="avance">Avance commande</SelectItem>
                    <SelectItem value="entree">Entrée manuelle</SelectItem>
                    <SelectItem value="charge">Charge</SelectItem>
                    <SelectItem value="ouverture">Ouverture</SelectItem>
                    <SelectItem value="fermeture">Fermeture</SelectItem>
                  <SelectItem value="fermeture_auto">Fermeture automatique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date début</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date fin</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Recherche (réf. ou client)</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="CMD-000123, nom client…"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Movements */}
          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-right">Solde cumulé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Aucun mouvement.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDateTime(m.occurred_at)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${KIND_BADGE[m.kind]}`}
                      >
                        {KIND_LABEL[m.kind]}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{m.reference}</TableCell>
                    <TableCell className="text-muted-foreground">{m.client}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        m.display_only
                          ? "text-foreground"
                          : m.amount >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {m.display_only
                        ? fmt(m.amount)
                        : `${m.amount >= 0 ? "+" : "-"}${fmt(Math.abs(m.amount))}`}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmt(m.running)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
  emphasis = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 ${emphasis ? "text-lg font-bold" : "text-base font-semibold"} ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
