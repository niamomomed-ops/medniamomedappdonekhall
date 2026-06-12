import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, ArrowLeftRight } from "lucide-react";

function transposeEye<T extends { sphere: number | null; cylinder: number | null; axe: number | null; addition: number | null }>(e: T): T {
  if (e.sphere == null && e.cylinder == null && e.axe == null) return e;
  const s = Number(e.sphere ?? 0);
  const c = Number(e.cylinder ?? 0);
  const a = e.axe == null ? null : Number(e.axe);
  return {
    ...e,
    sphere: s + c,
    cylinder: -c,
    axe: a == null ? null : a <= 90 ? a + 90 : a - 90,
  };
}

type Eye = {
  sphere: number | null;
  cylinder: number | null;
  axe: number | null;
  addition: number | null;
};

type Progressive = {
  ecart_pupillaire_od: number | null;
  ecart_pupillaire_og: number | null;
  hauteur_pupillaire_od: number | null;
  hauteur_pupillaire_og: number | null;
  grand_diametre: number | null;
  hauteur_calibre: number | null;
  pont: number | null;
} | null;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  numeroCommande: string | null;
  clientName: string | null;
  dateNaissance: string | null;
  telephone: string | null;
  /** Type de prescription : "externe" => MDC OUI, "interne" => MDC NON */
  prescriptionType: string | null;
  type: string | null;
  lentilleType?: "origine" | "spherique" | null;

  od: Eye;
  og: Eye;
  eyesOrdered?: "both" | "od" | "og" | string | null;
  typeVerres: string | null;
  modeleLentilles: string | null;
  notes: string | null;
  montureSource: string | null;
  montureMarque: string | null;
  montureClientProvided: boolean | null;
  progressive: Progressive;
  total: number;
  avance: number;
  reste: number;
  verreCommandeLe: string | null;
  dateLivraison: string | null;
  deleted?: boolean;
};

const fmtSigned = (n: number | null) =>
  n == null ? "" : n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
const fmtSphere = (n: number | null) =>
  n == null ? "" : Number(n) === 0 ? "Plan" : fmtSigned(n);
const fmtAxe = (n: number | null) => (n == null ? "" : String(n));
const fmtNum = (n: number | null) => (n == null ? "" : String(n));
const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
const fmtMoney = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

function fmtPair(a: number | null, b: number | null): string {
  const parts: string[] = [];
  if (a != null) parts.push(`OD ${a}`);
  if (b != null) parts.push(`OG ${b}`);
  return parts.join(" / ");
}

function computeAge(d: string | null): number | null {
  if (!d) return null;
  const birth = new Date(d);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

const cellBorder: React.CSSProperties = {
  border: "1px solid #000",
  padding: "2px 4px",
};

export function WorkSheetDialog({
  open,
  onOpenChange,
  numeroCommande,
  clientName,
  dateNaissance,
  telephone,
  prescriptionType,
  type,
  lentilleType,
  od: odProp,
  og: ogProp,
  eyesOrdered,
  typeVerres,
  modeleLentilles,
  notes,
  montureSource,
  montureMarque,
  montureClientProvided,
  progressive,
  total,
  avance,
  reste,
  verreCommandeLe,
  dateLivraison,
  deleted = false,
}: Props) {
  const [converted, setConverted] = useState(false);
  const showOD = !eyesOrdered || eyesOrdered === "both" || eyesOrdered === "od";
  const showOG = !eyesOrdered || eyesOrdered === "both" || eyesOrdered === "og";
  const od = converted ? transposeEye(odProp) : odProp;
  const og = converted ? transposeEye(ogProp) : ogProp;
  const cylNeg =
    (showOD && odProp.cylinder != null && Number(odProp.cylinder) < 0) ||
    (showOG && ogProp.cylinder != null && Number(ogProp.cylinder) < 0);
  const toggleLabel = converted
    ? cylNeg
      ? "⇄ Revenir au cylindre négatif"
      : "⇄ Revenir au cylindre positif"
    : cylNeg
      ? "⇄ Passer au cylindre positif"
      : "⇄ Passer au cylindre négatif";
  const isLentilles = type === "lentilles";
  const isPRG =
    !isLentilles &&
    (type === "progressif" || /progressif/i.test(typeVerres ?? ""));
  const isDF =
    !isLentilles &&
    !isPRG &&
    (type === "double_foyer" || /double\s*foyer/i.test(typeVerres ?? ""));
  const isVL = !isLentilles && !isPRG && !isDF && type === "vision_loin";
  const isVP =
    !isLentilles &&
    !isPRG &&
    !isDF &&
    !isVL &&
    (type === "vision_pres" ||
      (od.addition != null && Number(od.addition) > 0) ||
      (og.addition != null && Number(og.addition) > 0));
  const visionLabel = isLentilles
    ? "Lentilles"
    : isPRG
      ? "PRG"
      : isDF
        ? "DF"
        : isVP
          ? "VP"
          : "VL";

  const age = computeAge(dateNaissance);
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // MDC = Médecin (prescription externe)
  const mdc =
    prescriptionType === "externe"
      ? "OUI"
      : prescriptionType === "interne"
        ? "NON"
        : "";

  const handlePrint = () => {
    const content = document.getElementById("work-sheet");
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=300,height=600");
    if (!printWindow) return;

    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-print, [data-no-print="true"]').forEach((el) => el.remove());

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Fiche monture</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.4;
              color: #000;
              background: #fff;
              width: 72mm;
              position: relative;
            }
            table { width: 100%; border-collapse: collapse; }
            td { font-size: 11px; }
            .no-print, [data-no-print="true"] { display: none !important; }
            .deleted-watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-30deg);
              font-size: 28px;
              font-weight: bold;
              color: rgba(220, 38, 38, 0.30);
              border: 4px solid rgba(220, 38, 38, 0.30);
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
  };

  const montureLabel =
    montureSource === "donnee"
      ? "Donnée par client"
      : montureSource === "boutique"
        ? `Boutique${montureMarque ? ` — ${montureMarque}` : ""}${
            montureClientProvided != null
              ? ` (${montureClientProvided ? "Fournie" : "Non fournie"})`
              : ""
          }`
        : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fiche monture</DialogTitle>
        </DialogHeader>

        <div
          id="work-sheet"
          style={{
            width: "72mm",
            fontFamily: "'Courier New', monospace",
            fontSize: 11,
            padding: "4mm",
            color: "#000",
            background: "#fff",
            margin: "0 auto",
            position: "relative",
          }}
        >
          {deleted && (
            <div
              data-no-print="true"
              className="no-print"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 50,
              }}
              aria-hidden
            >
              <span
                style={{
                  transform: "rotate(-30deg)",
                  border: "4px solid rgba(220,38,38,0.30)",
                  color: "rgba(220,38,38,0.30)",
                  padding: "6px 16px",
                  fontWeight: "bold",
                  fontSize: 24,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  whiteSpace: "nowrap",
                }}
              >
                Commande supprimée
              </span>
            </div>
          )}
          {/* HEADER */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: "nowrap", fontWeight: "bold" }}>COMMANDE #</td>
                <td style={{ paddingLeft: 6 }}>{numeroCommande ?? ""}</td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>{visionLabel}</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: "nowrap" }}>Date</td>
                <td style={{ paddingLeft: 6 }} colSpan={2}>{today}</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: "nowrap" }}>Nom</td>
                <td style={{ paddingLeft: 6 }} colSpan={2}>{clientName ?? ""}</td>
              </tr>
            </tbody>
          </table>

          <hr style={{ border: "1px solid #000", margin: "4px 0" }} />

          {/* CORRECTION */}
          <div style={{ textAlign: "center", fontWeight: "bold", margin: "4px 0" }}>
            Correction
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #000",
              marginBottom: 6,
            }}
          >
            <tbody>
              <tr style={{ background: "#eee" }}>
                <td style={cellBorder}></td>
                <td style={{ ...cellBorder, textAlign: "center", fontWeight: "bold" }}>SPH</td>
                <td style={{ ...cellBorder, textAlign: "center", fontWeight: "bold" }}>CYL</td>
                <td style={{ ...cellBorder, textAlign: "center", fontWeight: "bold" }}>AXE</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold" }}>OD</td>
                <td style={{ ...cellBorder, textAlign: "center" }}>{showOD ? fmtSphere(od.sphere) : ""}</td>
                <td style={{ ...cellBorder, textAlign: "center" }}>{showOD ? fmtSigned(od.cylinder) : ""}</td>
                <td style={{ ...cellBorder, textAlign: "center" }}>{showOD ? fmtAxe(od.axe) : ""}</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold" }}>OG</td>
                <td style={{ ...cellBorder, textAlign: "center" }}>{showOG ? fmtSphere(og.sphere) : ""}</td>
                <td style={{ ...cellBorder, textAlign: "center" }}>{showOG ? fmtSigned(og.cylinder) : ""}</td>
                <td style={{ ...cellBorder, textAlign: "center" }}>{showOG ? fmtAxe(og.axe) : ""}</td>
              </tr>
              {(isPRG || isDF) && (
                <tr style={{ background: "#f5f5f5" }}>
                  <td style={{ ...cellBorder, fontWeight: "bold" }}>ADD</td>
                  <td style={{ ...cellBorder, textAlign: "center" }}>
                    {showOD ? `OD ${fmtSigned(od.addition)}` : ""}
                  </td>
                  <td style={{ ...cellBorder, textAlign: "center" }}>
                    {showOG ? `OG ${fmtSigned(og.addition)}` : ""}
                  </td>
                  <td style={cellBorder}></td>
                </tr>
              )}
            </tbody>
          </table>

          {/* DOUBLE FOYER (DF uniquement) — titre seul, pas de champs montage */}
          {isDF && (
            <div
              style={{
                textAlign: "center",
                fontWeight: "bold",
                margin: "4px 0",
                background: "#ddd",
                padding: "2px",
                fontSize: 12,
              }}
            >
              DOUBLE FOYER
            </div>
          )}

          {/* PROGRESSIF (PRG uniquement) */}
          {isPRG && (
            <>
              <div
                style={{
                  textAlign: "center",
                  fontWeight: "bold",
                  margin: "4px 0",
                  background: "#ddd",
                  padding: "2px",
                }}
              >
                PROGRESSIF
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  border: "1px solid #000",
                  marginBottom: 6,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ ...cellBorder, fontWeight: "bold", width: "30%" }}>EP</td>
                    <td style={cellBorder} colSpan={2}>
                      {fmtPair(
                        showOD ? progressive?.ecart_pupillaire_od ?? null : null,
                        showOG ? progressive?.ecart_pupillaire_og ?? null : null,
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...cellBorder, fontWeight: "bold" }}>HP</td>
                    <td style={cellBorder} colSpan={2}>
                      {fmtPair(
                        showOD ? progressive?.hauteur_pupillaire_od ?? null : null,
                        showOG ? progressive?.hauteur_pupillaire_og ?? null : null,
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...cellBorder, fontWeight: "bold", textAlign: "center" }}>GD</td>
                    <td style={{ ...cellBorder, fontWeight: "bold", textAlign: "center" }}>HC</td>
                    <td style={{ ...cellBorder, fontWeight: "bold", textAlign: "center" }}>P</td>
                  </tr>
                  <tr>
                    <td style={{ ...cellBorder, textAlign: "center" }}>{fmtNum(progressive?.grand_diametre ?? null)}</td>
                    <td style={{ ...cellBorder, textAlign: "center" }}>{fmtNum(progressive?.hauteur_calibre ?? null)}</td>
                    <td style={{ ...cellBorder, textAlign: "center" }}>{fmtNum(progressive?.pont ?? null)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* LENTILLES (titre) */}
          {isLentilles && (
            <div
              style={{
                textAlign: "center",
                fontWeight: "bold",
                margin: "4px 0",
                background: "#ddd",
                padding: "2px",
                fontSize: 12,
              }}
            >
              LENTILLES
            </div>
          )}

          {/* TYPE DE VERRE / MODELE */}
          <div style={{ fontWeight: "bold", marginBottom: 2 }}>
            {isLentilles ? "Modèle :" : "Type de verre"}
          </div>
          <div
            style={{
              border: "1px solid #000",
              padding: "3px 6px",
              marginBottom: 6,
              minHeight: 18,
            }}
          >
            {isLentilles ? modeleLentilles ?? "" : typeVerres ?? ""}
          </div>

          {/* NOTES */}
          {notes && notes.trim() && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: "bold", marginBottom: 2 }}>Notes</div>
              <div style={{ border: "1px solid #000", padding: "3px 6px", minHeight: 18 }}>
                {notes.trim()}
              </div>
            </div>
          )}

          {/* INFOS CLIENT */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #000",
              marginBottom: 6,
            }}
          >
            <tbody>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>MDC</td>
                <td style={cellBorder}>{mdc}</td>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>AGE</td>
                <td style={cellBorder}>{age ?? ""}</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold" }}>Tel</td>
                <td style={cellBorder} colSpan={3}>{telephone ?? ""}</td>
              </tr>
              {!isLentilles && (
                <tr>
                  <td style={{ ...cellBorder, fontWeight: "bold" }}>Monture</td>
                  <td style={cellBorder} colSpan={3}>{montureLabel}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* PAIEMENT */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #000",
              marginBottom: 6,
            }}
          >
            <tbody>
              <tr style={{ background: "#eee" }}>
                <td style={{ ...cellBorder, textAlign: "center", fontWeight: "bold" }}>TOTAL</td>
                <td style={{ ...cellBorder, textAlign: "center", fontWeight: "bold" }}>AVANCE</td>
                <td style={{ ...cellBorder, textAlign: "center", fontWeight: "bold" }}>RESTE</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, textAlign: "center", padding: 4 }}>{fmtMoney(total)} DH</td>
                <td style={{ ...cellBorder, textAlign: "center", padding: 4 }}>{fmtMoney(avance)} DH</td>
                <td style={{ ...cellBorder, textAlign: "center", padding: 4, fontWeight: "bold" }}>
                  {fmtMoney(reste)} DH
                </td>
              </tr>
            </tbody>
          </table>

          {/* DATES */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #000",
            }}
          >
            <tbody>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold", whiteSpace: "nowrap" }}>Commandé</td>
                <td style={cellBorder}>{fmtDate(verreCommandeLe)}</td>
              </tr>
              <tr>
                <td style={{ ...cellBorder, fontWeight: "bold" }}>Livraison</td>
                <td style={cellBorder}>{fmtDate(dateLivraison)}</td>
              </tr>
            </tbody>
          </table>

          {!isLentilles && (
            <div className="print:hidden no-print" data-no-print="true" style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConverted((v) => !v)}
                className={`h-7 text-xs ${
                  converted !== cylNeg
                    ? "bg-green-500 text-white hover:bg-green-600 border-green-500"
                    : "bg-red-500 text-white hover:bg-red-600 border-red-500"
                }`}
              >
                <ArrowLeftRight className="mr-1 h-3 w-3" />
                {toggleLabel}
              </Button>
            </div>
          )}

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
