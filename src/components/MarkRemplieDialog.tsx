import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MutuelleJustifsUploader,
  filesToBase64Payload,
} from "@/components/MutuelleJustifsUploader";
import { markDemandeRemplie } from "@/lib/mutuelles.functions";
import { uploadMutuelleJustificatifs } from "@/lib/mutuelle-justificatifs.functions";

export function MarkRemplieDialog({
  open,
  onOpenChange,
  demandeId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  demandeId: string;
  onDone?: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [prixMonture, setPrixMonture] = useState<string>("");
  const [prixVerre, setPrixVerre] = useState<string>("");
  const doMark = useServerFn(markDemandeRemplie);
  const doUpload = useServerFn(uploadMutuelleJustificatifs);

  const nMonture = Number(prixMonture);
  const nVerre = Number(prixVerre);
  const monValid = prixMonture !== "" && Number.isFinite(nMonture) && nMonture >= 0;
  const verreValid = prixVerre !== "" && Number.isFinite(nVerre) && nVerre >= 0;
  const total = (monValid ? nMonture : 0) + (verreValid ? nVerre : 0);
  const formValid = monValid && verreValid;

  const mut = useMutation({
    mutationFn: async () => {
      await doMark({
        data: { id: demandeId, prix_monture: nMonture, prix_verre: nVerre },
      });
      if (files.length > 0) {
        const payload = await filesToBase64Payload(files);
        await doUpload({ data: { demandeId, files: payload } });
      }
    },
    onSuccess: () => {
      toast.success(
        files.length > 0
          ? "Demande remplie + justificatifs uploadés"
          : "Demande marquée comme remplie",
      );
      setFiles([]);
      setPrixMonture("");
      setPrixVerre("");
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) {
          if (!o) {
            setFiles([]);
            setPrixMonture("");
            setPrixVerre("");
          }
          onOpenChange(o);
        }
      }}
    >
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Marquer comme remplie</AlertDialogTitle>
          <AlertDialogDescription>
            Saisissez les informations de remboursement avant de confirmer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-semibold">Informations de remboursement</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="prix-monture">Prix monture (DH)</Label>
              <Input
                id="prix-monture"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={prixMonture}
                onChange={(e) => setPrixMonture(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prix-verre">Prix verre (DH)</Label>
              <Input
                id="prix-verre"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={prixVerre}
                onChange={(e) => setPrixVerre(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm font-medium text-muted-foreground">Total remboursement</span>
            <span className="text-base font-semibold tabular-nums text-primary">
              {total.toFixed(2)} DH
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Justificatifs (optionnel)</p>
          <MutuelleJustifsUploader value={files} onChange={setFiles} />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mut.isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={mut.isPending || !formValid}
            onClick={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
          >
            {mut.isPending ? "En cours…" : "Confirmer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
