import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type VersementFormValues = {
  amount: number;
  date: string; // yyyy-mm-dd or ISO
  note: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  reste: number; // max allowed (for edit, include current versement amount)
  initial?: { amount: number; date: string; note: string | null };
  isPending: boolean;
  onSubmit: (v: VersementFormValues) => void;
};

const today = () => new Date().toISOString().slice(0, 10);

export function CommandeVersementDialog({
  open,
  onOpenChange,
  mode,
  reste,
  initial,
  isPending,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setAmount(String(initial.amount));
      setDate(initial.date.slice(0, 10));
      setNote(initial.note ?? "");
    } else {
      setAmount("");
      setDate(today());
      setNote("");
    }
    setError(null);
  }, [open, mode, initial?.amount, initial?.date, initial?.note]);

  const parsedAmount = Number(amount);
  const amountValid = amount !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const amountExceeds = amountValid && parsedAmount > reste + 0.001;
  const canSubmit = amountValid && !amountExceeds && !isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountValid) {
      setError("Montant invalide");
      return;
    }
    if (amountExceeds) {
      setError(`Le versement ne peut pas dépasser le reste dû (${reste.toFixed(2)})`);
      return;
    }
    setError(null);
    onSubmit({
      amount: parsedAmount,
      date,
      note: note.trim() ? note.trim() : null,
    });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Ajouter un versement" : "Modifier le versement"}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="vers-amount">Montant</Label>
            <Input
              id="vers-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
              placeholder="0,00"
            />
            <ResteLive reste={reste} amount={amount} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vers-date">Date</Label>
            <Input
              id="vers-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vers-note">Note (optionnel)</Label>
            <Textarea
              id="vers-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending
                ? "Enregistrement…"
                : mode === "create"
                ? "Enregistrer le versement"
                : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const fmtMad = (n: number) =>
  `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MAD`;

function ResteLive({ reste, amount }: { reste: number; amount: string }) {
  const n = Number(amount);
  const typing = amount !== "" && Number.isFinite(n) && n > 0;
  const after = typing ? reste - n : reste;
  const exceeds = typing && n > reste + 0.001;
  const zero = Math.abs(after) < 0.005;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-sm text-muted-foreground">
        Reste à payer : <span className="font-semibold text-foreground">{fmtMad(reste)}</span>
      </p>
      {typing && (
        <p
          className={`text-lg font-bold ${
            exceeds
              ? "text-red-600 dark:text-red-400"
              : zero
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          Reste après ce versement : {fmtMad(Math.max(0, after))}
        </p>
      )}
      {exceeds && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          ⚠️ Montant supérieur au reste dû
        </p>
      )}
    </div>
  );
}
