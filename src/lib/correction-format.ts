// Shared formatter for the "Copier correction" button.
// Produces a normalized clipboard text used in both the commande sheet
// and the client sheet.

export type CorrectionEyeData = {
  sphere: number | null;
  cylinder: number | null;
  axe: number | null;
  addition: number | null;
};

export type BuildCorrectionInput = {
  clientName: string | null;
  showOD: boolean;
  showOG: boolean;
  od: CorrectionEyeData;
  og: CorrectionEyeData;
};

const fmtSigned = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2);
};

const fmtAxe = (n: number | null | undefined): string => {
  if (n == null) return "—";
  return `${Math.round(Number(n))}°`;
};

const fmtAddition = (n: number | null | undefined): string => {
  // Toujours afficher l'addition, même si 0 ou nulle (alors 0.00).
  if (n == null) return "+0.00";
  const v = Number(n);
  if (!Number.isFinite(v)) return "+0.00";
  return (v >= 0 ? "+" : "") + v.toFixed(2);
};

const formatName = (name: string | null | undefined): string => {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Client";
  // Convention demandée : nom en MAJUSCULES, prénom en Capitalize.
  // Les données ne séparent pas nom/prénom — heuristique : on met le premier
  // mot en MAJUSCULES (nom de famille) et capitalise les suivants.
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].toUpperCase();
  const [last, ...rest] = parts;
  const capit = (w: string) =>
    w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase();
  return [last.toUpperCase(), ...rest.map(capit)].join(" ");
};

const eyeLine = (label: "OD" | "OG", e: CorrectionEyeData): string => {
  return `${label} : Sph ${fmtSigned(e.sphere)} / Cyl ${fmtSigned(
    e.cylinder,
  )} x ${fmtAxe(e.axe)} | Add ${fmtAddition(e.addition)}`;
};

export function buildCorrectionClipboard(input: BuildCorrectionInput): string {
  const lines: string[] = [formatName(input.clientName), ""];
  if (input.showOD) lines.push(eyeLine("OD", input.od));
  if (input.showOG) lines.push(eyeLine("OG", input.og));
  return lines.join("\n");
}
