import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

export type MutuellePrintCommande = {
  numero_commande: string | null;
  type: string;
  monture_source?: string | null;
  montant: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  magasinNom: string | null;
  numeroDemande: string;
  clientNom: string | null;
  clientAge: number | null;
  organisme: string | null;
  source: "interne" | "externe" | "mixte";
  dette: number;
  commandes: MutuellePrintCommande[];
  total: number;
  hasBeneficiaire?: boolean;
  clientOrigineNom?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  vision_loin: "VL",
  vision_de_loin: "VL",
  vision_pres: "VP",
  vision_de_pres: "VP",
  double_foyer: "DF",
  progressif: "PRG",
  lentilles: "Lentilles",
};

function montureLabel(m?: string | null): string {
  if (m === "donnee") return "Donnée";
  if (m === "boutique") return "Boutique";
  return "—";
}

const fmtMoney = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cellBorder: React.CSSProperties = {
  border: "1px solid #000",
  padding: "3px 6px",
};

function sourceLabel(s: "interne" | "externe" | "mixte"): string {
  if (s === "interne") return "Interne — MDC : NON";
  if (s === "externe") return "Externe — MDC : OUI";
  return "Mixte — MDC : OUI";
}

export function MutuellePrintDialog({
  open,
  onOpenChange,
  magasinNom,
  numeroDemande,
  clientNom,
  clientAge,
  organisme,
  source,
  dette,
  commandes,
  total,
  hasBeneficiaire,
  clientOrigineNom,
}: Props) {
  const handlePrint = () => {
    const content = document.getElementById("mutuelle-print");
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=300,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Demande mutuelle ${numeroDemande}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.4;
              color: #000;
              background: #fff;
              width: 72mm;
            }
            table { width: 100%; border-collapse: collapse; }
            td { font-size: 11px; }
            @page { size: 72mm auto; margin: 3mm; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Demande mutuelle</DialogTitle>
        </DialogHeader>

        <div
          id="mutuelle-print"
          style={{
            width: "72mm",
            fontFamily: "'Courier New', monospace",
            fontSize: 11,
            padding: "4mm",
            color: "#000",
            background: "#fff",
            margin: "0 auto",
          }}
        >
          {/* HEADER */}
          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>
            {magasinNom ?? ""}
          </div>
          <hr style={{ border: "1px solid #000", margin: "4px 0" }} />
          <div style={{ textAlign: "center", fontWeight: "bold", margin: "6px 0 2px" }}>
            DEMANDE MUTUELLE
          </div>
          <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: 6 }}>
            {numeroDemande}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #000" }}>
            <tbody>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>Client</td>
                <td style={cellBorder}>{clientNom ?? ""}</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>Âge</td>
                <td style={cellBorder}>{clientAge != null ? `${clientAge} ans` : "—"}</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>Organisme</td>
                <td style={cellBorder}>{organisme ?? "—"}</td>
              </tr>
              {hasBeneficiaire && clientOrigineNom && (
                <tr>
                  <td colSpan={2} style={cellBorder}>
                    (Client d&apos;origine : {clientOrigineNom})
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>Source</td>
                <td style={cellBorder}>{sourceLabel(source)}</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>Dette</td>
                <td style={cellBorder}>{fmtMoney(dette)} DH</td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontWeight: "bold", margin: "8px 0 4px" }}>
            Commandes concernées :
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #000" }}>
            <tbody>
              {commandes.map((c, i) => (
                <tr key={i}>
                  <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>
                    {c.numero_commande ?? "—"}
                  </td>
                  <td style={cellBorder}>{TYPE_LABELS[c.type] ?? c.type}</td>
                  <td style={cellBorder}>{montureLabel(c.monture_source)}</td>
                  <td style={{ ...cellBorder, textAlign: "right", whiteSpace: "nowrap" }}>
                    {fmtMoney(Number(c.montant))} DH
                  </td>
                </tr>
              ))}
              <tr style={{ background: "#eee" }}>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>Total</td>
                <td colSpan={3} style={{ ...cellBorder, fontWeight: "bold", textAlign: "right" }}>
                  {fmtMoney(total)} DH
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-4 w-4" /> Fermer
          </Button>
          <Button
            onClick={handlePrint}
            style={{ backgroundColor: "#6366F1", color: "#fff" }}
          >
            <Printer className="mr-1.5 h-4 w-4" /> Imprimer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
