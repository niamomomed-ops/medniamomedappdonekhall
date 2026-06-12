import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  MutuelleJustifsUploader,
  filesToBase64Payload,
} from "@/components/MutuelleJustifsUploader";
import { uploadMutuelleJustificatifs } from "@/lib/mutuelle-justificatifs.functions";

export function AddJustifsDialog({
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
  const doUpload = useServerFn(uploadMutuelleJustificatifs);

  const mut = useMutation({
    mutationFn: async () => {
      if (files.length === 0) return;
      const payload = await filesToBase64Payload(files);
      await doUpload({ data: { demandeId, files: payload } });
    },
    onSuccess: () => {
      toast.success("Justificatifs ajoutés");
      setFiles([]);
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) {
          if (!o) setFiles([]);
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter des justificatifs</DialogTitle>
          <DialogDescription>JPG ou PNG, 5 MB max par fichier.</DialogDescription>
        </DialogHeader>

        <MutuelleJustifsUploader value={files} onChange={setFiles} />

        <DialogFooter>
          <Button
            variant="outline"
            disabled={mut.isPending}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            disabled={mut.isPending || files.length === 0}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Upload…" : `Uploader (${files.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
