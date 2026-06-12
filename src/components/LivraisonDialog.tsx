import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCommandePaymentSummary,
  PAYMENT_MODES,
  PAYMENT_MODE_LABELS,
  type PaymentMode,
} from "@/lib/commandes.functions";
import { getMutuelleForCommande } from "@/lib/mutuelles.functions";

type Props = {
  commandeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: (payload: {
    amount: number;
    payment_mode: PaymentMode;
    note: string | null;
    livrer_mutuelle_demande_id: string | null;
  }) => void;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function LivraisonDialog({
  commandeId,
  open,
  onOpenChange,
  isPending,
  onConfirm,
}: Props) {
  const fetchSummary = useServerFn(getCommandePaymentSummary);
  const fetchMutuelle = useServerFn(getMutuelleForCommande);
  const { data: summary, isLoading } = useQuery({
    queryKey: ["commande-payment-summary", commandeId],
    queryFn: () => fetchSummary({ data: { id: commandeId! } }),
    enabled: open && !!commandeId,
  });
  const { data: mutuelle } = useQuery({
    queryKey: ["commande-mutuelle", commandeId],
    queryFn: () => fetchMutuelle({ data: { commande_id: commandeId! } }),
    enabled: open && !!commandeId,
  });

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("especes");
  const [note, setNote] = useState("");
  const [livrerMutuelle, setLivrerMutuelle] = useState(false);

  // Reset à la fermeture.
  useEffect(() => {
    if (!open) {
      setAmount("");
      setMode("especes");
      setNote("");
      setLivrerMutuelle(false);
    }
  }, [open]);

  const reste = summary?.reste ?? 0;
  const isFullyPaid = reste <= 0;
  const amountNum = isFullyPaid ? 0 : Number(amount) || 0;
  const amountInvalid = !isFullyPaid && (amountNum < 0 || amountNum > reste + 0.001);
  const resteApresPaiement = Math.max(0, reste - amountNum);

  const detteInfo = useMemo(() => {
    if (isFullyPaid) return null;
    const diff = Math.max(0, reste - amountNum);
    if (diff <= 0) return null;
    return diff;
  }, [reste, amountNum, isFullyPaid]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Récupération &amp; paiement</DialogTitle>
          <DialogDescription>
            {summary?.numero_commande ? `${summary.numero_commande} — ` : ""}
            {summary?.client_nom ?? ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !summary ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : (
          <div className="space-y-4">
            {isFullyPaid && (
              <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                ✅ Commande entièrement payée
              </div>
            )}

            {mutuelle && (
              <div
                className={
                  mutuelle.statut === "remplie"
                    ? "rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                    : "rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-300"
                }
              >
                <div>
                  {mutuelle.statut === "remplie"
                    ? `✅ Mutuelle ${mutuelle.organisme ?? ""} prête`
                    : `⚠️ Mutuelle ${mutuelle.organisme ?? ""} en attente — non encore remplie`}
                </div>
                {mutuelle.statut === "remplie" && mutuelle.livree && mutuelle.livree_at && (
                  <div className="mt-2 text-xs font-normal text-muted-foreground">
                    Mutuelle déjà livrée le{" "}
                    {new Date(mutuelle.livree_at).toLocaleDateString("fr-FR")} à{" "}
                    {new Date(mutuelle.livree_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
                {mutuelle.statut === "remplie" && !mutuelle.livree && (
                  <label className="mt-2 flex items-center gap-2 text-xs font-normal text-foreground">
                    <Checkbox
                      checked={livrerMutuelle}
                      onCheckedChange={(v) => setLivrerMutuelle(v === true)}
                    />
                    <span>Livrer la mutuelle avec cette commande ?</span>
                  </label>
                )}
              </div>
            )}

            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">Total commande</span>
                <span className="font-medium">{fmt(summary.total)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">Déjà payé</span>
                <span className="font-medium">{fmt(summary.deja_paye)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t pt-2">
                <span className="font-semibold">Reste à payer</span>
                <span className="font-semibold text-primary">{fmt(reste)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="livraison-amount">Montant encaissé maintenant</Label>
              <Input
                id="livraison-amount"
                type="number"
                inputMode="decimal"
                min={0}
                max={reste}
                step="0.01"
                value={isFullyPaid ? "0" : amount}
                disabled={isFullyPaid}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
                aria-invalid={amountInvalid}
              />
              {!isFullyPaid && (
                <p className="text-xs text-muted-foreground">
                  Reste après paiement : <span className="font-medium">{fmt(resteApresPaiement)}</span>
                </p>
              )}
              {amountInvalid && (
                <p className="text-xs text-destructive">
                  Le montant doit être compris entre 0 et {fmt(reste)}.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Mode de paiement</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as PaymentMode)}
                disabled={isFullyPaid}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="livraison-note">Note (optionnel)</Label>
              <Textarea
                id="livraison-note"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {detteInfo !== null && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                Un reste à payer de <span className="font-semibold">{fmt(detteInfo)}</span>{" "}
                sera ajouté à la dette globale du client.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button
            disabled={isPending || isLoading || !summary || amountInvalid}
            onClick={() =>
              onConfirm({
                amount: amountNum,
                payment_mode: mode,
                note: note.trim() ? note.trim() : null,
                livrer_mutuelle_demande_id:
                  livrerMutuelle && mutuelle && mutuelle.statut === "remplie" && !mutuelle.livree
                    ? mutuelle.id
                    : null,
              })
            }
          >
            Confirmer la livraison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
