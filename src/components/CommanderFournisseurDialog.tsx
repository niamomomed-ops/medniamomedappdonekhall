import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCommande } from "@/lib/commandes.functions";
import { buildFournisseurMessage } from "@/lib/whatsapp-fournisseur";
import { useEntreprise } from "@/hooks/useEntreprise";

type Props = {
  commandeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  casseMode?: boolean;
};

function buildMessage(cmd: any, casseMode = false, magasinNom?: string | null): string {
  const prefix: string[] = [];
  let eyesOverride: "both" | "od" | "og" | null | undefined = undefined;
  if (casseMode) {
    const dateStr = cmd?.created_at
      ? new Date(cmd.created_at).toLocaleDateString("fr-FR")
      : "—";
    prefix.push(
      `Casse montage — Référence : ${cmd?.numero_commande ?? "—"} — Commande originale passée le ${dateStr}`,
    );
    eyesOverride = (cmd?.casse_eye as any) ?? (cmd?.eyes_ordered as any) ?? "both";
  }
  return buildFournisseurMessage(cmd, { prefix, eyesOverride, magasinNom });
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

export function CommanderFournisseurDialog({ commandeId, open, onOpenChange, casseMode = false }: Props) {
  const fetchOne = useServerFn(getCommande);
  const { entreprise } = useEntreprise();
  const { data, isLoading } = useQuery({
    queryKey: ["commande", commandeId, "for-fournisseur", casseMode ? "casse" : "std"],
    queryFn: () => fetchOne({ data: { id: commandeId as string } }),
    enabled: open && Boolean(commandeId),
  });

  const cmd = data as any;
  const [message, setMessage] = useState("");

  const generated = useMemo(
    () => (cmd ? buildMessage(cmd, casseMode, entreprise?.nom ?? null) : ""),
    [cmd, casseMode, entreprise?.nom],
  );

  useEffect(() => {
    if (open && cmd) setMessage(generated);
    if (!open) setMessage("");
  }, [open, cmd, generated]);

  const fournisseur = cmd?.fournisseurs ?? null;
  const phoneRaw =
    (fournisseur?.whatsapp && String(fournisseur.whatsapp).trim()) ||
    (fournisseur?.telephone && String(fournisseur.telephone).trim()) ||
    "";

  const noFournisseur = Boolean(cmd) && !fournisseur;
  const noPhone = Boolean(fournisseur) && !phoneRaw;

  const handleSend = () => {
    if (!phoneRaw) return;
    const phone = normalizePhone(phoneRaw);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Commander au fournisseur</DialogTitle>
          <DialogDescription>
            {fournisseur?.nom
              ? `Message à envoyer à ${fournisseur.nom} via WhatsApp.`
              : "Aperçu du message à envoyer via WhatsApp."}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !cmd ? (
          <p className="py-6 text-sm text-muted-foreground">Chargement…</p>
        ) : noFournisseur ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Aucun fournisseur associé à cette commande
          </p>
        ) : noPhone ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Numéro WhatsApp du fournisseur non renseigné
          </p>
        ) : (
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={14}
            className="font-mono text-sm"
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={!cmd || noFournisseur || noPhone || !message.trim()}
            onClick={handleSend}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Envoyer sur WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
