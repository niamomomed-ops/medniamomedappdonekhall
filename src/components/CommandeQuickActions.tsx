import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Zap, Phone, CheckCircle2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  allowedNextStatuses,
  changeCommandeStatus,
  markMontureClientCalled,
  markMontureClientReceived,
  deliverCommande,
  submitQualityCheck,
  markReclamationSent,
  markCasseSent,
  resolveReclamation,
  type AppRole,
  type CommandeStatus,
  type PaymentMode,
} from "@/lib/commandes.functions";
import { STATUS_LABELS } from "@/lib/commande-labels";
import { CasseDialog, type CasseEye } from "@/components/CasseDialog";
import { LivraisonDialog } from "@/components/LivraisonDialog";
import {
  QualityCheckDialog,
  type QualityCheckPayload,
} from "@/components/QualityCheckDialog";


type Props = {
  commande: {
    id: string;
    numero_commande: string | null;
    status: CommandeStatus;
    monture_source: string | null;
    monture_client_provided: boolean | null;
    monture_client_called_at: string | null;
    monture_client_received_at: string | null;
    eyes_ordered?: "od" | "og" | "both" | null;
    casse_eye?: string | null;
    casse_sent_at?: string | null;
    clients?: { nom_complet?: string | null } | null;
	reclamation_detail?: { od?: string | null; og?: string | null } | null;  // ← ajouter
	reclamation_resolved_at?: string | null;
	reclamation_sent_at?: string | null;
    type?: string | null;
    od_sphere?: number | null;
    od_cylinder?: number | null;
    od_axe?: number | null;
    od_addition?: number | null;
    og_sphere?: number | null;
    og_cylinder?: number | null;
    og_axe?: number | null;
    og_addition?: number | null;
    progressive?: {
      ecart_pupillaire_od: number | null;
      ecart_pupillaire_og: number | null;
      hauteur_pupillaire_od: number | null;
      hauteur_pupillaire_og: number | null;
      grand_diametre: number | null;
      hauteur_calibre: number | null;
      pont: number | null;
    } | null;
  };
};

type PendingAction =
  | { kind: "status"; status: CommandeStatus }
  | { kind: "casse" }
  | { kind: "livraison" }
  | { kind: "called" }
  | { kind: "received" }
  | { kind: "quality" };


export function CommandeQuickActions({ commande }: Props) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const doChange = useServerFn(changeCommandeStatus);
  const doCalled = useServerFn(markMontureClientCalled);
  const doReceived = useServerFn(markMontureClientReceived);
  const doDeliver = useServerFn(deliverCommande);
  const doQuality = useServerFn(submitQualityCheck);
  const doReclamSent = useServerFn(markReclamationSent);
  const doCasseSent = useServerFn(markCasseSent);
  const doReclamResolve = useServerFn(resolveReclamation);
  const [pending, setPending] = useState<PendingAction | null>(null);

const reclamationDetail = commande.reclamation_detail ?? null;
const reclamationActive = reclamationDetail && !commande.reclamation_resolved_at;
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
  : commande.casse_eye && commande.casse_eye !== "both"
  ? (commande.casse_eye as "od" | "og")
  : (commande.eyes_ordered ?? "both");

  const isClientFrame = commande.monture_source === "donnee";
  const clientProvided = commande.monture_client_provided === true;
  const needsClientFrame = isClientFrame && !clientProvided;
  const montureCalled = Boolean(commande.monture_client_called_at);
  const montureReceived = Boolean(commande.monture_client_received_at);
  const blockedEnMontage = needsClientFrame && !montureReceived;

  const nextOptions = useMemo<CommandeStatus[]>(() => {
    if (!role) return [];
    const opts = allowedNextStatuses(role as AppRole, commande.status, (commande as any).type);
    // Le cas "Cassé au montage" utilise l'action dédiée "Marquer la casse envoyée"
    if (commande.status === "casse_montage") {
      return opts.filter((s) => s !== "verre_commande");
    }
    return opts;
  }, [role, commande.status, (commande as any).type]);

  const showCallAction = needsClientFrame && !montureReceived && !montureCalled;
  const showReceivedAction = needsClientFrame && !montureReceived && montureCalled;

  const canManageReclam = role === "admin" || role === "agent_vente";
  const canResolveReclam = role === "admin" || role === "agent_montage";
  const reclamSent = Boolean(commande.reclamation_sent_at);
  const showReclamMarkSent = hasActiveReclamation && canManageReclam && !reclamSent;
  const showReclamResolve = hasActiveReclamation && canResolveReclam && reclamSent;
  const showCasseMarkSent =
    commande.status === "casse_montage" &&
    canManageReclam &&
    !commande.casse_sent_at;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["commandes-list"] });
    qc.invalidateQueries({ queryKey: ["commande", commande.id] });
  };

  const reclamSentMut = useMutation({
    mutationFn: () => doReclamSent({ data: { id: commande.id } }),
    onSuccess: () => { toast.success("Réclamation marquée comme envoyée"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const casseSentMut = useMutation({
    mutationFn: () => doCasseSent({ data: { id: commande.id } }),
    onSuccess: () => { toast.success("Casse marquée comme envoyée"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reclamResolveMut = useMutation({
    mutationFn: () => doReclamResolve({ data: { id: commande.id } }),
    onSuccess: () => { toast.success("Réclamation résolue — Verre totalement reçu"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutation = useMutation({
    mutationFn: async (
      casse?: { casse_eye: CasseEye; casse_note: string | null },
    ) => {
      if (!pending) return null;
      if (pending.kind === "status") {
        return doChange({
          data: { id: commande.id, new_status: pending.status },
        });
      }
      if (pending.kind === "casse") {
        if (!casse) return null;
        return doChange({
          data: {
            id: commande.id,
            new_status: "casse_montage",
            casse_eye: casse.casse_eye,
            casse_note: casse.casse_note,
          },
        });
      }
      if (pending.kind === "called") {
        return doCalled({ data: { id: commande.id } });
      }
      return doReceived({ data: { id: commande.id } });
    },
    onSuccess: () => {
      if (!pending) return;
      if (pending.kind === "status") {
        toast.success(`Statut → ${STATUS_LABELS[pending.status]}`);
      } else if (pending.kind === "casse") {
        toast.success("Casse déclarée");
      } else if (pending.kind === "called") {
        toast.success("Appel client enregistré");
      } else {
        toast.success("Monture client reçue");
      }
      setPending(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPending(null);
    },
  });

  if (
    nextOptions.length === 0 &&
    !showCallAction &&
    !showReceivedAction &&
    !showReclamMarkSent &&
    !showReclamResolve &&
    !showCasseMarkSent
  ) {
    return null;
  }

  const confirmLabel =
    pending?.kind === "status"
      ? `Passer au statut « ${STATUS_LABELS[pending.status]} » ?`
      : pending?.kind === "called"
      ? "Marquer le client comme appelé pour sa monture ?"
      : pending?.kind === "received"
      ? "Confirmer la réception de la monture client ?"
      : "";

  const isCassePending = pending?.kind === "casse";
  const isLivraisonPending = pending?.kind === "livraison";
  const isQualityPending = pending?.kind === "quality";
  const isStandardPending =
    pending !== null &&
    !isCassePending &&
    !isLivraisonPending &&
    !isQualityPending;

  const qualityMutation = useMutation({
    mutationFn: (payload: QualityCheckPayload) =>
      doQuality({ data: { id: commande.id, checks: payload } }),
    onSuccess: (res: any) => {
      const declared = res?.reclamation_detail != null;
      toast.success(declared ? "Réclamation déclarée" : "Verre reçu — contrôle OK");
      setPending(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const deliverMutation = useMutation({
    mutationFn: (payload: {
      amount: number;
      payment_mode: PaymentMode;
      note: string | null;
    }) => doDeliver({ data: { id: commande.id, ...payload } }),
    onSuccess: () => {
      toast.success("Livraison confirmée");
      setPending(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => e.stopPropagation()}
            title="Actions rapides"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5" /> Actions rapides
          </DropdownMenuLabel>
          {nextOptions.length > 0 && <DropdownMenuSeparator />}
          {nextOptions.map((s) => {
            const disabled = s === "en_montage" && blockedEnMontage;
            const isCasse = s === "casse_montage";
            return (
              <DropdownMenuItem
                key={s}
                disabled={disabled}
                onSelect={(e) => {
                  e.preventDefault();
                  if (disabled) return;
                  setPending(
                    isCasse
                      ? { kind: "casse" }
                      : s === "livree"
                      ? { kind: "livraison" }
                      : s === "verre_recu"
                      ? { kind: "quality" }
                      : { kind: "status", status: s },
                  );
                }}
                className={isCasse ? "text-red-600 focus:text-red-700" : ""}
              >
                → {STATUS_LABELS[s]}
                {disabled ? " (monture client requise)" : ""}
              </DropdownMenuItem>
            );
          })}

          {(showCallAction || showReceivedAction) && <DropdownMenuSeparator />}
          {showCallAction && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setPending({ kind: "called" });
              }}
            >
              <Phone className="mr-2 h-3.5 w-3.5" /> Marquer comme appelé
            </DropdownMenuItem>
          )}
          {showReceivedAction && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setPending({ kind: "received" });
              }}
            >
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Monture reçue
            </DropdownMenuItem>
          )}

          {(showReclamMarkSent || showReclamResolve) && <DropdownMenuSeparator />}
          {showReclamMarkSent && (
            <DropdownMenuItem
              disabled={reclamSentMut.isPending}
              onSelect={(e) => {
                e.preventDefault();
                reclamSentMut.mutate();
              }}
              className="text-orange-600 focus:text-orange-700"
            >
              <PackageCheck className="mr-2 h-3.5 w-3.5" /> Marquer la réclamation envoyée
            </DropdownMenuItem>
          )}
          {showCasseMarkSent && <DropdownMenuSeparator />}
          {showCasseMarkSent && (
            <DropdownMenuItem
              disabled={casseSentMut.isPending}
              onSelect={(e) => {
                e.preventDefault();
                casseSentMut.mutate();
              }}
              className="text-red-600 focus:text-red-700"
            >
              <PackageCheck className="mr-2 h-3.5 w-3.5" /> Marquer la casse envoyée
            </DropdownMenuItem>
          )}
          {showReclamResolve && (
            <DropdownMenuItem
              disabled={reclamResolveMut.isPending}
              onSelect={(e) => {
                e.preventDefault();
                reclamResolveMut.mutate();
              }}
              className="text-emerald-600 focus:text-emerald-700"
            >
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Verre totalement reçu
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={isStandardPending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'action</AlertDialogTitle>
            <AlertDialogDescription>
              {commande.numero_commande ? `${commande.numero_commande} — ` : ""}
              {confirmLabel}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate(undefined);
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CasseDialog
        open={isCassePending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        numeroCommande={commande.numero_commande}
        eyesOrdered={commande.eyes_ordered ?? null}
        isPending={mutation.isPending}
        onConfirm={(payload) => mutation.mutate(payload)}
      />

      <LivraisonDialog
        commandeId={isLivraisonPending ? commande.id : null}
        open={isLivraisonPending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        isPending={deliverMutation.isPending}
        onConfirm={(payload) => deliverMutation.mutate(payload)}
      />

      <QualityCheckDialog
        open={isQualityPending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        numeroCommande={commande.numero_commande}
        eyesToCheck={eyesToCheck}
        isPending={qualityMutation.isPending}
        onConfirm={(payload) => qualityMutation.mutate(payload)}
        od={{
          sphere: commande.od_sphere ?? null,
          cylinder: commande.od_cylinder ?? null,
          axe: commande.od_axe ?? null,
          addition: commande.od_addition ?? null,
        }}
        og={{
          sphere: commande.og_sphere ?? null,
          cylinder: commande.og_cylinder ?? null,
          axe: commande.og_axe ?? null,
          addition: commande.og_addition ?? null,
        }}
        showAddition={commande.type !== "lentilles"}
        isProgressif={commande.type === "progressif"}
        progressive={commande.progressive ?? null}
      />
    </>
  );
}

