import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { useLogoUrl } from "@/hooks/useLogoUrl";

export type MutuelleAdminPrintCommande = {
  numero_commande: string | null;
  type: string;
  monture_source?: string | null;
  montant: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entreprise: {
    nom: string | null;
    slogan: string | null;
    telephone: string | null;
    site_web: string | null;
    logo_url: string | null;
    couleur_principale: string | null;
  } | null;
  numeroDemande: string;
  beneficiaireNom: string | null;
  beneficiaireAge: number | null;
  beneficiaireOrganisme: string | null;
  hasBeneficiaire: boolean;
  clientOrigineNom: string | null;
  source: "interne" | "externe" | "mixte";
  statut: "en_attente" | "remplie" | "livree";
  createdAt: string;
  commandes: MutuelleAdminPrintCommande[];
  total: number;
};

const TYPE_LABELS: Record<string, string> = {
  vision_loin: "Vision de loin",
  vision_pres: "Vision de près",
  double_foyer: "Double foyer",
  progressif: "Progressif",
  lentilles: "Lentilles",
};

const fmtMoney = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sourceLabel = (s: string) =>
  s === "interne" ? "Interne" : s === "externe" ? "Externe" : "Mixte";

const statutLabel = (s: string) =>
  s === "remplie" ? "Remplie" : s === "livree" ? "Livrée" : "En attente";

export function MutuelleAdminPrintDialog({
  open,
  onOpenChange,
  entreprise,
  numeroDemande,
  beneficiaireNom,
  beneficiaireAge,
  beneficiaireOrganisme,
  hasBeneficiaire,
  clientOrigineNom,
  source,
  statut,
  createdAt,
  commandes,
  total,
}: Props) {
  const couleur = entreprise?.couleur_principale || "#6366F1";
  const { data: logoUrl } = useLogoUrl(entreprise?.logo_url);

  const handlePrint = () => {
    const content = document.getElementById("mutuelle-admin-print");
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=800,height=900");
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
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
              color: #111827;
              background: #fff;
              padding: 0;
            }
            @page { size: A5; margin: 10mm; }
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Demande de remboursement mutuelle</DialogTitle>
        </DialogHeader>

        <div
          id="mutuelle-admin-print"
          style={{
            fontFamily: "'Inter', sans-serif",
            maxWidth: 600,
            margin: "0 auto",
            padding: 32,
            background: "#fff",
            color: "#111827",
          }}
        >
          {/* HEADER */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 24,
              paddingBottom: 16,
              borderBottom: `2px solid ${couleur}`,
            }}
          >
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                style={{ width: 64, height: 64, objectFit: "contain" }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
                {entreprise?.nom ?? ""}
              </div>
              {entreprise?.slogan && (
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                  {entreprise.slogan}
                </div>
              )}
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {[entreprise?.telephone, entreprise?.site_web].filter(Boolean).join(" — ")}
              </div>
            </div>
          </div>

          {/* TITRE */}
          <div
            style={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "#374151",
              letterSpacing: "0.05em",
              margin: "16px 0 4px",
              textTransform: "uppercase",
            }}
          >
            Demande de remboursement mutuelle
          </div>
          <div
            style={{
              textAlign: "center",
              fontSize: 28,
              fontWeight: 800,
              color: couleur,
              marginBottom: 24,
              letterSpacing: "0.02em",
            }}
          >
            {numeroDemande}
          </div>

          {/* SECTION BÉNÉFICIAIRE / CLIENT */}
          <div
            style={{
              background: "#eff6ff",
              borderLeft: `4px solid ${couleur}`,
              borderRadius: 4,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#6b7280",
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              📋 Informations {hasBeneficiaire ? "bénéficiaire" : "client"}
            </div>
            <InfoRow label="Nom" value={beneficiaireNom ?? "—"} />
            <InfoRow label="Âge" value={beneficiaireAge != null ? `${beneficiaireAge} ans` : "—"} />
            <InfoRow label="Organisme" value={beneficiaireOrganisme ?? "—"} />
            {hasBeneficiaire && clientOrigineNom && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: "1px dashed #cbd5e1",
                  fontSize: 12,
                  color: "#6b7280",
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                — Client d'origine : {clientOrigineNom} —
              </div>
            )}
          </div>

          {/* COMMANDES */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#6b7280",
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              🛒 Commandes concernées
            </div>
            <div style={{ borderTop: "1px solid #e5e7eb" }}>
              {commandes.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 4px",
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: 14,
                  }}
                >
                  <div style={{ display: "flex", gap: 16 }}>
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {c.numero_commande ?? "—"}
                    </span>
                    <span style={{ color: "#6b7280" }}>
                      {TYPE_LABELS[c.type] ?? c.type}
                    </span>
                  </div>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(Number(c.montant))} DH
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                background: couleur,
                color: "#fff",
                padding: "12px 16px",
                borderRadius: 6,
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: 17,
                marginTop: 12,
              }}
            >
              <span>TOTAL</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(total)} DH</span>
            </div>
          </div>

          {/* PIED */}
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              paddingTop: 12,
              fontSize: 13,
            }}
          >
            <InfoRow
              label="Date demande"
              value={new Date(createdAt).toLocaleDateString("fr-FR")}
            />
            <InfoRow label="Source" value={sourceLabel(source)} />
            <InfoRow label="Statut" value={statutLabel(statut)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-4 w-4" /> Fermer
          </Button>
          <Button
            onClick={handlePrint}
            style={{ backgroundColor: couleur, color: "#fff" }}
          >
            <Printer className="mr-1.5 h-4 w-4" /> Imprimer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: "1px solid #f3f4f6",
        fontSize: 14,
      }}
    >
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{value}</span>
    </div>
  );
}
