import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle } from "lucide-react";
import { ConfirmCodeField, randomConfirmCode } from "@/components/ConfirmCodeField";

export type CasseEye = "od" | "og" | "both";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numeroCommande?: string | null;
  eyesOrdered?: "od" | "og" | "both" | null;
  onConfirm: (payload: { casse_eye: CasseEye; casse_note: string | null }) => void;
  isPending?: boolean;
};

export function CasseDialog({
  open,
  onOpenChange,
  numeroCommande,
  eyesOrdered,
  onConfirm,
  isPending,
}: Props) {
  const [eye, setEye] = useState<CasseEye | "">("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [confirmValid, setConfirmValid] = useState(false);

  const allowOD = eyesOrdered == null || eyesOrdered === "od" || eyesOrdered === "both";
  const allowOG = eyesOrdered == null || eyesOrdered === "og" || eyesOrdered === "both";
  const allowBoth = eyesOrdered == null || eyesOrdered === "both";
  const onlyOption: CasseEye | null =
    eyesOrdered === "od" ? "od" : eyesOrdered === "og" ? "og" : null;

  useEffect(() => {
    if (open) {
      setEye(onlyOption ?? "");
      setNote("");
      setCode(randomConfirmCode());
      setConfirmValid(false);
    }
  }, [open, onlyOption]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            Déclaration de casse
          </DialogTitle>
          <DialogDescription>
            {numeroCommande ? `${numeroCommande} — ` : ""}
            Préciser l'œil concerné et, si besoin, la cause.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Œil(s) concerné(s) <span className="text-red-600">*</span>
            </Label>
            <RadioGroup
              value={eye}
              onValueChange={(v) => setEye(v as CasseEye)}
              className="space-y-1.5"
            >
              {allowOD && (
                <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2.5 hover:bg-muted/50">
                  <RadioGroupItem value="od" /> Œil droit (OD) uniquement
                </Label>
              )}
              {allowOG && (
                <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2.5 hover:bg-muted/50">
                  <RadioGroupItem value="og" /> Œil gauche (OG) uniquement
                </Label>
              )}
              {allowBoth && (
                <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2.5 hover:bg-muted/50">
                  <RadioGroupItem value="both" /> Les deux (OD + OG)
                </Label>
              )}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="casse-note" className="text-sm">
              Note / commentaire (optionnel)
            </Label>
            <Textarea
              id="casse-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cause, détails…"
              rows={3}
            />
          </div>
          {eye && (
            <ConfirmCodeField
              code={code}
              onValidChange={setConfirmValid}
              label="Action irréversible — recopiez le code pour confirmer la déclaration de casse."
            />
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={!eye || !confirmValid || isPending}
            onClick={() =>
              eye &&
              onConfirm({
                casse_eye: eye,
                casse_note: note.trim() ? note.trim() : null,
              })
            }
          >
            Confirmer la casse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
