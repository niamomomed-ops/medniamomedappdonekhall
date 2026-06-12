import { useRef, useState } from "react";
import { IdCard, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEntreprise } from "@/hooks/useEntreprise";
import { useLogoUrl } from "@/hooks/useLogoUrl";
import { ClientQRCode } from "@/components/ClientQRCode";

export function CarteDeVisiteButton() {
  const [open, setOpen] = useState(false);
  const { entreprise } = useEntreprise();
  const { data: logoUrl } = useLogoUrl(entreprise?.logo_url);
  const ticketRef = useRef<HTMLDivElement>(null);

  const nom = entreprise?.nom ?? "";
  const slogan = entreprise?.slogan ?? "";
  const telephone = entreprise?.telephone ?? "";
  const siteWeb = entreprise?.site_web ?? "";
  const adresse = [entreprise?.adresse, entreprise?.ville]
    .filter(Boolean)
    .join(", ");

  const waSource = entreprise?.whatsapp || telephone;
  const telDigits = waSource.replace(/\D/g, "");
  const waUrl = telDigits ? `https://wa.me/${telDigits}` : "";

  const handlePrint = () => {
    if (!ticketRef.current) return;
    const html = ticketRef.current.innerHTML;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Carte de visite</title>
<style>
@page { size: 80mm auto; margin: 4mm; }
* { box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; text-align: center; color: #000; }
img.logo { max-width: 60px; margin: 0 auto 4px; display: block; }
.sep-eq { border-top: 1px solid #000; margin: 4px 0; }
.sep-dash { border-top: 1px dashed #000; margin: 4px 0; }
.carte-row { margin: 2px 0; line-height: 1.3; }
.carte-section { margin-top: 3px; margin-bottom: 3px; }
.info { text-align: left; padding: 2px 0; }
.qr { margin: 6px auto; display: block; }
.small { font-size: 10px; color: #555; }
.nom { font-weight: bold; font-size: 13px; }
.slogan { font-size: 12px; }
</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <IdCard className="mr-2 h-4 w-4" />
          Carte de Visite
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Carte de visite</DialogTitle>
        </DialogHeader>

        <div
          ref={ticketRef}
          className="mx-auto bg-white p-3 text-black"
          style={{
            width: "72mm",
            fontFamily: "'Courier New', monospace",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          {logoUrl && (
            <img src={logoUrl} alt="logo" className="logo mx-auto block" />
          )}
          <div className="sep-eq" />
          <div className="carte-row nom">{nom}</div>
          {slogan && <div className="carte-row slogan">{slogan}</div>}
          <div className="sep-eq" />
          {telephone && (
            <div className="carte-row info">📞 {telephone}</div>
          )}
          {siteWeb && <div className="carte-row info">🌐 {siteWeb}</div>}
          {adresse && <div className="carte-row info">📍 {adresse}</div>}
          {waUrl && (
            <>
              <div className="sep-dash" />
              <div className="qr" style={{ margin: "6px auto" }}>
                <ClientQRCode value={waUrl} size={120} style={{ margin: "0 auto" }} />
              </div>
              <div className="carte-row small">
                Scanner pour nous contacter sur WhatsApp
              </div>
              <div className="sep-dash" />
            </>
          )}
          <div className="carte-row">Nous sommes à votre service !</div>
          <div className="sep-eq" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fermer
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
