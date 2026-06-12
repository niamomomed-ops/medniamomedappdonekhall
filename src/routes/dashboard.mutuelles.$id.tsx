import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, History as HistoryIcon, Paperclip, Printer, RotateCcw, Trash2, User } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, type AppRole } from "@/lib/auth";

import { MutuellePrintAuto } from "@/components/MutuellePrintAuto";
import { MutuelleLivraisonToggle } from "@/components/MutuelleLivraisonToggle";
import { MarkRemplieDialog } from "@/components/MarkRemplieDialog";
import { AddJustifsDialog } from "@/components/AddJustifsDialog";
import { MutuelleJustifsBlock } from "@/components/MutuelleJustifsBlock";
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
  getDemandeMutuelle,
  unmarkDemandeRemplie,
  deleteDemandeMutuelle,
  updateDemandeBeneficiaire,
  type DemandeMutuelleRow,
  type MutuelleHistoryEntry,
} from "@/lib/mutuelles.functions";
import {
  BeneficiaireFormBlock,
  emptyBeneficiaire,
  isBeneficiaireValid,
  resolveBeneficiaireOrganisme,
  type BeneficiaireValues,
} from "@/components/BeneficiaireFormBlock";
import { MUTUELLE_OPTIONS } from "@/components/ClientExtraFields";

export const Route = createFileRoute("/dashboard/mutuelles/$id")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <MutuelleDetailPage />
    </RoleGuard>
  ),
});

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const ORGANISME_COLORS: Record<string, string> = {
  AMO: "bg-blue-600 text-white hover:bg-blue-600",
  CNSS: "bg-purple-600 text-white hover:bg-purple-600",
  SANLAM: "bg-orange-600 text-white hover:bg-orange-600",
};

function OrganismeChip({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge variant="outline">—</Badge>;
  const key = value.toUpperCase();
  const cls = ORGANISME_COLORS[key] ?? "bg-slate-600 text-white hover:bg-slate-600";
  return <Badge className={cls}>{value}</Badge>;
}

function MdcChip({ mdc }: { mdc: boolean }) {
  return mdc ? (
    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">MDC : OUI</Badge>
  ) : (
    <Badge className="bg-red-600 text-white hover:bg-red-600">MDC : NON</Badge>
  );
}

function sourceMdc(source: string): boolean {
  // interne => MDC NON, externe/mixte => MDC OUI
  return source !== "interne";
}

function SourceInlineChip({ source }: { source: string }) {
  const label = source === "externe" ? "Externe" : source === "mixte" ? "Mixte" : "Interne";
  const mdc = sourceMdc(source);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-xs font-semibold ${mdc ? "text-red-600" : "text-emerald-600"}`}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground">·</span>
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          mdc ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}
      >
        {mdc ? "MDC : OUI" : "MDC : NON"}
      </span>
    </span>
  );
}


const TYPE_LABELS: Record<string, string> = {
  vision_loin: "Vision de loin",
  vision_pres: "Vision de près",
  double_foyer: "Double foyer",
  progressif: "Progressif",
  lentilles: "Lentilles",
};

type DemandeWithExtras = DemandeMutuelleRow & {
  history?: MutuelleHistoryEntry[];
  created_by_personnel?: { name: string | null; email: string | null } | null;
  remplie_by_personnel?: { name: string | null; email: string | null } | null;
};

function StatutBadge({
  statut,
  hideLivree = false,
}: {
  statut: "en_attente" | "remplie" | "livree";
  hideLivree?: boolean;
}) {
  if (statut === "livree" && !hideLivree)
    return <Badge className="bg-blue-600 text-white hover:bg-blue-600">Livrée</Badge>;
  return statut === "en_attente" ? (
    <Badge className="bg-amber-500 text-white hover:bg-amber-500">En attente</Badge>
  ) : (
    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Remplie</Badge>
  );
}

function MutuelleDetailPage() {
  const { id } = useParams({ from: "/dashboard/mutuelles/$id" });
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchOne = useServerFn(getDemandeMutuelle);
  const doUnmark = useServerFn(unmarkDemandeRemplie);
  const fetchDebt = useServerFn(getClientDebt);
  const doDelete = useServerFn(deleteDemandeMutuelle);

  const [printOpen, setPrintOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [addJustifsOpen, setAddJustifsOpen] = useState(false);
  const shellRole: AppRole = role === "admin" ? "admin" : "agent_vente";
  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "agent_vente";

  const { data, isLoading } = useQuery({
    queryKey: ["mutuelle", id],
    queryFn: () => fetchOne({ data: { id } }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["mutuelle", id] });
    qc.invalidateQueries({ queryKey: ["mutuelles-list"] });
    qc.invalidateQueries({ queryKey: ["mutuelles-client"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["mutuelle-justifs", id] });
    qc.invalidateQueries({ queryKey: ["mutuelles-justifs-counts"] });
  };

  const unmarkMut = useMutation({
    mutationFn: () => doUnmark({ data: { id } }),
    onSuccess: () => {
      toast.success("Demande remise en attente");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Demande supprimée");
      qc.invalidateQueries({ queryKey: ["mutuelles-list"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      navigate({ to: "/dashboard/mutuelles" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const row = data as DemandeWithExtras | undefined;
  const links = row?.demande_mutuelle_commandes ?? [];
  const total = links.reduce((a, l) => a + Number(l.commandes?.montant ?? 0), 0);
  const history = row?.history ?? [];

  const { data: debtData } = useQuery({
    queryKey: ["client-debt", row?.client_id],
    queryFn: () => fetchDebt({ data: { client_id: row!.client_id } }),
    enabled: !!row?.client_id,
  });
  const dette = (debtData as ClientDebtDetail | undefined)?.dette ?? 0;

  const age = (() => {
    const d = row?.clients?.date_naissance;
    if (!d) return null;
    const b = new Date(d);
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
    return a;
  })();

  return (
    <DashboardShell
      role={shellRole}
      title={row ? `Demande ${row.numero_demande}` : "Demande mutuelle"}
      subtitle={row?.clients?.nom_complet ?? ""}
      accent="bg-primary"
    >
      <button
        type="button"
        onClick={() => navigate({ to: "/dashboard/mutuelles" })}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Retour
      </button>

      {isLoading && <p className="text-muted-foreground">Chargement…</p>}

      {row && (
        <div className="space-y-3">
          {/* En-tête : numéro + statut */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">{row.numero_demande}</h2>
              <div className="flex flex-col items-end gap-2">
                <StatutBadge statut={row.statut} hideLivree />

                <MutuelleLivraisonToggle
                  id={row.id}
                  livree={!!row.livree}
                  canEdit={canEdit}
                  badgeOnly
                />
              </div>
            </div>
          </div>

          {/* Bloc client + bénéficiaire côte à côte */}
          {(() => {
            const hasBeneficiaire = !!row.beneficiaire_nom;
            const benefAge = (() => {
              const d = row.beneficiaire_date_naissance;
              if (!d) return null;
              const b = new Date(d);
              const t = new Date();
              let a = t.getFullYear() - b.getFullYear();
              const m = t.getMonth() - b.getMonth();
              if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
              return a;
            })();
            return (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Bloc client */}
                  <div
                    className="rounded-xl border border-border bg-card p-4 transition-opacity"
                    style={{
                      opacity: hasBeneficiaire && !canEdit ? 0.45 : 1,
                      filter: hasBeneficiaire && !canEdit ? "grayscale(30%)" : "none",
                    }}
                  >
                    <h3 className="text-xl font-semibold">{row.clients?.nom_complet ?? "—"}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {age != null && <span className="font-semibold">{age} ans</span>}
                      {age != null && <span className="text-muted-foreground">|</span>}
                      <span className={dette > 0 ? "font-semibold text-red-600" : "font-semibold"}>
                        Dette : {dette.toFixed(0)} DH
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <OrganismeChip value={row.organisme} />
                      <MdcChip mdc={sourceMdc(row.source_correction)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {row.client_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate({
                              to: "/dashboard/clients/$id",
                              params: { id: row.client_id },
                            })
                          }
                        >
                          <User className="mr-1.5 h-3.5 w-3.5" />
                          Voir fiche client
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => setPrintOpen(true)}>
                          <Printer className="mr-1.5 h-3.5 w-3.5" />
                          Imprimer
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Bloc droit — éditeur bénéficiaire (ou affichage si lecture seule) */}
                  {canEdit && row.statut !== "livree" ? (
                    <BeneficiaireEditor
                      demandeId={row.id}
                      currentNom={row.beneficiaire_nom ?? null}
                      currentDate={row.beneficiaire_date_naissance ?? null}
                      currentOrganisme={row.beneficiaire_organisme ?? null}
                    />
                  ) : (
                    hasBeneficiaire && (
                      <div
                        className="rounded-xl border-2 p-4"
                        style={{
                          borderColor: "#f97316",
                          backgroundColor: "#fff7ed",
                        }}
                      >
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-600">
                          🏷 Bénéficiaire changé
                        </p>
                        <h3 className="text-xl font-semibold">{row.beneficiaire_nom}</h3>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {benefAge != null ? `${benefAge} ans` : "—"}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <OrganismeChip value={row.beneficiaire_organisme} />
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })()}

          {/* Commandes concernées */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
              Commandes concernées ({links.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">N° commande</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Monture</th>
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {links.map((l) => (
                    <tr
                      key={l.commande_id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() =>
                        navigate({ to: "/dashboard/commandes/$id", params: { id: l.commande_id } })
                      }
                    >
                      <td className="px-4 py-2 font-medium">
                        {l.commandes?.numero_commande ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {TYPE_LABELS[l.commandes?.type ?? ""] ?? l.commandes?.type ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {l.commandes?.monture_source === "donnee"
                          ? "Donnée"
                          : l.commandes?.monture_source === "boutique"
                            ? "Boutique"
                            : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <SourceInlineChip source={l.source_correction} />
                      </td>

                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmt(Number(l.commandes?.montant ?? 0))} DH
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-primary/30 bg-primary/5">
                    <td colSpan={4} className="px-4 py-3 text-right text-base font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-2xl font-bold tabular-nums text-primary">
                      {fmt(total)} DH
                    </td>
                  </tr>
                </tfoot>

              </table>
            </div>
          </div>

          {/* Statut & Action */}
          <div className="rounded-xl border border-border bg-card p-4">
            {(row.prix_monture != null || row.prix_verre != null) && (
              <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Informations de remboursement
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Prix monture</div>
                    <div className="font-semibold tabular-nums">
                      {fmt(Number(row.prix_monture ?? 0))} DH
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Prix verre</div>
                    <div className="font-semibold tabular-nums">
                      {fmt(Number(row.prix_verre ?? 0))} DH
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="font-bold tabular-nums text-primary">
                      {fmt(Number(row.total_remboursement ?? (Number(row.prix_monture ?? 0) + Number(row.prix_verre ?? 0))))} DH
                    </div>
                  </div>
                </div>
              </div>
            )}
            {row.statut === "livree" && (
              <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                ✅ Demande livrée — lecture seule
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Statut actuel :</span>
                <StatutBadge statut={row.statut} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin && row.statut !== "en_attente" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddJustifsOpen(true)}
                  >
                    <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                    📎 Ajouter justificatifs
                  </Button>
                )}
                {isAdmin && row.statut !== "livree" && (
                  <>
                    {row.statut === "en_attente" ? (
                      <Button
                        onClick={() => setMarkOpen(true)}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Marquer comme remplie
                      </Button>
                    ) : (
                      <Button
                        onClick={() => unmarkMut.mutate()}
                        disabled={unmarkMut.isPending}
                        className="bg-amber-500 text-white hover:bg-amber-600"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Remettre en attente
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Statut livraison :</span>
                <MutuelleLivraisonToggle id={row.id} livree={!!row.livree} canEdit={false} badgeOnly />
                {row.livree && row.livree_at && (
                  <span className="text-xs text-muted-foreground">
                    le {new Date(row.livree_at).toLocaleString("fr-FR")}
                  </span>
                )}
              </div>
              {canEdit && (
                <MutuelleLivraisonToggle id={row.id} livree={!!row.livree} canEdit statut={row.statut} />
              )}
            </div>
            {row.statut === "en_attente" && canEdit && (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Supprimer
                </Button>
              </div>
            )}
          </div>

          {(isAdmin || role === "agent_vente") && (
            <MutuelleJustifsBlock demandeId={row.id} readOnly={!isAdmin} />
          )}

          {/* Historique */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <HistoryIcon className="mr-2 h-4 w-4" /> Historique
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun événement.</p>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between border-b border-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="text-sm">
                      <span className="font-medium">{historyLabel(h)}</span>
                      <div className="text-xs text-muted-foreground">
                        par {h.personnel?.name ?? "—"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.changed_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Informations */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Informations
            </h3>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <InfoCol
                label="Date de création"
                value={new Date(row.created_at).toLocaleString("fr-FR")}
              />
              <InfoCol
                label="Créée par"
                value={row.created_by_personnel?.name ?? "—"}
              />
              <InfoCol
                label="Date remplie"
                value={
                  row.remplie_at ? new Date(row.remplie_at).toLocaleString("fr-FR") : "—"
                }
              />
              <InfoCol
                label="Remplie par"
                value={row.remplie_by_personnel?.name ?? "—"}
              />
            </div>
          </div>
        </div>
      )}

      {row && (
        <MutuellePrintAuto
          open={printOpen}
          onOpenChange={setPrintOpen}
          numeroDemande={row.numero_demande}
          clientOrigineNom={row.clients?.nom_complet ?? null}
          clientOrigineDateNaissance={row.clients?.date_naissance ?? null}
          beneficiaireNom={row.beneficiaire_nom ?? null}
          beneficiaireDateNaissance={row.beneficiaire_date_naissance ?? null}
          beneficiaireOrganisme={row.beneficiaire_organisme ?? null}
          organisme={row.organisme}
          source={row.source_correction}
          statut={row.statut}
          createdAt={row.created_at}
          dette={dette}
          commandes={links.map((l) => ({
            numero_commande: l.commandes?.numero_commande ?? null,
            type: l.commandes?.type ?? "",
            monture_source: l.commandes?.monture_source ?? null,
            montant: Number(l.commandes?.montant ?? 0),
          }))}
          total={total}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer la demande {row?.numero_demande ?? ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La demande mutuelle sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMut.mutate();
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MarkRemplieDialog
        open={markOpen}
        onOpenChange={setMarkOpen}
        demandeId={id}
        onDone={invalidateAll}
      />

      <AddJustifsDialog
        open={addJustifsOpen}
        onOpenChange={setAddJustifsOpen}
        demandeId={id}
        onDone={invalidateAll}
      />
    </DashboardShell>
  );
}

function historyLabel(h: MutuelleHistoryEntry): string {
  if (h.event_type === "created") return "Demande créée";
  if (h.event_type === "statut_remplie") return "Statut → Remplie";
  if (h.event_type === "statut_en_attente") return "Statut → En attente";
  if (h.event_type === "statut_livraison_livree") return "Statut livraison → Livrée";
  if (h.event_type === "statut_livraison_pas_livree")
    return "Statut livraison → Pas encore livrée";
  return h.event_type;
}

function InfoCol({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function BeneficiaireEditor({
  demandeId,
  currentNom,
  currentDate,
  currentOrganisme,
}: {
  demandeId: string;
  currentNom: string | null;
  currentDate: string | null;
  currentOrganisme: string | null;
}) {
  const qc = useQueryClient();
  const doUpdate = useServerFn(updateDemandeBeneficiaire);

  const initial: BeneficiaireValues = currentNom
    ? {
        on: true,
        nom: currentNom,
        date: currentDate ?? "",
        organisme:
          currentOrganisme && MUTUELLE_OPTIONS.includes(currentOrganisme as never)
            ? currentOrganisme
            : currentOrganisme
              ? "Autre"
              : "",
        organismeAutre:
          currentOrganisme && !MUTUELLE_OPTIONS.includes(currentOrganisme as never)
            ? currentOrganisme
            : "",
      }
    : emptyBeneficiaire();

  const [values, setValues] = useState<BeneficiaireValues>(initial);

  const mut = useMutation({
    mutationFn: () =>
      doUpdate({
        data: {
          id: demandeId,
          beneficiaire: values.on
            ? {
                nom: values.nom.trim(),
                date_naissance: values.date,
                organisme: resolveBeneficiaireOrganisme(values),
              }
            : null,
        },
      }),
    onSuccess: () => {
      toast.success(
        values.on ? "Bénéficiaire enregistré" : "Bénéficiaire supprimé",
      );
      qc.invalidateQueries({ queryKey: ["mutuelle", demandeId] });
      qc.invalidateQueries({ queryKey: ["mutuelles-list"] });
      qc.invalidateQueries({ queryKey: ["mutuelles-client"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = isBeneficiaireValid(values);
  const wasOn = !!currentNom;
  const dirty =
    values.on !== wasOn ||
    (values.on &&
      (values.nom.trim() !== (currentNom ?? "") ||
        values.date !== (currentDate ?? "") ||
        resolveBeneficiaireOrganisme(values) !== (currentOrganisme ?? "")));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <BeneficiaireFormBlock values={values} onChange={setValues} />
      {(dirty || values.on) && (
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !valid || !dirty}
          >
            Enregistrer
          </Button>
        </div>
      )}
    </div>
  );
}
