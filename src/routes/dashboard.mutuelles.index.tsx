import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, CheckCircle2, FileText, Printer, RotateCcw, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, type AppRole } from "@/lib/auth";

import { MutuellePrintAuto } from "@/components/MutuellePrintAuto";
import { MutuelleLivraisonToggle } from "@/components/MutuelleLivraisonToggle";
import { MarkRemplieDialog } from "@/components/MarkRemplieDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getClientDebt, type ClientDebtDetail } from "@/lib/dettes.functions";
import {
  listDemandesMutuelles,
  unmarkDemandeRemplie,
  deleteDemandeMutuelle,
  type DemandeMutuelleRow,
} from "@/lib/mutuelles.functions";
import { countMutuelleJustificatifsByDemandes } from "@/lib/mutuelle-justificatifs.functions";
import { MutuelleJustifsLightboxButton } from "@/components/MutuelleJustifsBlock";
import { Pagination } from "@/components/ui/AppPagination";
import { usePagination } from "@/hooks/usePagination";

export const Route = createFileRoute("/dashboard/mutuelles/")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <MutuellesListPage />
    </RoleGuard>
  ),
});

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SOURCE_LABEL: Record<string, string> = {
  interne: "Interne",
  externe: "Externe (MDC)",
  mixte: "Mixte",
};

function MutuellesListPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchList = useServerFn(listDemandesMutuelles);
  const doUnmark = useServerFn(unmarkDemandeRemplie);
  const doDelete = useServerFn(deleteDemandeMutuelle);
  const fetchDebt = useServerFn(getClientDebt);
  
  const [q, setQ] = useState("");
  const [statut, setStatutState] = useState<"tous" | "en_attente" | "remplie">("tous");
  const [livraison, setLivraison] = useState<"tous" | "livree" | "pas_livree">("tous");
  const [periode, setPeriode] = useState<"tous" | "cette_semaine" | "ce_mois" | "personnalisee">("tous");
  const [dateDebut, setDateDebut] = useState<string>("");
  const [dateFin, setDateFin] = useState<string>("");
  const [printRow, setPrintRow] = useState<DemandeMutuelleRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<DemandeMutuelleRow | null>(null);
  const [markRow, setMarkRow] = useState<DemandeMutuelleRow | null>(null);

  const setStatut = (s: "tous" | "en_attente" | "remplie") => {
    setStatutState(s);
    if (s === "en_attente") setLivraison("tous");
  };

  const handleResetAll = () => {
    setStatutState("tous");
    setLivraison("tous");
    setPeriode("tous");
    setDateDebut("");
    setDateFin("");
  };

  const isDeliveryFilterDisabled = statut === "en_attente";
  const isFilterActive = statut !== "tous" || livraison !== "tous" || periode !== "tous";
  const dateRangeInvalid =
    periode === "personnalisee" && !!dateDebut && !!dateFin && dateDebut > dateFin;

  const { data: printDebt } = useQuery({
    queryKey: ["client-debt", printRow?.client_id],
    queryFn: () => fetchDebt({ data: { client_id: printRow!.client_id! } }),
    enabled: !!printRow?.client_id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["mutuelles-list"],
    queryFn: () => fetchList(),
  });

  const fetchCounts = useServerFn(countMutuelleJustificatifsByDemandes);
  const rowIds = ((data as DemandeMutuelleRow[] | undefined) ?? []).map((r) => r.id);
  const { data: justifsCounts } = useQuery({
    queryKey: ["mutuelles-justifs-counts", rowIds.join(",")],
    queryFn: () => fetchCounts({ data: { demande_ids: rowIds } }),
    enabled: (role === "admin" || role === "agent_vente") && rowIds.length > 0,
  });
  const countsMap = (justifsCounts as Record<string, number> | undefined) ?? {};

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["mutuelles-list"] });
    qc.invalidateQueries({ queryKey: ["mutuelle"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const unmarkMut = useMutation({
    mutationFn: (id: string) => doUnmark({ data: { id } }),
    onSuccess: () => {
      toast.success("Demande remise en attente");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Demande supprimée");
      invalidateAll();
      setDeleteRow(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data as DemandeMutuelleRow[] | undefined) ?? [];

  const temporalRange = useMemo<[Date, Date] | null>(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    if (periode === "cette_semaine") {
      const start = new Date(today);
      const day = start.getDay(); // 0=dim
      const diff = day === 0 ? 6 : day - 1; // lundi
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      return [start, end];
    }
    if (periode === "ce_mois") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      return [start, end];
    }
    if (periode === "personnalisee") {
      if (!dateDebut || !dateFin) return null;
      const s = new Date(dateDebut + "T00:00:00");
      const e = new Date(dateFin + "T23:59:59.999");
      if (s > e) return null;
      return [s, e];
    }
    return null;
  }, [periode, dateDebut, dateFin]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      const isLivree = r.statut === "livree";
      const isRemplie = r.statut === "remplie" || isLivree;
      if (statut === "en_attente" && r.statut !== "en_attente") return false;
      if (statut === "remplie" && !isRemplie) return false;
      if (livraison !== "tous" && statut !== "en_attente") {
        if (livraison === "livree" && !isLivree) return false;
        if (livraison === "pas_livree" && isLivree) return false;
      }
      if (temporalRange) {
        const d = new Date(r.created_at);
        if (d < temporalRange[0] || d > temporalRange[1]) return false;
      }
      if (!term) return true;
      const hay = [
        r.numero_demande,
        r.clients?.nom_complet ?? "",
        r.organisme ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, q, statut, livraison, temporalRange]);


  const {
    page,
    setPage,
    visible,
    total: totalItems,
  } = usePagination(filtered, [q, statut, livraison, periode, dateDebut, dateFin]);

  const isAdmin = role === "admin";
  const shellRole: AppRole = isAdmin ? "admin" : "agent_vente";

  return (
    <DashboardShell
      role={shellRole}
      title="Mutuelles"
      subtitle="Suivi des demandes de prise en charge mutuelle."
      accent="bg-primary"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Rechercher (N°, client, organisme)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-72"
            />
            {isFilterActive && (
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                Filtres actifs ·{" "}
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="ml-1 underline hover:no-underline"
                >
                  Réinitialiser
                </button>
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Statut demande</span>
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5 w-fit">
                {(["tous", "en_attente", "remplie"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatut(s)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      statut === s
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "tous" ? "Toutes" : s === "en_attente" ? "En attente" : "Remplies"}
                  </button>
                ))}
              </div>
            </div>

            {!isDeliveryFilterDisabled && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">État livraison</span>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5 w-fit">
                  {(["tous", "livree", "pas_livree"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLivraison(s)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        livraison === s
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "tous" ? "Toutes" : s === "livree" ? "Livrées" : "Pas livrées"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Période</span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5 w-fit">
                  {(["tous", "cette_semaine", "ce_mois", "personnalisee"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPeriode(s)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        periode === s
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "tous"
                        ? "Toutes les dates"
                        : s === "cette_semaine"
                        ? "Cette semaine"
                        : s === "ce_mois"
                        ? "Ce mois"
                        : "Plage personnalisée"}
                    </button>
                  ))}
                </div>
                {periode === "personnalisee" && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Du
                      <Input
                        type="date"
                        value={dateDebut}
                        onChange={(e) => setDateDebut(e.target.value)}
                        className="h-8 w-auto"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Au
                      <Input
                        type="date"
                        value={dateFin}
                        onChange={(e) => setDateFin(e.target.value)}
                        className="h-8 w-auto"
                        aria-invalid={dateRangeInvalid}
                      />
                    </label>
                    {dateRangeInvalid && (
                      <span className="text-xs text-destructive">
                        Date de début doit être ≤ date de fin
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Button onClick={() => navigate({ to: "/dashboard/mutuelles/new" })}>
          <Plus className="mr-2 h-4 w-4" /> Nouvelle demande
        </Button>
      </div>


      {/* Desktop: full table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N° demande</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Organisme</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Nb cmd.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Remb.</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Livraison</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                  Aucune demande.
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => {
              const total = (r.demande_mutuelle_commandes ?? []).reduce(
                (acc, link) => acc + Number(link.commandes?.montant ?? 0),
                0,
              );
              const nb = r.demande_mutuelle_commandes?.length ?? 0;
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() =>
                    navigate({ to: "/dashboard/mutuelles/$id", params: { id: r.id } })
                  }
                >
                  <TableCell className="font-medium">
                    <Link
                      to="/dashboard/mutuelles/$id"
                      params={{ id: r.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" /> {r.numero_demande}
                    </Link>
                  </TableCell>
                  <TableCell>{r.clients?.nom_complet ?? "—"}</TableCell>
                  <TableCell>{r.organisme ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {SOURCE_LABEL[r.source_correction] ?? r.source_correction}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{nb}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(total)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.total_remboursement != null
                      ? fmt(Number(r.total_remboursement))
                      : r.prix_monture != null || r.prix_verre != null
                        ? fmt(Number(r.prix_monture ?? 0) + Number(r.prix_verre ?? 0))
                        : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.statut === "en_attente" ? (
                        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                          En attente
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Remplie
                        </Badge>
                      )}
                      {r.statut === "livree" ? (
                        <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                          Livrée
                        </Badge>
                      ) : r.statut === "remplie" ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Non livrée
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>

                  <TableCell>
                    <MutuelleLivraisonToggle
                      id={r.id}
                      livree={r.statut === "livree"}
                      canEdit
                      statut={r.statut}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isAdmin && r.statut === "en_attente" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMarkRow(r);
                          }}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Marquer comme remplie
                        </Button>
                      )}
                      {isAdmin && r.statut === "remplie" && (
                        <Button
                          size="sm"
                          className="bg-amber-500 text-white hover:bg-amber-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            unmarkMut.mutate(r.id);
                          }}
                          disabled={unmarkMut.isPending}
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Remettre en attente
                        </Button>
                      )}
                      {r.statut === "en_attente" && (isAdmin || r.created_by === user?.id) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteRow(r);
                          }}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Supprimer
                        </Button>
                      )}
                      {(countsMap[r.id] ?? 0) > 0 && (
                        <MutuelleJustifsLightboxButton
                          demandeId={r.id}
                          count={countsMap[r.id] ?? 0}
                        />
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrintRow(r);
                        }}
                      >
                        <Printer className="mr-1.5 h-3.5 w-3.5" />
                        Imprimer
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet: stacked cards */}
      <div className="space-y-3 lg:hidden">
        {isLoading && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Chargement…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucune demande.
          </div>
        )}
        {visible.map((r) => {
          const total = (r.demande_mutuelle_commandes ?? []).reduce(
            (acc, link) => acc + Number(link.commandes?.montant ?? 0),
            0,
          );
          const nb = r.demande_mutuelle_commandes?.length ?? 0;
          return (
            <div
              key={r.id}
              className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30"
              onClick={() =>
                navigate({ to: "/dashboard/mutuelles/$id", params: { id: r.id } })
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/dashboard/mutuelles/$id"
                      params={{ id: r.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold"
                    >
                      <FileText className="h-3.5 w-3.5" /> {r.numero_demande}
                    </Link>
                    {r.statut === "en_attente" ? (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">En attente</Badge>
                    ) : (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Remplie</Badge>
                    )}
                    {r.statut === "livree" && (
                      <Badge className="bg-blue-600 text-white hover:bg-blue-600">Livrée</Badge>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm text-foreground">
                    {r.clients?.nom_complet ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.organisme ?? "—"} · {SOURCE_LABEL[r.source_correction] ?? r.source_correction}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{nb}</span> cmd
                </span>
                <span className="tabular-nums">
                  Total : <span className="font-semibold text-foreground">{fmt(total)}</span>
                </span>
                {(r.prix_monture != null || r.prix_verre != null || r.total_remboursement != null) && (
                  <span className="tabular-nums">
                    Remb. :{" "}
                    <span className="font-semibold text-foreground">
                      {fmt(
                        Number(
                          r.total_remboursement ??
                            Number(r.prix_monture ?? 0) + Number(r.prix_verre ?? 0),
                        ),
                      )}
                    </span>
                  </span>
                )}
                <span>{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
              </div>

              <div
                className="mt-3 flex flex-wrap items-center justify-end gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <MutuelleLivraisonToggle
                  id={r.id}
                  livree={r.statut === "livree"}
                  canEdit
                  statut={r.statut}
                />
                {isAdmin && r.statut === "en_attente" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={(e) => { e.stopPropagation(); setMarkRow(r); }}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Remplie
                  </Button>
                )}
                {isAdmin && r.statut === "remplie" && (
                  <Button
                    size="sm"
                    className="bg-amber-500 text-white hover:bg-amber-600"
                    onClick={(e) => { e.stopPropagation(); unmarkMut.mutate(r.id); }}
                    disabled={unmarkMut.isPending}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    En attente
                  </Button>
                )}
                {r.statut === "en_attente" && (isAdmin || r.created_by === user?.id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); setDeleteRow(r); }}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Supprimer
                  </Button>
                )}
                {(countsMap[r.id] ?? 0) > 0 && (
                  <MutuelleJustifsLightboxButton
                    demandeId={r.id}
                    count={countsMap[r.id] ?? 0}
                  />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); setPrintRow(r); }}
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" />
                  Imprimer
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination
        currentPage={page}
        totalItems={totalItems}
        pageSize={10}
        onPageChange={setPage}
      />


      <MutuellePrintAuto
        open={!!printRow}
        onOpenChange={(o) => { if (!o) setPrintRow(null); }}
        numeroDemande={printRow?.numero_demande ?? ""}
        clientOrigineNom={printRow?.clients?.nom_complet ?? null}
        clientOrigineDateNaissance={printRow?.clients?.date_naissance ?? null}
        beneficiaireNom={(printRow as any)?.beneficiaire_nom ?? null}
        beneficiaireDateNaissance={(printRow as any)?.beneficiaire_date_naissance ?? null}
        beneficiaireOrganisme={(printRow as any)?.beneficiaire_organisme ?? null}
        organisme={printRow?.organisme ?? null}
        source={(printRow?.source_correction ?? "interne") as "interne" | "externe" | "mixte"}
        statut={(printRow?.statut ?? "en_attente") as "en_attente" | "remplie" | "livree"}
        createdAt={printRow?.created_at ?? new Date().toISOString()}
        dette={(printDebt as ClientDebtDetail | undefined)?.dette ?? 0}
        commandes={(printRow?.demande_mutuelle_commandes ?? []).map((l) => ({
          numero_commande: l.commandes?.numero_commande ?? null,
          type: l.commandes?.type ?? "",
          monture_source: l.commandes?.monture_source ?? null,
          montant: Number(l.commandes?.montant ?? 0),
        }))}
        total={(printRow?.demande_mutuelle_commandes ?? []).reduce(
          (a, l) => a + Number(l.commandes?.montant ?? 0),
          0,
        )}
      />

      <AlertDialog
        open={!!deleteRow}
        onOpenChange={(o) => { if (!o) setDeleteRow(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer la demande {deleteRow?.numero_demande ?? ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La demande et ses liens seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteRow) deleteMut.mutate(deleteRow.id);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {markRow && (
        <MarkRemplieDialog
          open={!!markRow}
          onOpenChange={(o) => { if (!o) setMarkRow(null); }}
          demandeId={markRow.id}
          onDone={() => { invalidateAll(); setMarkRow(null); }}
        />
      )}
    </DashboardShell>
  );
}
