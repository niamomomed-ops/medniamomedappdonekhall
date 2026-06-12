import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { useEntreprise } from "@/hooks/useEntreprise";
import { useLogoUrl } from "@/hooks/useLogoUrl";
import { TYPE_LABELS } from "@/lib/commande-labels";
import { ClientQRCode } from "@/components/ClientQRCode";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storeName?: string | null;
  numeroCommande: string | null;
  clientName: string | null;
  telephone: string | null;
  total: number;
  verse: number;
  reste: number;
  type?: string | null;
  montureSource?: "boutique" | "donnee" | null;
  dateCreation?: string | null;
  dateLivraison?: string | null;
  title?: string;
  cancelLabel?: string;
  onAfterAction?: (action: "print" | "cancel") => void;
  deleted?: boolean;
};

const fmt = (n: number) =>
  `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MAD`;

const formatDate = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));

const WIDTH = 32;

function centered(s: string) {
  const p = Math.max(0, Math.floor((WIDTH - s.length) / 2));
  return " ".repeat(p) + s;
}

function line(label: string, value: string) {
  return pad(label, WIDTH - value.length) + value;
}

export function ReceiptDialog({
  open,
  onOpenChange,
  numeroCommande,
  clientName,
  telephone,
  total,
  verse,
  reste,
  type,
  montureSource,
  dateCreation,
  dateLivraison,
  title = "Reçu client",
  cancelLabel = "Fermer",
  onAfterAction,
  deleted = false,
}: Props) {
  const { entreprise } = useEntreprise();
  const { data: logoUrl } = useLogoUrl(entreprise?.logo_url);
  const dash = "-".repeat(WIDTH);
  const solded = reste <= 0.005;

  const typeLabel = type ? TYPE_LABELS[type] ?? null : null;
  const libelleVerre =
    type === "lentilles"
      ? "Lentilles"
      : montureSource === "boutique"
        ? "Verre correcteur + Monture"
        : "Verre correcteur";

  const headerLine = [numeroCommande, formatDate(dateCreation)].filter(Boolean).join("  -  ");

  let livraisonTexte: string | null = null;
  if (dateLivraison) {
    const d = new Date(dateLivraison);
    if (!isNaN(d.getTime())) {
      const jour = d.toLocaleDateString("fr-FR", { weekday: "long" });
      const dateF = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      livraisonTexte = `${jour.charAt(0).toUpperCase() + jour.slice(1)} ${dateF} soir`;
    }
  }

  const lines: string[] = [];
  lines.push(headerLine);
  if (typeLabel) lines.push(`· ${typeLabel} ·`);
  lines.push("");
  if (clientName) lines.push(`Client : ${clientName}`);
  if (telephone) lines.push(`Tel    : ${telephone}`);
  lines.push(dash);
  lines.push(centered("DÉTAILS COMMANDE"));
  lines.push(dash);
  lines.push(libelleVerre);
  lines.push(line("Total TTC", fmt(total)));
  lines.push(dash);
  lines.push(centered("PAIEMENT"));
  lines.push(dash);
  lines.push(line("Versé", fmt(verse)));

  const handlePrintReceipt = () => {
    const content = document.getElementById("receipt");
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=300,height=600");
    if (!printWindow) return;

    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-no-print="true"]').forEach((el) => el.remove());

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Reçu client</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.3;
              color: #000;
              background: #fff;
              width: 72mm;
              position: relative;
            }
            .recu-section   { margin-top: 2px; margin-bottom: 2px; padding: 0; }
            .recu-separator { margin: 3px 0; }
            .recu-row       { line-height: 1.3; margin: 1px 0; }
            pre { margin: 0; }
            .deleted-watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-30deg);
              font-size: 28px;
              font-weight: bold;
              color: rgba(220, 38, 38, 0.28);
              border: 4px solid rgba(220, 38, 38, 0.28);
              padding: 6px 16px;
              white-space: nowrap;
              pointer-events: none;
              z-index: 9999;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
            @page { size: 72mm auto; margin: 3mm; }
          </style>
        </head>
        <body>${deleted ? '<div class="deleted-watermark">Commande supprimée</div>' : ''}${clone.innerHTML}</body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);

    onOpenChange(false);
    onAfterAction?.("print");
  };

  const handleCancel = () => {
    onOpenChange(false);
    onAfterAction?.("cancel");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); else onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div
          id="receipt"
          className="receipt-body relative rounded-md border border-border bg-white p-4 font-mono text-[12px] leading-snug text-black"
        >
          {deleted && (
            <div
              data-no-print="true"
              className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
              aria-hidden
            >
              <span
                className="rotate-[-30deg] whitespace-nowrap border-4 border-red-600/30 px-4 py-1 text-2xl font-bold uppercase tracking-widest text-red-600/30"
              >
                Commande supprimée
              </span>
            </div>
          )}
          {entreprise?.nom && (
            <div className="recu-section mb-2 flex flex-col items-center gap-1 border-b border-dashed border-black/30 pb-2 text-center">
              {entreprise.logo_url && logoUrl && (
                <img
                  src={logoUrl}
                  alt={entreprise.nom}
                  style={{ maxHeight: 50, maxWidth: 120, objectFit: "contain", display: "block", margin: "0 auto" }}
                />
              )}
              <div className="text-[11px] leading-tight">
                <div className="font-bold uppercase">{entreprise.nom}</div>
                {entreprise.slogan && <div className="italic">{entreprise.slogan}</div>}
                {(entreprise.adresse || entreprise.ville) && (
                  <div>📍 {[entreprise.adresse, entreprise.ville].filter(Boolean).join(", ")}</div>
                )}
                {entreprise.telephone && <div>📞 {entreprise.telephone}</div>}
                {entreprise.whatsapp && <div>🟢 WhatsApp : {entreprise.whatsapp}</div>}
                {entreprise.site_web && <div>🌐 {entreprise.site_web}</div>}
              </div>
            </div>
          )}
          <pre className="recu-section m-0 whitespace-pre-wrap font-mono">
{lines.join("\n")}
          </pre>
          {solded ? (
            <p className="recu-row m-0 text-center font-semibold">✅ Soldé</p>
          ) : (
            <pre className="recu-row m-0 whitespace-pre-wrap font-mono">{line("Reste dû", fmt(reste))}</pre>
          )}
          {livraisonTexte && (
            <pre className="recu-section m-0 whitespace-pre-wrap font-mono">
{dash}
{"\n"}Livraison prévue le:
{"\n"}  {livraisonTexte}
            </pre>
          )}
          <pre className="recu-section m-0 whitespace-pre-wrap font-mono">
{dash}
{"\n"}
{centered("Merci de votre confiance !")}
{"\n"}
{dash}
          </pre>
          {(() => {
            const waSource = entreprise?.whatsapp || entreprise?.telephone;
            const waDigits = waSource ? waSource.replace(/\D/g, "") : "";
            if (!waDigits) return null;
            const waUrl = `https://wa.me/${waDigits}`;
            return (
              <div className="recu-section mt-2 flex flex-col items-center gap-1">
                <ClientQRCode value={waUrl} size={96} />
                <div className="text-[10px]">Scannez pour nous écrire sur WhatsApp</div>
              </div>
            );
          })()}
        </div>

        <div className="flex justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={handleCancel}>
            <X className="mr-1.5 h-4 w-4" /> {cancelLabel}
          </Button>
          <Button onClick={handlePrintReceipt}>
            <Printer className="mr-1.5 h-4 w-4" /> Imprimer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
