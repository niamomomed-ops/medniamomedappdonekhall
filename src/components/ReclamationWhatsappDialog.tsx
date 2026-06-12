import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  buildReclamationMessage,
  type ReclamationDetail,
} from "@/lib/whatsapp-reclamation";
import { useEntreprise } from "@/hooks/useEntreprise";

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  commande: any | null;
};

export function ReclamationWhatsappDialog({ open, onOpenChange, commande }: Props) {
  const { entreprise } = useEntreprise();
  const [message, setMessage] = useState("");

  const fournisseur = commande?.fournisseurs ?? null;
  const fournisseurPhone =
    (fournisseur?.whatsapp && String(fournisseur.whatsapp).trim()) ||
    (fournisseur?.telephone && String(fournisseur.telephone).trim()) ||
    "";
  const detail = (commande?.reclamation_detail ?? {}) as ReclamationDetail;

  useEffect(() => {
    if (open && commande) {
      setMessage(buildReclamationMessage(commande, detail, entreprise?.nom ?? null));
    }
  }, [open, commande?.id, entreprise?.nom]);

  const sendWhatsapp = () => {
    if (!fournisseurPhone) {
      toast.error("Aucun numéro WhatsApp pour ce fournisseur");
      return;
    }
    const url = `https://wa.me/${normalizePhone(fournisseurPhone)}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Réclamation au fournisseur</DialogTitle>
          <DialogDescription>
            {fournisseur?.nom
              ? `Message à envoyer à ${fournisseur.nom} via WhatsApp.`
              : "Aperçu du message à envoyer via WhatsApp."}
          </DialogDescription>
        </DialogHeader>
        {!fournisseur ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Aucun fournisseur associé à cette commande
          </p>
        ) : !fournisseurPhone ? (
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
            disabled={!fournisseur || !fournisseurPhone || !message.trim()}
            onClick={sendWhatsapp}
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Envoyer sur WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
