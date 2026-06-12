import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PartyPopper, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWhatsappBirthdayUrl } from "@/lib/birthday";
import {
  listTodayFelicitations,
  markClientFelicite,
} from "@/lib/felicitations.functions";

type Props = {
  clientId: string;
  nomComplet: string;
  telephone: string | null | undefined;
  whatsapp: string | null | undefined;
  size?: "sm" | "default";
  className?: string;
};

export function FeliciterButton({
  clientId,
  nomComplet,
  telephone,
  whatsapp,
  size = "sm",
  className,
}: Props) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTodayFelicitations);
  const doMark = useServerFn(markClientFelicite);

  const { data: felicitatedIds } = useQuery({
    queryKey: ["felicitations-today"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
  });

  const markMut = useMutation({
    mutationFn: () => doMark({ data: { client_id: clientId } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["felicitations-today"] }),
  });

  const done = (felicitatedIds as string[] | undefined)?.includes(clientId) ?? false;

  if (done) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ${className ?? ""}`}
        title="Client déjà félicité aujourd'hui"
      >
        <Check className="h-3.5 w-3.5" />
        Félicité
      </span>
    );
  }

  const url = buildWhatsappBirthdayUrl(telephone, whatsapp, nomComplet);
  if (!url) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
    markMut.mutate();
  };

  return (
    <Button
      size={size}
      onClick={handleClick}
      disabled={markMut.isPending}
      className={`bg-pink-500 text-white hover:bg-pink-600 ${className ?? ""}`}
      title="Féliciter par WhatsApp"
    >
      <PartyPopper className="mr-1 h-3.5 w-3.5" />
      🎉 Féliciter
    </Button>
  );
}
