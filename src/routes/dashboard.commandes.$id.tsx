import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, History as HistoryIcon, AlertTriangle, MessageCircle, User, ClipboardCopy, Check, Printer } from "lucide-react";
import { CommanderFournisseurDialog } from "@/components/CommanderFournisseurDialog";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { BackButton } from "@/components/BackButton";
import { buildCorrectionClipboard } from "@/lib/correction-format";
import { formatCorrectionDisplay } from "@/lib/correction-display";
import { printCorrection } from "@/lib/print-correction";
import { CorrectionAnnexesList } from "@/components/CorrectionAnnexesList";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAuth } from "@/lib/auth";
import {
  getCommande,
  changeCommandeStatus,
  allowedNextStatuses,
  COMMANDE_STATUSES,
  markMontureClientCalled,
  markMontureClientReceived,
  markReceptionClientCalled,
  deliverCommande,
  submitQualityCheck,
  listCommandeVersements,
  restoreCommande,
  resolveCasse,
  type CommandeStatus,
  type AppRole,
  type PaymentMode,
} from "@/lib/commandes.functions";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  TYPE_LABELS,
  MONTURE_EVENT_LABELS,
  CASSE_EYE_LABELS,
  EYES_ORDERED_LABELS,
} from "@/lib/commande-labels";
import { Phone, PackageCheck, CheckCircle2, RefreshCw } from "lucide-react";
import { CasseDialog, type CasseEye } from "@/components/CasseDialog";
import { LivraisonDialog } from "@/components/LivraisonDialog";
import { QualityCheckDialog, type QualityCheckPayload } from "@/components/QualityCheckDialog";
import { ROLE_LABELS, type AppRole as AuthRole } from "@/lib/auth";

import { pickupWhatsappNumber, type WhatsappMessageKind } from "@/lib/whatsapp-pickup";
import { PickupWhatsappDialog } from "@/components/PickupWhatsappDialog";
import { CommandePaiementBlock } from "@/components/CommandePaiementBlock";
import { ReclamationBlock } from "@/components/ReclamationBlock";
import { WorkSheetDialog } from "@/components/WorkSheetDialog";
import { EditCommandeInfosDialog } from "@/components/EditCommandeInfosDialog";
import { FileText, Pencil, Trash2, Undo2 } from "lucide-react";


function CopyCorrectionButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Impossible de copier");
        }
      }}
    >
      {copied ? (
        <>
          <Check className="mr-1.5 h-3.5 w-3.5" /> Copié ✓
        </>
      ) : (
        <>
          <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Copier correction
        </>
      )}
    </Button>
  );
}

// Format de copie : voir src/lib/correction-format.ts


export const Route = createFileRoute("/dashboard/commandes/$id")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente", "agent_montage"]}>
      <CommandeDetailPage />
    </RoleGuard>
  ),
});

function CommandeDetailPage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchOne = useServerFn(getCommande);
  const doChange = useServerFn(changeCommandeStatus);
  const doMarkCalled = useServerFn(markMontureClientCalled);
  const doMarkReceived = useServerFn(markMontureClientReceived);
  const doMarkReceptionCalled = useServerFn(markReceptionClientCalled);
  const doDeliver = useServerFn(deliverCommande);
  const doQuality = useServerFn(submitQualityCheck);
  const doRestore = useServerFn(restoreCommande);
  const doResolveCasse = useServerFn(resolveCasse);

  const { data, isLoading } = useQuery({
    queryKey: ["commande", id],
    queryFn: () => fetchOne({ data: { id } }),
  });

  const cmd = data as any;

  const fetchVersements = useServerFn(listCommandeVersements);
  const { data: versements = [] } = useQuery({
    queryKey: ["commande-versements", id],
    queryFn: () => fetchVersements({ data: { id } }),
  });
  const sumVersements = useMemo(
    () => (versements as any[]).reduce((s, v) => s + Number(v.amount), 0),
    [versements],
  );
  const resteAffiche = cmd
    ? Math.max(0, Number(cmd.montant ?? 0) - Number(cmd.avance ?? 0) - sumVersements)
    : 0;

  const isClientFrame = cmd?.monture_source === "donnee";
  const clientProvided = cmd?.monture_client_provided === true;
  const needsClientFrame = isClientFrame && !clientProvided;
  const montureCalled = Boolean(cmd?.monture_client_called_at);
  const montureReceived = Boolean(cmd?.monture_client_received_at);
  const showMontureAlert =
    needsClientFrame &&
    !montureReceived &&
    cmd?.status &&
    ["verre_recu", "en_montage"].includes(cmd.status);
  const blockedEnMontage = needsClientFrame && !montureReceived;

  const nextOptions = useMemo<CommandeStatus[]>(() => {
    if (!cmd || !role) return [];
    return allowedNextStatuses(role as AppRole, cmd.status as CommandeStatus, (cmd as any).type);
  }, [cmd, role]);

  const [selectedNext, setSelectedNext] = useState<CommandeStatus | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [casseOpen, setCasseOpen] = useState(false);
  const [livraisonOpen, setLivraisonOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [workSheetOpen, setWorkSheetOpen] = useState(false);
  const [editInfosOpen, setEditInfosOpen] = useState(false);
  const [commanderFournisseurOpen, setCommanderFournisseurOpen] = useState(false);
  const [commanderCasseOpen, setCommanderCasseOpen] = useState(false);

  const changeMut = useMutation({
    mutationFn: (
      casse?: { casse_eye: CasseEye; casse_note: string | null },
    ) =>
      doChange({
        data: {
          id,
          new_status: selectedNext as CommandeStatus,
          ...(casse
            ? { casse_eye: casse.casse_eye, casse_note: casse.casse_note }
            : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      if (
        selectedNext === "verre_recu" &&
        needsClientFrame &&
        cmd?.clients?.nom_complet
      ) {
        toast(
          `📞 ${cmd.numero_commande ?? ""} — Verre reçu. Appeler ${cmd.clients.nom_complet} pour qu'il apporte sa monture avant de démarrer le montage.`,
          { duration: 10000 },
        );
      }
      if (selectedNext === "en_reception" && cmd?.clients?.nom_complet) {
        toast(
          `📞 Commande ${cmd.numero_commande ?? ""} — En réception. Appeler ${cmd.clients.nom_complet} pour qu'il vienne récupérer ses lunettes.`,
          { duration: 10000 },
        );
      }
      setSelectedNext("");
      setConfirmOpen(false);
      setCasseOpen(false);
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmOpen(false);
      setCasseOpen(false);
    },
  });

  const markCasseSentMut = useMutation({
    mutationFn: () =>
      doChange({
        data: { id, new_status: "verre_commande" as CommandeStatus },
      }),
    onSuccess: () => {
      toast.success("Casse marquée comme envoyée au fournisseur");
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const calledMut = useMutation({
    mutationFn: (vars?: { via_app?: boolean }) =>
      doMarkCalled({ data: { id, via_app: vars?.via_app } }),
    onSuccess: () => {
      toast.success("Appel client enregistré");
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receivedMut = useMutation({
    mutationFn: () => doMarkReceived({ data: { id } }),
    onSuccess: () => {
      toast.success("Monture client reçue");
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const receptionCalledMut = useMutation({
    mutationFn: (vars?: { via_app?: boolean }) =>
      doMarkReceptionCalled({ data: { id, via_app: vars?.via_app } }),
    onSuccess: () => {
      toast.success("Appel client enregistré");
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deliverMut = useMutation({
    mutationFn: (payload: {
      amount: number;
      payment_mode: PaymentMode;
      note: string | null;
      livrer_mutuelle_demande_id: string | null;
    }) => doDeliver({ data: { id, ...payload } }),
    onSuccess: () => {
      toast.success("Livraison confirmée");
      setSelectedNext("");
      setLivraisonOpen(false);
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
      qc.invalidateQueries({ queryKey: ["commande-mutuelle", id] });
      qc.invalidateQueries({ queryKey: ["mutuelle"] });
      qc.invalidateQueries({ queryKey: ["mutuelles-list"] });
      qc.invalidateQueries({ queryKey: ["mutuelles-client"] });
      qc.invalidateQueries({ queryKey: ["commande-versements", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qualityMut = useMutation({
    mutationFn: (payload: QualityCheckPayload) =>
      doQuality({ data: { id, checks: payload } }),
    onSuccess: (res: any) => {
      const declared = res?.reclamation_detail != null;
      toast.success(declared ? "Réclamation déclarée" : "Verre reçu — contrôle OK");
      setSelectedNext("");
      setQualityOpen(false);
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const restoreMut = useMutation({
    mutationFn: () => doRestore({ data: { id } }),
    onSuccess: () => {
      toast.success("Commande rétablie");
      setRestoreConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveCasseMut = useMutation({
    mutationFn: () => doResolveCasse({ data: { id } }),
    onSuccess: () => {
      toast.success("Verre de remplacement reçu — casse résolue");
      qc.invalidateQueries({ queryKey: ["commande", id] });
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reclamationDetail = cmd?.reclamation_detail ?? null;
  const reclamationActive = reclamationDetail && !(cmd as any)?.reclamation_resolved_at;
  const reclamationOD =
    reclamationActive && (reclamationDetail?.od === "manquant" || reclamationDetail?.od === "errone");
  const reclamationOG =
    reclamationActive && (reclamationDetail?.og === "manquant" || reclamationDetail?.og === "errone");
  const hasActiveReclamation = reclamationOD || reclamationOG;
  const eyesToCheck: "od" | "og" | "both" = hasActiveReclamation
    ? reclamationOD && reclamationOG
      ? "both"
      : reclamationOD
      ? "od"
      : "og"
    : cmd?.casse_eye && cmd.casse_eye !== "both"
    ? (cmd.casse_eye as "od" | "og")
    : ((cmd?.eyes_ordered as "od" | "og" | "both" | null) ?? "both");


  const guardRole =
    role === "agent_vente"
      ? "agent_vente"
      : role === "agent_montage"
      ? "agent_montage"
      : "admin";

  return (
    <DashboardShell
      role={guardRole}
      title="Détail commande"
      subtitle=""
      accent={
        guardRole === "admin"
          ? "bg-primary"
          : guardRole === "agent_vente"
          ? "bg-emerald-500"
          : "bg-amber-500"
      }
    >
      <div className="mb-4">
        <BackButton fallback="/dashboard/commandes" />
      </div>

      {isLoading || !cmd ? (
        <div className="text-muted-foreground">Chargement…</div>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            <Card className={cmd.urgent && cmd.status !== "livree" ? "border-red-500/60 bg-red-500/5" : ""}>
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate font-mono text-sm text-muted-foreground">
                        {cmd.numero_commande ?? "—"}
                      </p>
                      {cmd.urgent && cmd.status !== "livree" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Urgent
                        </span>
                      )}
                    </div>
                    {cmd.based_on && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({
                            to: "/dashboard/commandes/$id",
                            params: { id: cmd.based_on.id },
                          })
                        }
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Basée sur {cmd.based_on.numero_commande ?? "la commande d'origine"}
                      </button>
                    )}
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="min-w-0 max-w-full break-words text-xl font-semibold sm:text-2xl">
                        {cmd.clients?.nom_complet ?? "—"}
                      </h2>
                      {cmd.client_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate({
                              to: "/dashboard/clients/$id",
                              params: { id: cmd.client_id },
                            })
                          }
                        >
                          <User className="mr-1.5 h-3.5 w-3.5" />
                          Voir fiche client
                        </Button>
                      )}
                      {cmd.clients?.mutuelle && (
                        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {cmd.clients.mutuelle === "Autre"
                            ? cmd.clients.mutuelle_autre || "Autre"
                            : cmd.clients.mutuelle}
                        </span>
                      )}
                      {isClientFrame && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                            clientProvided
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          Monture client — {clientProvided ? "Fournie" : "Non fournie"}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
                        {TYPE_LABELS[cmd.type] ?? cmd.type}
                      </span>
                      {cmd.prescriptions?.date_prescription && (
                        <button
                          type="button"
                          onClick={() => {
                            if (cmd.client_id && cmd.prescription_id) {
                              navigate({
                                to: "/dashboard/clients/$id",
                                params: { id: cmd.client_id },
                                hash: `prescription-${cmd.prescription_id}`,
                              });
                            }
                          }}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Correction du{" "}
                          {new Date(
                            cmd.prescriptions.date_prescription,
                          ).toLocaleDateString("fr-FR")}
                        </button>
                      )}
                      {cmd.prescriptions?.type && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                            cmd.prescriptions.type === "interne"
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
                          }`}
                        >
                          MDC : {cmd.prescriptions.type === "interne" ? "NON" : "OUI"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col items-stretch gap-1.5 sm:items-end">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${STATUS_COLORS[cmd.status as CommandeStatus]}`}
                    >
                      {STATUS_LABELS[cmd.status as CommandeStatus]}
                    </span>
                    {cmd.deleted_at && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimée
                      </span>
                    )}
                    {cmd.status === "commande_creee" && role !== "agent_montage" && !cmd.deleted_at && (
                      <Button
                        size="sm"
                        onClick={() => setCommanderFournisseurOpen(true)}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                        Commander au fournisseur
                      </Button>
                    )}
                    {cmd.casse_eye && cmd.casse_at && !cmd.casse_resolved_at && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Casse {CASSE_EYE_LABELS[cmd.casse_eye] ?? cmd.casse_eye}
                      </span>
                    )}
                    {cmd.status === "livree" &&
                      (role === "admin" || role === "agent_vente") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            navigate({
                              to: "/dashboard/commandes/new",
                              search: { reorder_from: cmd.id },
                            })
                          }
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          Commander à nouveau
                        </Button>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <ReclamationBlock commande={cmd} />


            {cmd.casse_eye && cmd.casse_at && !cmd.casse_resolved_at && (
              <Card className="border-red-500/60 bg-red-500/5">
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div className="flex-1 space-y-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                            Casse au montage
                          </h3>
                          {cmd.casse_sent_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              <PackageCheck className="h-3 w-3" /> Envoyé
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm">
                          Œil(s) concerné(s) :{" "}
                          <span className="font-semibold">
                            {CASSE_EYE_LABELS[cmd.casse_eye] ?? cmd.casse_eye}
                          </span>
                        </p>
                        <p className="text-sm">
                          À recommander :{" "}
                          <span className="font-semibold text-red-700 dark:text-red-300">
                            {CASSE_EYE_LABELS[cmd.casse_eye] ?? cmd.casse_eye}
                          </span>
                        </p>
                        {cmd.casse_note && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Note : {cmd.casse_note}
                          </p>
                        )}
                        {cmd.casse_at && (
                          <p className="text-xs text-muted-foreground">
                            Déclaré le{" "}
                            {new Date(cmd.casse_at).toLocaleString("fr-FR")}
                          </p>
                        )}
                        {cmd.casse_sent_at && (
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">
                            Recommandé le{" "}
                            {new Date(cmd.casse_sent_at).toLocaleString("fr-FR")}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(role === "admin" || role === "agent_vente") && (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setCommanderCasseOpen(true)}
                            >
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                              {cmd.casse_sent_at
                                ? "Renvoyer sur WhatsApp"
                                : "Recommander le verre cassé"}
                            </Button>
                            {!cmd.casse_sent_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={markCasseSentMut.isPending}
                                onClick={() => markCasseSentMut.mutate()}
                              >
                                Marquer comme envoyée
                              </Button>
                            )}
                          </>
                        )}
                        {cmd.casse_sent_at &&
                          (role === "admin" || role === "agent_montage") && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              disabled={resolveCasseMut.isPending}
                              onClick={() => resolveCasseMut.mutate()}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Verre de remplacement reçu
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {showMontureAlert && (
              <Card className="border-amber-500/60 bg-amber-500/5">
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        {montureCalled
                          ? "✅ Client déjà appelé — en attente de la monture"
                          : "⚠️ En attente de la monture client — appel requis"}
                      </p>
                      <CallClientLink
                        name={cmd.clients?.nom_complet ?? null}
                        phone={cmd.clients?.telephone ?? null}
                        whatsapp={cmd.clients?.whatsapp ?? null}
                        type={cmd.type ?? null}
                        kind="frame_request"
                        disabled={montureCalled || calledMut.isPending}
                        onCall={() => {
                          if (!montureCalled) calledMut.mutate({ via_app: true } as any);
                        }}
                      />
                      {montureCalled && cmd.monture_client_called_at && (
                        <p className="text-xs text-muted-foreground">
                          Appelé le{" "}
                          {new Date(cmd.monture_client_called_at).toLocaleString("fr-FR")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={montureCalled ? "secondary" : "default"}
                      disabled={montureCalled || calledMut.isPending}
                      onClick={() => calledMut.mutate(undefined)}
                    >
                      <Phone className="mr-1.5 h-3.5 w-3.5" />
                      {montureCalled ? "Appel effectué" : "Marquer comme appelé"}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={receivedMut.isPending}
                      onClick={() => receivedMut.mutate()}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Monture reçue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {cmd.status === "en_reception" && (
              <Card
                className={
                  cmd.reception_client_called_at
                    ? "border-emerald-500/60 bg-emerald-500/5"
                    : "border-amber-500/60 bg-amber-500/5"
                }
              >
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        cmd.reception_client_called_at
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    />
                    <div>
                      <p
                        className={`font-semibold ${
                          cmd.reception_client_called_at
                            ? "text-emerald-900 dark:text-emerald-200"
                            : "text-amber-900 dark:text-amber-200"
                        }`}
                      >
                        {cmd.reception_client_called_at
                          ? "✅ Client appelé — en attente de récupération"
                          : "⚠️ Client à appeler — commande prête à récupérer"}
                      </p>
                      <CallClientLink
                        name={cmd.clients?.nom_complet ?? null}
                        phone={cmd.clients?.telephone ?? null}
                        whatsapp={cmd.clients?.whatsapp ?? null}
                        type={cmd.type ?? null}
                        disabled={
                          Boolean(cmd.reception_client_called_at) ||
                          receptionCalledMut.isPending
                        }
                        onCall={() => {
                          if (!cmd.reception_client_called_at)
                            receptionCalledMut.mutate({ via_app: true });
                        }}
                      />
                      {cmd.reception_client_called_at && (
                        <p className="text-xs text-muted-foreground">
                          Appelé le{" "}
                          {new Date(cmd.reception_client_called_at).toLocaleString("fr-FR")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={cmd.reception_client_called_at ? "secondary" : "default"}
                      disabled={
                        Boolean(cmd.reception_client_called_at) ||
                        receptionCalledMut.isPending
                      }
                      onClick={() => receptionCalledMut.mutate(undefined)}
                    >
                      <Phone className="mr-1.5 h-3.5 w-3.5" />
                      {cmd.reception_client_called_at
                        ? "Appel effectué"
                        : "Marquer comme appelé"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}


            <Card className="bg-muted/30">
              <CardContent className="grid min-w-0 gap-3 p-4 sm:gap-5 sm:p-6 md:grid-cols-2">
                <ProminentInfo label="Date de livraison" value={fmtDate(cmd.date_livraison)} />
                <ProminentInfo label="Fournisseur" value={cmd.fournisseurs?.nom ?? "—"} />
                {cmd.type === "lentilles" ? (
                  <ProminentInfo label="Lentilles" value={cmd.lentilles ?? "—"} />
                ) : (
                  <>
                    <ProminentInfo
                      label="Monture"
                      value={
                        cmd.monture_source === "boutique"
                          ? `Monture boutique${cmd.monture_marque ? ` — ${cmd.monture_marque}` : ""}`
                          : cmd.monture_source === "donnee"
                          ? `Monture client — ${cmd.monture_client_provided ? "Fournie" : "Non fournie"}`
                          : "—"
                      }
                    />
                    <ProminentInfo label="Type de verre" value={cmd.type_verres ?? "—"} />
                  </>
                )}
                <ProminentInfo label="Quantité" value={String(cmd.quantite ?? 1)} />
                {cmd.notes && (
                  <div className="md:col-span-2">
                    <ProminentInfo label="Notes" value={cmd.notes} />
                  </div>
                )}
              </CardContent>
            </Card>


            {(() => {
              const eyes = cmd.eyes_ordered as "both" | "od" | "og" | null | undefined;
              const hasEyes = eyes === "both" || eyes === "od" || eyes === "og";
              const showOD = eyes === "both" || eyes === "od";
              const showOG = eyes === "both" || eyes === "og";
              const showAddition = cmd.type === "progressif" || cmd.type === "double_foyer";
              return (
              <Card id="correction-snapshot">
                <CardContent className="p-4 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Correction (snapshot commande)
                    </h3>
                    <div className="flex items-center gap-2">
                      {hasEyes && (
                        <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          Commande : {EYES_ORDERED_LABELS[eyes!] ?? eyes}
                        </span>
                      )}
                      {hasEyes && (
                        <CopyCorrectionButton
                          text={buildCorrectionClipboard({
                            clientName: cmd.clients?.nom_complet ?? null,
                            showOD,
                            showOG,
                            od: {
                              sphere: cmd.od_sphere,
                              cylinder: cmd.od_cylinder,
                              axe: cmd.od_axe,
                              addition: cmd.od_addition,
                            },
                            og: {
                              sphere: cmd.og_sphere,
                              cylinder: cmd.og_cylinder,
                              axe: cmd.og_axe,
                              addition: cmd.og_addition,
                            },
                          })}
                        />
                      )}
                      {hasEyes && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="print:hidden"
                          onClick={() =>
                            printCorrection({
                              clientName: cmd.clients?.nom_complet ?? null,
                              showOD,
                              showOG,
                              od: {
                                sphere: cmd.od_sphere,
                                cylinder: cmd.od_cylinder,
                                axe: cmd.od_axe,
                                addition: cmd.od_addition,
                              },
                              og: {
                                sphere: cmd.og_sphere,
                                cylinder: cmd.og_cylinder,
                                axe: cmd.og_axe,
                                addition: cmd.og_addition,
                              },
                              showAddition,
                            })
                          }
                        >
                          <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimer correction
                        </Button>
                      )}
                    </div>
                  </div>
                  {!hasEyes ? (
                    <p className="text-sm text-muted-foreground">Yeux non renseignés</p>
                  ) : (
                    <div className={`grid gap-4 ${eyes === "both" ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                      {showOD && (
                        <div className="rounded-lg border border-border p-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Œil droit (OD)</p>
                          <p className="font-mono text-sm">
                            {formatCorrection(cmd.od_sphere, cmd.od_cylinder, cmd.od_axe, cmd.od_addition, showAddition)}
                          </p>
                        </div>
                      )}
                      {showOG && (
                        <div className="rounded-lg border border-border p-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Œil gauche (OG)</p>
                          <p className="font-mono text-sm">
                            {formatCorrection(cmd.og_sphere, cmd.og_cylinder, cmd.og_axe, cmd.og_addition, showAddition)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-4 flex justify-center">
                    <Button
                      size="sm"
                      onClick={() => setWorkSheetOpen(true)}
                      style={{ backgroundColor: "#6366F1", color: "#fff" }}
                      className="hover:opacity-90"
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      📄 Générer fiche
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })()}





            {cmd.prescription_id && role !== "agent_montage" && (
              <CorrectionAnnexesList
                prescriptionId={cmd.prescription_id}
                canDelete={false}
                mode="snapshot"
                closable
              />
            )}

            {cmd.type === "progressif" && cmd.progressive && (

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Mesures progressif
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Info label="EP OD" value={fmtNum(cmd.progressive.ecart_pupillaire_od)} />
                    <Info label="EP OG" value={fmtNum(cmd.progressive.ecart_pupillaire_og)} />
                    <Info label="HP OD" value={fmtNum(cmd.progressive.hauteur_pupillaire_od)} />
                    <Info label="HP OG" value={fmtNum(cmd.progressive.hauteur_pupillaire_og)} />
                    <Info label="Grand diamètre" value={fmtNum(cmd.progressive.grand_diametre)} />
                    <Info label="Hauteur calibre" value={fmtNum(cmd.progressive.hauteur_calibre)} />
                    <Info label="Pont" value={fmtNum(cmd.progressive.pont)} />
                  </div>
                </CardContent>
              </Card>
            )}

            {role !== "agent_montage" && cmd.status !== "livree" && cmd.status !== "finalise" && cmd.status !== "finalisee" && !cmd.deleted_at && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => setEditInfosOpen(true)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Modifier les infos de la commande
                </Button>
              </div>
            )}


            <Card>
              <CardContent className="p-4 sm:p-6">
                <h3 className="mb-4 flex items-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <HistoryIcon className="mr-2 h-4 w-4" /> Historique
                </h3>
                <div className="space-y-3">
                  {(cmd.history as any[]).length === 0 && (
                    <p className="text-sm text-muted-foreground">Aucun changement.</p>
                  )}
                  {(cmd.history as any[]).map((h) => {
                    const s = h.new_status as string;
                    const montureLabel = MONTURE_EVENT_LABELS[s];
                    const isCasseEvent = s?.startsWith("monture_casse_");

                    // Sub-line details for contextual entries
                    const detailLines: string[] = [];
                    let overrideTitle: string | null = null;
                    if (s === "monture_casse_od") {
                      overrideTitle = "Casse montage signalée";
                      detailLines.push("Casse OD");
                    } else if (s === "monture_casse_og") {
                      overrideTitle = "Casse montage signalée";
                      detailLines.push("Casse OG");
                    } else if (s === "monture_casse_both") {
                      overrideTitle = "Casse montage signalée";
                      detailLines.push("Casse OD + OG");
                    } else if (s === "reception_partielle_od") {
                      overrideTitle = "Réception partielle";
                      detailLines.push("OD reçu");
                    } else if (s === "reception_partielle_og") {
                      overrideTitle = "Réception partielle";
                      detailLines.push("OG reçu");
                    } else if (s === "reclamation_declaree") {
                      overrideTitle = "Réclamation déclarée";
                      const d = (cmd.reclamation_detail ?? {}) as {
                        od?: string | null;
                        og?: string | null;
                      };
                      if (d.od === "manquant") detailLines.push("OD manquant");
                      if (d.od === "errone")
                        detailLines.push("OD erroné — correction reçue incorrecte");
                      if (d.og === "manquant") detailLines.push("OG manquant");
                      if (d.og === "errone")
                        detailLines.push("OG erroné — correction reçue incorrecte");
                    } else if (
                      (s === "paiement_montant_modifie" || s === "paiement_avance_modifie") &&
                      h.old_status
                    ) {
                      detailLines.push(`Ancienne valeur → nouvelle : ${h.old_status}`);
                    } else if (s === "infos_modifiees") {
                      overrideTitle = "✏️ Infos commande modifiées";
                      if (h.old_status) {
                        for (const line of String(h.old_status).split("\n")) {
                          if (line.trim()) detailLines.push(line);
                        }
                      }
                    } else if (s === "commande_supprimee") {
                      overrideTitle = "🗑️ Commande supprimée";
                      if (h.old_status) {
                        detailLines.push(`Motif : ${h.old_status}`);
                      }
                    } else if (s === "commande_retablie") {
                      overrideTitle = "↩️ Commande rétablie";
                    }



                    return (
                      <div
                        key={h.id}
                        className="flex items-center justify-between border-b border-border pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="text-sm">
                          {overrideTitle ? (
                            <span className="font-medium">{overrideTitle}</span>
                          ) : montureLabel ? (
                            <span className="font-medium">{montureLabel}</span>
                          ) : (
                            <>
                              <span className="font-medium">
                                {h.old_status
                                  ? STATUS_LABELS[h.old_status as CommandeStatus]
                                  : "Création"}
                              </span>{" "}
                              →{" "}
                              <span className="font-medium">
                                {STATUS_LABELS[h.new_status as CommandeStatus] ??
                                  h.new_status}
                              </span>
                            </>
                          )}
                          {detailLines.map((line, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              ↳ {line}
                            </p>
                          ))}
                          {isCasseEvent && h.old_status && (
                            <p className="text-xs italic text-muted-foreground">
                              Note : {h.old_status}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {h.personnel?.name ?? h.personnel?.email ?? "—"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.changed_at).toLocaleString("fr-FR")}
                        </span>
                      </div>
                    );
                  })}

                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side column */}
          <div className="min-w-0 space-y-6">
            {role !== "agent_montage" && (
              <Card>
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <CommandePaiementBlock
                    commandeId={cmd.id}
                    montant={Number(cmd.montant)}
                    avance={Number(cmd.avance)}
                    caisseLabel={cmd.caisses?.label ?? (cmd.caisse_id ? "Caisse" : "—")}
                    status={cmd.status}
                    isDeleted={Boolean(cmd.deleted_at)}
                    numeroCommande={cmd.numero_commande ?? null}
                    clientName={cmd.clients?.nom_complet ?? null}
                    clientPhone={cmd.clients?.telephone ?? null}
                    type={(cmd as any).type ?? null}
                    montureSource={(cmd as any).monture_source ?? null}
                    dateCreation={(cmd as any).created_at ?? null}
                    dateLivraison={(cmd as any).date_livraison ?? null}
                    commandeCaisseId={(cmd as any).caisse_id ?? null}
                    montantModified={(cmd.history as any[]).some(
                      (h) => h.new_status === "paiement_montant_modifie",
                    )}
                    avanceModified={(cmd.history as any[]).some(
                      (h) => h.new_status === "paiement_avance_modifie",
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {cmd.deleted_at ? (
              <Card className="border-red-500/60 bg-red-500/5">
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                        Commande supprimée
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Impossible de changer le statut tant qu'elle n'est pas
                        rétablie.
                      </p>
                      {cmd.deletion_reason && (
                        <p className="text-xs text-muted-foreground">
                          Motif : {cmd.deletion_reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <Select value="" disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Changement de statut désactivé" />
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                  {(role === "admin" || role === "agent_vente") && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => setRestoreConfirmOpen(true)}
                      disabled={restoreMut.isPending}
                    >
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                      Rétablir la commande
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : nextOptions.length > 0 &&
              !(
                cmd?.status === "casse_montage" &&
                (role === "admin" || role === "agent_vente")
              ) ? (
              <Card>
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Changer le statut
                  </h3>
                  <Select
                    value={selectedNext}
                    onValueChange={(v) => setSelectedNext(v as CommandeStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nouveau statut…" />
                    </SelectTrigger>
                    <SelectContent>
                      {nextOptions.map((s) => {
                        const disabled = s === "en_montage" && blockedEnMontage;
                        return (
                          <SelectItem key={s} value={s} disabled={disabled}>
                            {STATUS_LABELS[s]}
                            {disabled ? " (monture client requise)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>

                  </Select>
                  <Button
                    className="w-full"
                    variant={selectedNext === "casse_montage" ? "destructive" : "default"}
                    disabled={!selectedNext}
                    onClick={() => {
                      if (selectedNext === "casse_montage") {
                        setCasseOpen(true);
                      } else if (selectedNext === "livree") {
                        setLivraisonOpen(true);
                      } else if (selectedNext === "verre_recu") {
                        setQualityOpen(true);
                      } else {
                        setConfirmOpen(true);
                      }
                    }}
                  >
                    {selectedNext === "casse_montage" ? "Signaler la casse" : "Appliquer"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Aucune action disponible sur ce statut pour votre rôle.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le changement</AlertDialogTitle>
            <AlertDialogDescription>
              Passer cette commande au statut «{" "}
              {selectedNext ? STATUS_LABELS[selectedNext as CommandeStatus] : ""} » ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                changeMut.mutate(undefined);
              }}
              disabled={changeMut.isPending}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CasseDialog
        open={casseOpen}
        onOpenChange={setCasseOpen}
        numeroCommande={cmd?.numero_commande}
        eyesOrdered={(cmd?.eyes_ordered as "od" | "og" | "both" | null | undefined) ?? null}
        isPending={changeMut.isPending}
        onConfirm={(payload) => changeMut.mutate(payload)}
      />

      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rétablir la commande</AlertDialogTitle>
            <AlertDialogDescription>
              {cmd?.numero_commande ? `${cmd.numero_commande} — ` : ""}
              La commande sera rétablie à son dernier statut
              {cmd?.status_before_delete
                ? ` « ${STATUS_LABELS[cmd.status_before_delete as CommandeStatus] ?? cmd.status_before_delete} »`
                : ""}
              . Cette action sera enregistrée dans l'historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMut.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                restoreMut.mutate();
              }}
            >
              {restoreMut.isPending ? "Rétablissement…" : "Rétablir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LivraisonDialog
        commandeId={livraisonOpen ? id : null}
        open={livraisonOpen}
        onOpenChange={(o) => {
          setLivraisonOpen(o);
          if (!o) setSelectedNext("");
        }}
        isPending={deliverMut.isPending}
        onConfirm={(payload) => deliverMut.mutate(payload)}
      />
      <QualityCheckDialog
        open={qualityOpen}
        onOpenChange={(o) => {
          setQualityOpen(o);
          if (!o) setSelectedNext("");
        }}
        numeroCommande={cmd?.numero_commande}
        eyesToCheck={eyesToCheck}
        isPending={qualityMut.isPending}
        onConfirm={(payload) => qualityMut.mutate(payload)}
        od={
          cmd
            ? {
                sphere: (cmd as any).od_sphere ?? null,
                cylinder: (cmd as any).od_cylinder ?? null,
                axe: (cmd as any).od_axe ?? null,
                addition: (cmd as any).od_addition ?? null,
              }
            : null
        }
        og={
          cmd
            ? {
                sphere: (cmd as any).og_sphere ?? null,
                cylinder: (cmd as any).og_cylinder ?? null,
                axe: (cmd as any).og_axe ?? null,
                addition: (cmd as any).og_addition ?? null,
              }
            : null
        }
        showAddition={(cmd as any)?.type !== "lentilles"}
        isProgressif={(cmd as any)?.type === "progressif"}
        progressive={(cmd as any)?.progressive ?? null}
      />
      <CommanderFournisseurDialog
        commandeId={commanderFournisseurOpen ? id : null}
        open={commanderFournisseurOpen}
        onOpenChange={setCommanderFournisseurOpen}
      />
      <CommanderFournisseurDialog
        commandeId={commanderCasseOpen ? id : null}
        open={commanderCasseOpen}
        onOpenChange={setCommanderCasseOpen}
        casseMode
      />

      {cmd && (
        <EditCommandeInfosDialog
          open={editInfosOpen}
          onOpenChange={setEditInfosOpen}
          commande={cmd}
        />
      )}

      {cmd && (

        <WorkSheetDialog
          open={workSheetOpen}
          onOpenChange={setWorkSheetOpen}
          numeroCommande={cmd.numero_commande ?? null}
          clientName={cmd.clients?.nom_complet ?? null}
          dateNaissance={cmd.clients?.date_naissance ?? null}
          telephone={cmd.clients?.telephone ?? null}
          prescriptionType={cmd.prescriptions?.type ?? null}
          type={cmd.type ?? null}
          lentilleType={(cmd as any).lentille_type ?? null}

          od={{
            sphere: cmd.od_sphere,
            cylinder: cmd.od_cylinder,
            axe: cmd.od_axe,
            addition: cmd.od_addition,
          }}
          og={{
            sphere: cmd.og_sphere,
            cylinder: cmd.og_cylinder,
            axe: cmd.og_axe,
            addition: cmd.og_addition,
          }}
          eyesOrdered={cmd.eyes_ordered ?? null}
          typeVerres={cmd.type_verres ?? null}
          modeleLentilles={cmd.lentilles ?? null}
          notes={cmd.notes ?? null}
          montureSource={cmd.monture_source ?? null}
          montureMarque={cmd.monture_marque ?? null}
          montureClientProvided={cmd.monture_client_provided ?? null}
          progressive={cmd.progressive ?? null}
          total={Number(cmd.montant ?? 0)}
          avance={Number(cmd.avance ?? 0)}
          reste={resteAffiche}
          verreCommandeLe={
            (cmd.history as any[])?.find(
              (h: any) => h.new_status === "verre_commande",
            )?.changed_at ?? null
          }
          dateLivraison={cmd.date_livraison ?? null}
          deleted={Boolean(cmd.deleted_at)}
        />
      )}
    </DashboardShell>

  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function ProminentInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-base font-medium text-foreground">{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}
function fmtMoney(n: number | null | undefined) {
  return `${Number(n ?? 0).toFixed(2)}`;
}
function fmtNum(n: number | null | undefined) {
  return n == null ? "—" : String(n);
}
function fmtOptic(n: number | null | undefined) {
  if (n == null) return "—";
  const num = Number(n);
  if (num === 0) return "Plan";
  const txt = num.toFixed(2);
  return num > 0 ? `+${txt}` : txt;
}
function fmtSigned(n: number) {
  const txt = n.toFixed(2);
  return n > 0 ? `+${txt}` : txt;
}
const formatCorrection = formatCorrectionDisplay;

function CallClientLink({
  name,
  phone,
  whatsapp,
  type,
  disabled,
  onCall,
  kind = "pickup",
}: {
  name: string | null;
  phone: string | null;
  whatsapp?: string | null;
  type?: string | null;
  disabled?: boolean;
  onCall: () => void;
  kind?: WhatsappMessageKind;
}) {
  const { role } = useAuth();
  const displayName = name?.trim() || "Client";
  // Agent montage: pas d'accès aux liens de contact (tel / WhatsApp)
  if (role === "agent_montage") return null;
  if (!phone) {
    return (
      <p className="mt-1 text-xs text-muted-foreground italic">
        {displayName} — Aucun numéro enregistré pour ce client
      </p>
    );
  }
  const href = `tel:${phone.replace(/\s+/g, "")}`;
  const waNumber = pickupWhatsappNumber(phone, whatsapp ?? null);
  const [waOpen, setWaOpen] = useState(false);
  return (
    <div className="mt-1 flex min-w-0 flex-col items-start gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <a
        href={href}
        onClick={() => {
          if (!disabled) onCall();
        }}
        className="inline-flex min-w-0 max-w-full items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
        aria-disabled={disabled}
      >
        <Phone className="h-3 w-3 shrink-0" />
        <span className="break-words">Appeler {displayName} — {phone}</span>
      </a>
      {waNumber && (
        <button
          type="button"
          onClick={() => setWaOpen(true)}
          className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300 underline-offset-2 hover:underline"
        >
          <MessageCircle className="h-3 w-3" />
          Envoyer sur WhatsApp
        </button>
      )}
      <PickupWhatsappDialog
        open={waOpen}
        onOpenChange={setWaOpen}
        clientName={name}
        telephone={phone}
        whatsapp={whatsapp ?? null}
        type={type ?? null}
        kind={kind}
      />
    </div>
  );
}


