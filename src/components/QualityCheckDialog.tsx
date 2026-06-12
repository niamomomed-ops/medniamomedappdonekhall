import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { ConfirmCodeField, randomConfirmCode } from "@/components/ConfirmCodeField";
import { formatCorrectionDisplay } from "@/lib/correction-display";

function transposeEye(e: QualityEyeCorrection): QualityEyeCorrection {
  if (e.sphere == null && e.cylinder == null && e.axe == null) return e;
  const s = Number(e.sphere ?? 0);
  const c = Number(e.cylinder ?? 0);
  const a = e.axe == null ? null : Number(e.axe);
  return {
    ...e,
    sphere: s + c,
    cylinder: -c,
    axe: a == null ? null : a <= 90 ? a + 90 : a - 90,
  };
}

export type QualityProgressive = {
  ecart_pupillaire_od: number | null;
  ecart_pupillaire_og: number | null;
  hauteur_pupillaire_od: number | null;
  hauteur_pupillaire_og: number | null;
  grand_diametre: number | null;
  hauteur_calibre: number | null;
  pont: number | null;
} | null;

export type QualityState = "correct" | "manquant" | "errone";
export type QualityCheckPayload = {
  od?: QualityState;
  og?: QualityState;
};

export type QualityEyeCorrection = {
  sphere: number | null;
  cylinder: number | null;
  axe: number | null;
  addition: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numeroCommande?: string | null;
  /** Yeux concernés par cette réception (peut être restreint en cas de casse partielle). */
  eyesToCheck: "od" | "og" | "both";
  isPending?: boolean;
  onConfirm: (payload: QualityCheckPayload) => void;
  od?: QualityEyeCorrection | null;
  og?: QualityEyeCorrection | null;
  showAddition?: boolean;
  isProgressif?: boolean;
  progressive?: QualityProgressive;
};

export function QualityCheckDialog({
  open,
  onOpenChange,
  numeroCommande,
  eyesToCheck,
  isPending,
  onConfirm,
  od,
  og,
  showAddition = true,
  isProgressif = false,
  progressive,
}: Props) {
  const hasOD = eyesToCheck === "both" || eyesToCheck === "od";
  const hasOG = eyesToCheck === "both" || eyesToCheck === "og";
  const isBoth = eyesToCheck === "both";

  // En "both" : checkboxes (par défaut cochées) + radios Correct/Erroné
  // En un seul œil : pas de checkbox, juste radio Correct/Erroné (toujours présent)
  const [odPresent, setOdPresent] = useState(true);
  const [ogPresent, setOgPresent] = useState(true);
  const [odState, setOdState] = useState<"correct" | "errone">("correct");
  const [ogState, setOgState] = useState<"correct" | "errone">("correct");
  const [code, setCode] = useState("");
  const [confirmValid, setConfirmValid] = useState(false);
  const [converted, setConverted] = useState(false);

  const odDisplay = od ? (converted ? transposeEye(od) : od) : null;
  const ogDisplay = og ? (converted ? transposeEye(og) : og) : null;
  const cylNeg =
    (od?.cylinder != null && Number(od.cylinder) < 0) ||
    (og?.cylinder != null && Number(og.cylinder) < 0);
  const hasCyl =
    (od?.cylinder != null && Number(od.cylinder) !== 0) ||
    (og?.cylinder != null && Number(og.cylinder) !== 0);
  const toggleLabel = converted
    ? cylNeg
      ? "⇄ Revenir au cylindre négatif"
      : "⇄ Revenir au cylindre positif"
    : cylNeg
      ? "⇄ Passer au cylindre positif"
      : "⇄ Passer au cylindre négatif";

  useEffect(() => {
    if (open) {
      setOdPresent(true);
      setOgPresent(true);
      setOdState("correct");
      setOgState("correct");
      setCode(randomConfirmCode());
      setConfirmValid(false);
      setConverted(false);
    }
  }, [open]);

  const odFinal: QualityState | undefined = hasOD
    ? isBoth
      ? odPresent
        ? odState
        : "manquant"
      : odState
    : undefined;
  const ogFinal: QualityState | undefined = hasOG
    ? isBoth
      ? ogPresent
        ? ogState
        : "manquant"
      : ogState
    : undefined;

  const hasProblem =
    odFinal === "manquant" ||
    odFinal === "errone" ||
    ogFinal === "manquant" ||
    ogFinal === "errone";

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (odFinal === "manquant") parts.push("OD manquant");
    if (odFinal === "errone") parts.push("OD erroné");
    if (ogFinal === "manquant") parts.push("OG manquant");
    if (ogFinal === "errone") parts.push("OG erroné");
    return parts.join(" · ");
  }, [odFinal, ogFinal]);

  const canConfirm = !isPending && (!hasProblem || confirmValid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle
            className={
              hasProblem
                ? "flex items-center gap-2 text-amber-700 dark:text-amber-300"
                : "flex items-center gap-2 text-emerald-700 dark:text-emerald-300"
            }
          >
            {hasProblem ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            Contrôle qualité à la réception
          </DialogTitle>
          <DialogDescription>
            {numeroCommande ? `${numeroCommande} — ` : ""}
            Vérifier la présence et la conformité du / des verre(s) reçu(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {hasCyl && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConverted((v) => !v)}
                className={`h-7 text-xs ${
                  converted !== cylNeg
                    ? "bg-green-500 text-white hover:bg-green-600 border-green-500"
                    : "bg-red-500 text-white hover:bg-red-600 border-red-500"
                }`}
              >
                <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                {toggleLabel}
              </Button>
            </div>
          )}
          {hasOD && (
            <EyeRow
              label="OD (Œil droit)"
              isBoth={isBoth}
              present={odPresent}
              onPresentChange={setOdPresent}
              state={odState}
              onStateChange={setOdState}
              correction={
                odDisplay
                  ? formatCorrectionDisplay(odDisplay.sphere, odDisplay.cylinder, odDisplay.axe, odDisplay.addition, showAddition)
                  : null
              }
              progressiveLines={
                isProgressif && progressive
                  ? [
                      progressive.ecart_pupillaire_od != null ? `EP : ${progressive.ecart_pupillaire_od}` : null,
                      progressive.hauteur_pupillaire_od != null ? `HP : ${progressive.hauteur_pupillaire_od}` : null,
                    ].filter(Boolean) as string[]
                  : null
              }
            />
          )}
          {hasOG && (
            <EyeRow
              label="OG (Œil gauche)"
              isBoth={isBoth}
              present={ogPresent}
              onPresentChange={setOgPresent}
              state={ogState}
              onStateChange={setOgState}
              correction={
                ogDisplay
                  ? formatCorrectionDisplay(ogDisplay.sphere, ogDisplay.cylinder, ogDisplay.axe, ogDisplay.addition, showAddition)
                  : null
              }
              progressiveLines={
                isProgressif && progressive
                  ? [
                      progressive.ecart_pupillaire_og != null ? `EP : ${progressive.ecart_pupillaire_og}` : null,
                      progressive.hauteur_pupillaire_og != null ? `HP : ${progressive.hauteur_pupillaire_og}` : null,
                    ].filter(Boolean) as string[]
                  : null
              }
            />
          )}
          {isProgressif && progressive && (progressive.grand_diametre != null || progressive.hauteur_calibre != null || progressive.pont != null) && (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-sm font-mono space-y-0.5">
              {progressive.grand_diametre != null && <div>Grand diamètre : {progressive.grand_diametre}</div>}
              {progressive.hauteur_calibre != null && <div>Hauteur calibre : {progressive.hauteur_calibre}</div>}
              {progressive.pont != null && <div>Pont : {progressive.pont}</div>}
            </div>
          )}

          {hasProblem && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                ⚠️ Problème détecté : {summary}
              </p>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                La commande restera bloquée au statut « Verre commandé ». L'agent
                de vente devra envoyer une réclamation au fournisseur.
              </p>
            </div>
          )}

          {hasProblem && (
            <ConfirmCodeField
              code={code}
              onValidChange={setConfirmValid}
              label="Recopiez le code pour confirmer la déclaration de réclamation."
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
            variant={hasProblem ? "default" : "default"}
            disabled={!canConfirm}
            className={hasProblem ? "bg-amber-600 text-white hover:bg-amber-700" : ""}
            onClick={() => {
              const payload: QualityCheckPayload = {};
              if (hasOD && odFinal) payload.od = odFinal;
              if (hasOG && ogFinal) payload.og = ogFinal;
              onConfirm(payload);
            }}
          >
            {hasProblem ? "Déclarer la réclamation" : "Confirmer la réception"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EyeRow({
  label,
  isBoth,
  present,
  onPresentChange,
  state,
  onStateChange,
  correction,
  progressiveLines,
}: {
  label: string;
  isBoth: boolean;
  present: boolean;
  onPresentChange: (b: boolean) => void;
  state: "correct" | "errone";
  onStateChange: (s: "correct" | "errone") => void;
  correction?: string | null;
  progressiveLines?: string[] | null;
}) {
  const disabled = isBoth && !present;
  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isBoth && (
            <Checkbox
              checked={present}
              onCheckedChange={(c) => onPresentChange(Boolean(c))}
              id={`present-${label}`}
            />
          )}
          <Label
            htmlFor={`present-${label}`}
            className={isBoth ? "cursor-pointer font-semibold" : "font-semibold"}
          >
            {label}
            {isBoth && !present && (
              <span className="ml-2 text-xs font-normal text-red-600">
                Manquant
              </span>
            )}
          </Label>
        </div>
        <RadioGroup
          value={state}
          onValueChange={(v) => onStateChange(v as "correct" | "errone")}
          className="flex items-center gap-3"
        >
          <Label
            className={`flex cursor-pointer items-center gap-1.5 text-sm ${
              disabled ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <RadioGroupItem value="correct" disabled={disabled} /> Correct
          </Label>
          <Label
            className={`flex cursor-pointer items-center gap-1.5 text-sm ${
              disabled ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <RadioGroupItem value="errone" disabled={disabled} /> Erroné
          </Label>
        </RadioGroup>
      </div>
      {correction && (
        <div className="text-base font-mono font-bold text-foreground border-t border-border pt-2">
          {correction}
        </div>
      )}
      {progressiveLines && progressiveLines.length > 0 && (
        <div className="text-sm font-mono text-muted-foreground space-y-0.5">
          {progressiveLines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
