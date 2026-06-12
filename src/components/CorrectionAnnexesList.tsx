import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, ImageIcon } from "lucide-react";
import {
  listAnnexes,
  getAnnexeSignedUrls,
  deleteAnnexe,
  type CorrectionAnnexe,
} from "@/lib/correction-annexes";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { AnnexesLightbox } from "@/components/AnnexesLightbox";

type Mode = "client" | "snapshot";

function truncate(name: string, max = 10) {
  if (name.length <= max) return name;
  return name.slice(0, max) + "…";
}

export function CorrectionAnnexesList({
  prescriptionId,
  canDelete,
  mode = "client",
}: {
  prescriptionId: string;
  canDelete: boolean;
  mode?: Mode;
  defaultOpen?: boolean;
  closable?: boolean;
}) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<CorrectionAnnexe | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["correction-annexes", prescriptionId],
    queryFn: async () => {
      const annexes = await listAnnexes(prescriptionId);
      const urls = await getAnnexeSignedUrls(annexes.map((a) => a.file_path));
      return { annexes, urls };
    },
  });

  const annexes = data?.annexes ?? [];
  const urls = data?.urls ?? {};

  const delMut = useMutation({
    mutationFn: (a: CorrectionAnnexe) => deleteAnnexe(a.id, a.file_path),
    onSuccess: () => {
      toast.success("Image supprimée");
      qc.invalidateQueries({
        queryKey: ["correction-annexes", prescriptionId],
      });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (annexes.length === 0) return null;

  const items = annexes.map((a) => ({
    url: urls[a.file_path] ?? "",
    name: a.file_name,
  }));

  const isSnapshot = mode === "snapshot";

  return (
    <div
      className={
        isSnapshot
          ? "rounded-lg border border-border bg-muted/30 p-4"
          : "space-y-2"
      }
    >
      <h4 className="text-sm font-semibold">
        Annexes justificatives ({annexes.length})
      </h4>

      <div className="flex flex-wrap gap-3">
        {annexes.map((a, i) => {
          const url = urls[a.file_path];
          return (
            <div key={a.id} className="relative w-[88px]">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="group block h-20 w-20 overflow-hidden rounded-md border border-border bg-muted hover:border-primary/60"
              >
                {url ? (
                  <img
                    src={url}
                    alt={a.file_name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </button>
              <p
                className="mt-1 truncate text-center text-[10px] text-muted-foreground"
                title={a.file_name}
              >
                {truncate(a.file_name, 12)}
              </p>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setDeleting(a)}
                  className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 text-muted-foreground shadow-sm ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="Supprimer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {lightboxIndex !== null && (
        <AnnexesLightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o: boolean) => !o && setDeleting(null)}
        title="Supprimer cette annexe ?"
        description={`L'image "${deleting?.file_name ?? ""}" sera supprimée définitivement.`}
        onConfirm={async () => {
          if (deleting) await delMut.mutateAsync(deleting);
        }}
      />
    </div>
  );
}
