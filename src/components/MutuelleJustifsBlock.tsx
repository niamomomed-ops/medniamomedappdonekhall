import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  listMutuelleJustificatifs,
  getMutuelleJustificatifsSignedUrls,
  deleteMutuelleJustificatif,
  type MutuelleJustificatif,
} from "@/lib/mutuelle-justificatifs.functions";
import { AnnexesLightbox } from "@/components/AnnexesLightbox";

export function MutuelleJustifsBlock({
  demandeId,
  readOnly = false,
}: {
  demandeId: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listMutuelleJustificatifs);
  const fetchUrls = useServerFn(getMutuelleJustificatifsSignedUrls);
  const doDelete = useServerFn(deleteMutuelleJustificatif);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["mutuelle-justifs", demandeId],
    queryFn: () => fetchList({ data: { demande_id: demandeId } }),
  });

  const items = (rows as MutuelleJustificatif[] | undefined) ?? [];
  const paths = useMemo(() => items.map((i) => i.file_path), [items]);

  const { data: urls } = useQuery({
    queryKey: ["mutuelle-justifs-urls", demandeId, paths.join(",")],
    queryFn: () => fetchUrls({ data: { paths } }),
    enabled: paths.length > 0,
  });

  const urlMap = (urls as Record<string, string> | undefined) ?? {};

  const delMut = useMutation({
    mutationFn: (j: MutuelleJustificatif) =>
      doDelete({ data: { id: j.id, file_path: j.file_path } }),
    onSuccess: () => {
      toast.success("Justificatif supprimé");
      qc.invalidateQueries({ queryKey: ["mutuelle-justifs", demandeId] });
      qc.invalidateQueries({ queryKey: ["mutuelles-justifs-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Justificatifs
        </h3>
        <p className="text-sm text-muted-foreground">Aucun justificatif.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Justificatifs ({items.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {items.map((j, idx) => {
            const url = urlMap[j.file_path];
            return (
              <div key={j.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  className="block h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
                >
                  {url ? (
                    <img
                      src={url}
                      alt={j.file_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      …
                    </div>
                  )}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Supprimer ce justificatif ?")) delMut.mutate(j);
                    }}
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white opacity-0 shadow group-hover:opacity-100"
                    aria-label="Supprimer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {lightboxIdx !== null && (
        <AnnexesLightbox
          items={items.map((i) => ({
            url: urlMap[i.file_path] ?? "",
            name: i.file_name,
          }))}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onIndexChange={setLightboxIdx}
        />
      )}
    </>
  );
}

export function MutuelleJustifsLightboxButton({
  demandeId,
  count,
}: {
  demandeId: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const fetchList = useServerFn(listMutuelleJustificatifs);
  const fetchUrls = useServerFn(getMutuelleJustificatifsSignedUrls);
  const [idx, setIdx] = useState(0);

  const { data: rows } = useQuery({
    queryKey: ["mutuelle-justifs", demandeId],
    queryFn: () => fetchList({ data: { demande_id: demandeId } }),
    enabled: open,
  });
  const items = (rows as MutuelleJustificatif[] | undefined) ?? [];
  const paths = items.map((i) => i.file_path);
  const { data: urls } = useQuery({
    queryKey: ["mutuelle-justifs-urls", demandeId, paths.join(",")],
    queryFn: () => fetchUrls({ data: { paths } }),
    enabled: open && paths.length > 0,
  });
  const urlMap = (urls as Record<string, string> | undefined) ?? {};

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIdx(0);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
      >
        👁 Voir justificatifs ({count})
      </button>
      {open && items.length > 0 && (
        <AnnexesLightbox
          items={items.map((i) => ({
            url: urlMap[i.file_path] ?? "",
            name: i.file_name,
          }))}
          index={idx}
          onClose={() => setOpen(false)}
          onIndexChange={setIdx}
        />
      )}
    </>
  );
}
