import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialMontant: number;
  initialAvance: number;
  sumVersements: number;
  canEditAvance: boolean;
  avanceLockReason?: string | null;
  isPending: boolean;
  onSubmit: (v: { montant: number; avance: number }) => void;
};

export function CommandePaiementEditDialog({
  open,
  onOpenChange,
  initialMontant,
  initialAvance,
  sumVersements,
  canEditAvance,
  avanceLockReason,
  isPending,
  onSubmit,
}: Props) {
  const initialGratuit = initialMontant === 0 && initialAvance === 0;
  const [montant, setMontant] = useState(String(initialMontant));
  const [avance, setAvance] = useState(String(initialAvance));
  const [gratuit, setGratuit] = useState(initialGratuit);

  useEffect(() => {
    if (!open) return;
    setMontant(String(initialMontant));
    setAvance(String(initialAvance));
    setGratuit(initialMontant === 0 && initialAvance === 0);
  }, [open, initialMontant, initialAvance]);

  const m = Number(montant);
  const a = Number(avance);
  const mValid = Number.isFinite(m) && m >= 0;
  const aValid = Number.isFinite(a) && a >= 0;
  const avanceExceedsMontant = mValid && aValid && a > m + 0.005;
  const totalExceedsMontant =
    mValid && aValid && a + sumVersements > m + 0.005;

  const error = useMemo(() => {
    if (gratuit) return null;
    if (!mValid) return "Montant invalide";
    if (!aValid) return "Avance invalide";
    if (avanceExceedsMontant)
      return "L'avance ne peut pas être supérieure au montant total";
    if (totalExceedsMontant)
      return `Le montant total doit couvrir l'avance + versements déjà encaissés (${(a + sumVersements).toFixed(2)})`;
    return null;
  }, [gratuit, mValid, aValid, avanceExceedsMontant, totalExceedsMontant, a, sumVersements]);

  const finalM = gratuit ? 0 : m;
  const finalA = gratuit ? 0 : a;
  const noChange =
    Math.abs(finalM - initialMontant) < 0.005 && Math.abs(finalA - initialAvance) < 0.005;
  const blockedByVersements = gratuit && sumVersements > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (error || noChange || blockedByVersements) return;
    onSubmit({ montant: finalM, avance: finalA });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le paiement</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <label className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm font-medium">Commande gratuite</span>
            <Switch
              checked={gratuit}
              onCheckedChange={(v) => {
                setGratuit(v);
                if (v) {
                  setMontant("0");
                  setAvance("0");
                }
              }}
            />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="pay-montant">Montant total</Label>
            <Input
              id="pay-montant"
              type="number"
              step="0.01"
              min="0"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              disabled={gratuit}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-avance">Avance (Donné)</Label>
            <Input
              id="pay-avance"
              type="number"
              step="0.01"
              min="0"
              value={avance}
              onChange={(e) => setAvance(e.target.value)}
              disabled={gratuit || !canEditAvance}
              required
            />
            {!canEditAvance && avanceLockReason && (
              <p className="text-xs text-muted-foreground">{avanceLockReason}</p>
            )}
          </div>
          {sumVersements > 0 && (
            <p className={`text-xs flex items-center gap-1 ${blockedByVersements ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {blockedByVersements && <AlertTriangle className="h-3.5 w-3.5" />}
              Versements déjà encaissés : {sumVersements.toFixed(2)}
            </p>
          )}
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
            <Button type="submit" disabled={isPending || !!error || noChange || blockedByVersements}>
              {isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
