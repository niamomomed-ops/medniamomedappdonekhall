import { useEffect, useState } from "react";
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
import {
  pickupMessage,
  pickupWhatsappNumber,
  type PickupOrderType,
  type WhatsappMessageKind,
} from "@/lib/whatsapp-pickup";
import { useEntreprise, type Entreprise } from "@/hooks/useEntreprise";

function buildSignature(e: Entreprise | null): string {
  if (!e || !e.nom) return "";
  const lines = [`--`, e.nom];
  if (e.telephone) lines.push(`📞 ${e.telephone}`);
  const addr = [e.adresse, e.ville].filter(Boolean).join(", ");
  if (addr) lines.push(`📍 ${addr}`);
  return "\n\n" + lines.join("\n");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string | null | undefined;
  telephone: string | null | undefined;
  whatsapp: string | null | undefined;
  type: PickupOrderType;
  kind?: WhatsappMessageKind;
};

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

export function PickupWhatsappDialog({
  open,
  onOpenChange,
  clientName,
  telephone,
  whatsapp,
  type,
  kind = "pickup",
}: Props) {
  const [message, setMessage] = useState("");
  const { entreprise } = useEntreprise();

  useEffect(() => {
    if (open) setMessage(pickupMessage(clientName, type, kind) + buildSignature(entreprise));
    else setMessage("");
  }, [open, clientName, type, kind, entreprise]);

  const phoneRaw = pickupWhatsappNumber(telephone, whatsapp);
  const noPhone = !phoneRaw.trim();

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
          <DialogTitle>Prévenir le client (WhatsApp)</DialogTitle>
          <DialogDescription>
            {clientName
              ? `Message à envoyer à ${clientName} via WhatsApp.`
              : "Aperçu du message à envoyer via WhatsApp."}
          </DialogDescription>
        </DialogHeader>

        {noPhone ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Aucun numéro de téléphone/WhatsApp enregistré pour ce client
          </p>
        ) : (
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="font-mono text-sm"
            dir="auto"
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={noPhone || !message.trim()}
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
