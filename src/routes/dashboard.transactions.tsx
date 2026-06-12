import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowLeft, ArrowUpCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import {
  createTransaction,
  deleteTransaction,
  getCurrentOpenCaisse,
  listTransactions,
  updateTransaction,
} from "@/lib/transactions.functions";
import { ConfirmCodeField } from "@/components/ConfirmCodeField";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/transactions")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <TransactionsPage />
    </RoleGuard>
  ),
});

type Tx = {
  id: string;
  caisse_id: string;
  type: "entree" | "sortie";
  amount: number;
  description: string | null;
  created_at: string;
  created_by_user: { name: string; email: string } | null;
};

function TransactionsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchOpen = useServerFn(getCurrentOpenCaisse);
  const fetchList = useServerFn(listTransactions);
  const doCreate = useServerFn(createTransaction);
  const doUpdate = useServerFn(updateTransaction);
  const doDelete = useServerFn(deleteTransaction);

  const { data: openCaisse } = useQuery({
    queryKey: ["caisse-open"],
    queryFn: () => fetchOpen(),
  });

  const { data: txs, isLoading } = useQuery({
    queryKey: ["transactions", openCaisse?.id ?? "all"],
    queryFn: () =>
      fetchList({ data: openCaisse?.id ? { caisse_id: openCaisse.id } : {} }),
  });

  const createMut = useMutation({
    mutationFn: (input: { type: "entree" | "sortie"; amount: number; description?: string }) =>
      doCreate({ data: input }),
    onSuccess: () => {
      toast.success("Transaction enregistrée");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: {
      id: string;
      type: "entree" | "sortie";
      amount: number;
      description?: string;
    }) => doUpdate({ data: input }),
    onSuccess: () => {
      toast.success("Transaction mise à jour");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Transaction supprimée");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [toDelete, setToDelete] = useState<Tx | null>(null);

  const backTo = role ? ROLE_HOME[role] : "/dashboard/admin";
  const guardRole = role === "agent_vente" ? "agent_vente" : "admin";
  const noOpen = !openCaisse;

  return (
    <DashboardShell
      role={guardRole}
      title="Transactions"
      subtitle="Entrées et sorties d'argent liées à la caisse ouverte."
      accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
    >
      <div className="mb-4 flex items-center justify-between">
        <Link
          to={backTo}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            navigate({ to: backTo });
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Link>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              disabled={noOpen}
              title={noOpen ? "Aucune caisse ouverte" : undefined}
            >
              <Plus className="mr-2 h-4 w-4" /> Ajouter une transaction
            </Button>
          </DialogTrigger>
          <TransactionDialog
            mode="create"
            submitting={createMut.isPending}
            onSubmit={async (input) => {
              await createMut.mutateAsync(input);
              setOpen(false);
            }}
          />
        </Dialog>
      </div>

      {noOpen && (
        <div className="mb-4 rounded-lg border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
          Aucune caisse ouverte. Ouvrez une caisse pour enregistrer des
          transactions.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Effectué par</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (txs?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Aucune transaction.
                </TableCell>
              </TableRow>
            )}
            {(txs as Tx[] | undefined)?.map((t) => (
              <TableRow key={t.id} className="group">
                <TableCell>
                  {t.type === "entree" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">
                      <ArrowDownCircle className="mr-1 h-3.5 w-3.5" /> Entrée
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <ArrowUpCircle className="mr-1 h-3.5 w-3.5" /> Sortie
                    </Badge>
                  )}
                </TableCell>
                <TableCell
                  className={`font-medium ${
                    t.type === "entree" ? "text-emerald-600" : "text-foreground"
                  }`}
                >
                  {t.type === "sortie" ? "−" : "+"}
                  {Number(t.amount).toLocaleString("fr-FR", {
                    minimumFractionDigits: 2,
                  })}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.description ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {t.created_by_user ? (
                    <span title={t.created_by_user.email}>{t.created_by_user.name}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(t.created_at).toLocaleString("fr-FR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditing(t)}
                      aria-label="Modifier"
                      title="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setToDelete(t)}
                      aria-label="Supprimer"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <TransactionDialog
            mode="edit"
            initial={{
              type: editing.type,
              amount: String(editing.amount),
              description: editing.description ?? "",
            }}
            submitting={updateMut.isPending}
            onSubmit={async (input) => {
              await updateMut.mutateAsync({ id: editing.id, ...input });
              setEditing(null);
            }}
          />
        )}
      </Dialog>

      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette transaction ?"
        description="Cette action est irréversible et recalculera le solde de la caisse."
        onConfirm={async () => {
          if (!toDelete) return;
          await deleteMut.mutateAsync(toDelete.id);
          setToDelete(null);
        }}
      />
    </DashboardShell>
  );
}

function TransactionDialog({
  mode,
  initial,
  onSubmit,
  submitting,
}: {
  mode: "create" | "edit";
  initial?: { type: "entree" | "sortie"; amount: string; description: string };
  onSubmit: (input: {
    type: "entree" | "sortie";
    amount: number;
    description?: string;
  }) => Promise<void>;
  submitting: boolean;
}) {
  const [type, setType] = useState<"entree" | "sortie" | null>(initial?.type ?? null);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [typeError, setTypeError] = useState(false);
  const [confirmValid, setConfirmValid] = useState(false);
  const amountNum = Number(amount);
  const amountValid = amount !== "" && Number.isFinite(amountNum) && amountNum > 0;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" ? "Modifier la transaction" : "Nouvelle transaction"}
        </DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!type) {
            setTypeError(true);
            return;
          }
          const n = Number(amount);
          if (!Number.isFinite(n) || n <= 0) {
            toast.error("Montant invalide");
            return;
          }
          await onSubmit({
            type,
            amount: n,
            description: description.trim() || undefined,
          });
          if (mode === "create") {
            setAmount("");
            setDescription("");
            setType(null);
          }
        }}
      >
        <div className="space-y-2">
          <Label>Type</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setType("entree");
                setTypeError(false);
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md border-2 px-4 py-2.5 text-sm font-medium transition-colors",
                type === "entree"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              <Plus className="h-4 w-4" /> Entrée
            </button>
            <button
              type="button"
              onClick={() => {
                setType("sortie");
                setTypeError(false);
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md border-2 px-4 py-2.5 text-sm font-medium transition-colors",
                type === "sortie"
                  ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="text-base leading-none">−</span> Charge
            </button>
          </div>
          {typeError && !type && (
            <p className="text-xs text-destructive">
              Veuillez sélectionner un type de transaction
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="tx-amount">Montant</Label>
          <Input
            id="tx-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tx-desc">Description (optionnel)</Label>
          <Input
            id="tx-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Motif de la transaction"
          />
        </div>
        {amountValid && (
          <ConfirmCodeField
            amount={amountNum}
            onValidChange={setConfirmValid}
            label={
              type === "sortie"
                ? "Sortie de caisse — recopiez le code pour confirmer le montant."
                : "Pour confirmer, veuillez ressaisir le code affiché ci-dessous."
            }
          />
        )}
        <DialogFooter>
          <Button
            type="submit"
            disabled={submitting || !amountValid || !confirmValid || !type}
          >
            {submitting
              ? mode === "edit"
                ? "Mise à jour…"
                : "Enregistrement…"
              : mode === "edit"
                ? "Mettre à jour"
                : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
