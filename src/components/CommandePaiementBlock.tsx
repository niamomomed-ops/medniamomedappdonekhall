import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import {
  listCommandeVersements,
  createCommandeVersement,
  updateCommandeVersement,
  deleteCommandeVersement,
  updateCommandePayment,
  type CommandeVersement,
} from "@/lib/commandes.functions";
import { CommandeVersementDialog } from "@/components/CommandeVersementDialog";
import { CommandePaiementEditDialog } from "@/components/CommandePaiementEditDialog";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { getOpenCaisseSummary } from "@/lib/caisses.functions";


const fmtMoney = (n: number) => Number(n ?? 0).toFixed(2);

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export function CommandePaiementBlock({
  commandeId,
  montant,
  avance,
  caisseLabel,
  status,
  numeroCommande,
  clientName,
  clientPhone,
  storeName,
  type,
  montureSource,
  dateCreation,
  dateLivraison,
  commandeCaisseId,
  montantModified,
  avanceModified,
  isDeleted,
}: {
  commandeId: string;
  montant: number;
  avance: number;
  caisseLabel: string;
  status?: string;
  numeroCommande?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  storeName?: string | null;
  type?: string | null;
  montureSource?: "boutique" | "donnee" | null;
  dateCreation?: string | null;
  dateLivraison?: string | null;
  commandeCaisseId?: string | null;
  montantModified?: boolean;
  avanceModified?: boolean;
  isDeleted?: boolean;
}) {

  const { role } = useAuth();
  const qc = useQueryClient();
  const canEdit = role === "admin" || role === "agent_vente";
  const isGratuit = Number(montant) === 0 && Number(avance) === 0;
  const canEditPayment = isGratuit ? role === "admin" : canEdit;

  const fetchList = useServerFn(listCommandeVersements);
  const doCreate = useServerFn(createCommandeVersement);
  const doUpdate = useServerFn(updateCommandeVersement);
  const doDelete = useServerFn(deleteCommandeVersement);
  const doUpdatePayment = useServerFn(updateCommandePayment);
  const fetchOpenCaisse = useServerFn(getOpenCaisseSummary);


  const { data: versements = [] } = useQuery({
    queryKey: ["commande-versements", commandeId],
    queryFn: () => fetchList({ data: { id: commandeId } }),
  });

  const { data: openCaisse } = useQuery({
    queryKey: ["open-caisse-summary"],
    queryFn: () => fetchOpenCaisse(),
  });
  const openCaisseId = openCaisse?.id ?? null;

  const sumVers = useMemo(
    () => versements.reduce((s, v) => s + Number(v.amount), 0),
    [versements],
  );
  const reste = Math.max(0, Number(montant) - Number(avance) - sumVers);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CommandeVersement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommandeVersement | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [payEditOpen, setPayEditOpen] = useState(false);

  const canEditAvance =
    commandeCaisseId != null && openCaisseId != null && commandeCaisseId === openCaisseId;


  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["commande-versements", commandeId] });
    qc.invalidateQueries({ queryKey: ["commande", commandeId] });
    qc.invalidateQueries({ queryKey: ["commandes-list"] });
  };

  const createMut = useMutation({
    mutationFn: (v: { amount: number; date: string; note: string | null }) =>
      doCreate({
        data: {
          commande_id: commandeId,
          amount: v.amount,
          date: v.date,
          note: v.note,
        },
      }),
    onSuccess: () => {
      toast.success("Versement enregistré");
      setAddOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; amount: number; date: string; note: string | null }) =>
      doUpdate({ data: v }),
    onSuccess: () => {
      toast.success("Versement modifié");
      setEditTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Versement supprimé");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payMut = useMutation({
    mutationFn: (v: { montant: number; avance: number }) =>
      doUpdatePayment({ data: { id: commandeId, ...v } }),
    onSuccess: () => {
      toast.success("Paiement modifié");
      setPayEditOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Paiement
          </h3>
          {isGratuit && <Badge variant="secondary">Gratuit</Badge>}
        </div>
        {canEditPayment && status !== "livree" && !isDeleted && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setPayEditOpen(true)}
          >
            <Pencil className="mr-1 h-3 w-3" />
            Modifier
          </Button>
        )}
      </div>

      <Row
        label="Montant"
        value={
          <span>
            {fmtMoney(montant)}
            {montantModified && (
              <span className="ml-1 text-xs italic text-muted-foreground">*Modifié</span>
            )}
          </span>
        }
      />
      <Row
        label="Avance (Donné)"
        value={
          <span>
            {fmtMoney(avance)}
            {avanceModified && (
              <span className="ml-1 text-xs italic text-muted-foreground">*Modifié</span>
            )}
          </span>
        }
      />


      {versements.length > 0 && (
        <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
          <p className="text-xs font-medium text-muted-foreground">Versements :</p>
          <ul className="space-y-1">
            {versements.map((v) => {
              const dt = new Date(v.created_at);
              const dateStr = dt.toLocaleDateString("fr-FR");
              const timeStr = dt.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const agent = v.created_by_name ?? "—";
              const roleLabel = v.created_by_role
                ? ROLE_LABELS[v.created_by_role as keyof typeof ROLE_LABELS] ??
                  v.created_by_role
                : null;
              return (
                <li
                  key={v.id}
                  className="flex items-start justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">• {fmtMoney(v.amount)}</span>{" "}
                    <span className="text-muted-foreground">
                      — {dateStr} à {timeStr} ({agent}
                      {roleLabel ? ` - ${roleLabel}` : ""})
                    </span>
                    {v.note && (
                      <p className="ml-2 text-muted-foreground italic">
                        {v.note}
                      </p>
                    )}
                  </div>
                  {canEdit &&
                    status !== "livree" &&
                    openCaisseId !== null &&
                    v.caisse_id === openCaisseId && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => setEditTarget(v)}
                        title="Modifier"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(v)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {status === "livree" ? (
        reste <= 0 ? (
          <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            ✅ Soldée
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-300">
            ⚠️ Dette enregistrée — voir fiche client
          </div>
        )
      ) : reste <= 0 ? (
        <Row label="Reste" value="Soldé ✅" strong />
      ) : (
        <Row label="Reste" value={fmtMoney(reste)} strong />
      )}

      <Row label="Caisse" value={caisseLabel} />

      {canEdit && status !== "livree" && reste > 0 && !isDeleted && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Ajouter un versement
        </Button>
      )}

      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => setReceiptOpen(true)}
      >
        <Receipt className="mr-1.5 h-3.5 w-3.5" />
        🧾 Générer reçu client
      </Button>

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        storeName={storeName ?? null}
        numeroCommande={numeroCommande ?? null}
        clientName={clientName ?? null}
        telephone={clientPhone ?? null}
        total={Number(montant)}
        verse={Number(avance) + sumVers}
        reste={reste}
        type={type ?? null}
        montureSource={montureSource ?? null}
        dateCreation={dateCreation ?? null}
        dateLivraison={dateLivraison ?? null}
        deleted={isDeleted}
      />

      <CommandeVersementDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        reste={reste}
        isPending={createMut.isPending}
        onSubmit={(v) => createMut.mutate(v)}
      />

      <CommandeVersementDialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        mode="edit"
        reste={reste + Number(editTarget?.amount ?? 0)}
        initial={
          editTarget
            ? {
                amount: editTarget.amount,
                date: editTarget.created_at,
                note: editTarget.note,
              }
            : undefined
        }
        isPending={updateMut.isPending}
        onSubmit={(v) => {
          if (!editTarget) return;
          updateMut.mutate({
            id: editTarget.id,
            amount: v.amount,
            date: v.date,
            note: v.note,
          });
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce versement ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                `Versement de ${fmtMoney(deleteTarget.amount)} du ${new Date(
                  deleteTarget.created_at,
                ).toLocaleString("fr-FR")}. Cette action est irréversible.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMut.mutate(deleteTarget.id);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CommandePaiementEditDialog
        open={payEditOpen}
        onOpenChange={setPayEditOpen}
        initialMontant={Number(montant)}
        initialAvance={Number(avance)}
        sumVersements={sumVers}
        canEditAvance={canEditAvance}
        avanceLockReason={
          !canEditAvance
            ? "L'avance ne peut être modifiée que dans la caisse où la commande a été créée."
            : null
        }
        isPending={payMut.isPending}
        onSubmit={(v) => payMut.mutate(v)}
      />
    </>
  );
}

