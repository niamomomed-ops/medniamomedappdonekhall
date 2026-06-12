import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmCodeField, randomConfirmCode } from "@/components/ConfirmCodeField";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  numeroCommande: string | null;
  avance: number;
  sameCaisse: boolean;
  isPending: boolean;
  onConfirm: (reason: string) => void;
};

export function DeleteCommandeDialog({
  open,
  onOpenChange,
  numeroCommande,
  avance,
  sameCaisse,
  isPending,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [codeValid, setCodeValid] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setCode(randomConfirmCode());
      setCodeValid(false);
    }
  }, [open]);

  const reasonOk = reason.trim().length >= 3;
  const canSubmit = reasonOk && codeValid && !isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer la commande</AlertDialogTitle>
          <AlertDialogDescription>
            {numeroCommande ? `${numeroCommande} — ` : ""}
            Cette action est irréversible (sauf rétablissement depuis la caisse d'origine).
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="del-reason" className="text-sm">
              Raison de la suppression <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="del-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Précisez la raison…"
              className="mt-1 min-h-[80px]"
              autoFocus
            />
          </div>

          {avance > 0 && sameCaisse && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              Une avance de <strong>{avance.toFixed(2)}</strong> a été encaissée sur
              cette caisse. Une <strong>charge équivalente</strong> sera enregistrée
              pour rembourser la caisse.
            </div>
          )}
          {avance > 0 && !sameCaisse && (
            <div className="rounded-md border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">
              L'avance ({avance.toFixed(2)}) a été enregistrée dans une autre caisse —
              aucune écriture comptable ne sera créée ici. La commande ne pourra plus
              être rétablie depuis cette caisse.
            </div>
          )}

          {code && (
            <ConfirmCodeField
              code={code}
              onValidChange={setCodeValid}
              label="Pour confirmer la suppression, recopiez le code."
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit}
            onClick={(e) => {
              if (!canSubmit) {
                e.preventDefault();
                return;
              }
              onConfirm(reason.trim());
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Suppression…" : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}