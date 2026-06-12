// Format lisible d'une correction (œil) — partagé entre la fiche commande
// (section "Correction (snapshot commande)") et les messages WhatsApp
// envoyés au fournisseur (commande + réclamation).

function fmtSigned(n: number): string {
  const txt = n.toFixed(2);
  return n > 0 ? `+${txt}` : txt;
}

export function formatCorrectionDisplay(
  sphere: number | null | undefined,
  cylinder: number | null | undefined,
  axe: number | null | undefined,
  addition: number | null | undefined,
  showAddition: boolean,
): string {
  if (sphere == null && cylinder == null) return "—";
  const s = Number(sphere ?? 0);
  const c = Number(cylinder ?? 0);
  const spherePart = s === 0 ? "Plan" : fmtSigned(s);
  let main: string;
  if (c === 0) {
    main = `${spherePart} sphérique`;
  } else {
    const axeTxt = axe != null ? `${axe}°` : "—";
    main = `${spherePart} (${fmtSigned(c)} : ${axeTxt})`;
  }
  if (showAddition && addition != null && Number(addition) !== 0) {
    main += ` Add ${fmtSigned(Number(addition))}`;
  }
  return main;
}