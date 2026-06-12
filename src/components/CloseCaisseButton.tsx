import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { closeCaisse, getOpenCaisseSummary } from "@/lib/caisses.functions";
import { runBackupNow } from "@/lib/backup.functions";
import { ConfirmCodeField } from "@/components/ConfirmCodeField";

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type CloseCaisseSummary = {
  id: string;
  opening_balance: number;
  encaissements: number;
  charges: number;
  expected_balance: number;
};

type Props = {
  /** If provided, close this specific caisse instead of fetching the active one. */
  summary?: CloseCaisseSummary;
  /** Custom trigger node — defaults to a standard "Fermer la caisse" button. */
  trigger?: ReactNode;
};

export function CloseCaisseButton({ summary: summaryProp, trigger }: Props = {}) {
  const { role, session, loading } = useAuth();
  const qc = useQueryClient();
  const fetchSummary = useServerFn(getOpenCaisseSummary);
  const doClose = useServerFn(closeCaisse);
  const doBackup = useServerFn(runBackupNow);

  const canSee = role === "admin" || role === "agent_vente";
  const authReady = !loading && !!session && canSee;

  const { data: fetchedSummary } = useQuery({
    queryKey: ["open-caisse-summary"],
    queryFn: () => fetchSummary(),
    enabled: authReady && !summaryProp,
    refetchOnWindowFocus: false,
  });

  const summary = summaryProp ?? fetchedSummary;

  const [open, setOpen] = useState(false);
  const [closingStr, setClosingStr] = useState("");
  const [confirmValid, setConfirmValid] = useState(false);

  useEffect(() => {
    if (!open) setConfirmValid(false);
  }, [open]);

  useEffect(() => {
    if (open) setClosingStr("");
  }, [open]);

  const closeMut = useMutation({
    mutationFn: (vars: { id: string; closing_balance: number }) =>
      doClose({ data: vars }),
    onSuccess: () => {
      toast.success("Caisse fermée — journal généré");
      qc.invalidateQueries({ queryKey: ["caisses"] });
      qc.invalidateQueries({ queryKey: ["open-caisse-summary"] });
      qc.invalidateQueries({ queryKey: ["caisse-open-status"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setOpen(false);
      // Sauvegarde planifiée (best-effort, ne bloque pas la fermeture)
      doBackup({ data: { trigger: "caisse_close" } })
        .then((r: any) => {
          if (r?.status === "success") {
            toast.success("📦 Sauvegarde automatique effectuée");
          } else if (r?.status === "partial") {
            toast.warning(`Sauvegarde partielle : ${r?.error ?? ""}`);
          }
          // status 'failed' silencieux (souvent : "désactivé" — ignore)
        })
        .catch(() => {
          // ignore : la sauvegarde planifiée ne doit jamais casser la fermeture
        });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!authReady || !summary) return null;

  const closing = Number(closingStr);
  const closingValid = Number.isFinite(closing) && closing >= 0;
  const ecart = closingValid ? closing - summary.expected_balance : 0;
  const ecartZero = Math.abs(ecart) < 0.005;

  const triggerNode = trigger ?? (
    <Button
      variant="outline"
      size="sm"
      className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
    >
      <Lock className="mr-2 h-4 w-4" />
      Fermer la caisse
    </Button>
  );

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {triggerNode}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fermeture de caisse</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="closing-balance">Solde final (€)</Label>
              <Input
                id="closing-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={closingStr}
                onChange={(e) => setClosingStr(e.target.value)}
                autoFocus
                placeholder="Saisir le solde final compté"
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Récapitulatif de la journée
              </p>
              <dl className="space-y-2 text-sm">
                <Row label="Solde de démarrage" value={`${fmt(summary.opening_balance)} €`} />
                <Row
                  label="Montant encaissé"
                  value={`+ ${fmt(summary.encaissements)} €`}
                  valueClass="text-emerald-600 dark:text-emerald-400 font-medium"
                />
                <Row
                  label="Charges"
                  value={`- ${fmt(summary.charges)} €`}
                  valueClass="text-red-600 dark:text-red-400 font-medium"
                />
                <div className="my-2 border-t border-border" />
                <Row
                  label="Solde attendu"
                  value={`${fmt(summary.expected_balance)} €`}
                  valueClass="font-semibold text-foreground"
                />
                <Row
                  label="Écart"
                  value={`${ecart >= 0 ? "+" : ""}${fmt(ecart)} €`}
                  valueClass={
                    ecartZero
                      ? "text-foreground font-medium"
                      : "text-red-600 dark:text-red-400 font-semibold"
                  }
                />
              </dl>
            </div>

            {closingValid && (
              <ConfirmCodeField amount={closing} onValidChange={setConfirmValid} />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={!closingValid || !confirmValid || closeMut.isPending}
              onClick={() =>
                closeMut.mutate({ id: summary.id, closing_balance: closing })
              }
            >
              {closeMut.isPending ? "Fermeture…" : "Fermer la caisse et générer le journal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={valueClass ?? "text-foreground"}>{value}</dd>
    </div>
  );
}
