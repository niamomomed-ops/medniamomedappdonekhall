// Format unifié pour le message WhatsApp envoyé au fournisseur
// (popups "Commander au fournisseur" et "Réclamer au fournisseur").
// Voir prompt 65 — format standardisé par type de commande.

import { TYPE_LABELS } from "@/lib/commande-labels";
import { formatCorrectionDisplay } from "@/lib/correction-display";

export type FournisseurMessageOptions = {
  /** Lignes ajoutées avant l'en-tête (ex: contexte casse montage). */
  prefix?: string[];
  /** Lignes ajoutées en fin de message (ex: détail réclamation). */
  suffix?: string[];
  /**
   * Force l'affichage de certains yeux (cas casse montage : on n'envoie que
   * l'œil cassé). Si omis → utilise `cmd.eyes_ordered`.
   */
  eyesOverride?: "both" | "od" | "og" | null;
  /** Masquer la ligne 🚨 URGENT même si la commande est urgente. */
  hideUrgent?: boolean;
  /** Nom du magasin à afficher tout en haut du message. */
  magasinNom?: string | null;
};

export function buildFournisseurMessage(
  cmd: any,
  options: FournisseurMessageOptions = {},
): string {
  const lines: string[] = [];

  const nom = (options.magasinNom ?? "").trim();
  if (nom) {
    lines.push(nom);
    lines.push("");
  }

  if (options.prefix && options.prefix.length > 0) {
    for (const p of options.prefix) lines.push(p);
    lines.push("");
  }

  // 🚨 URGENT (uniquement si commande.urgent)
  if (!options.hideUrgent && cmd?.urgent) {
    lines.push("🚨 URGENT");
  }

  // Entête : CMD-XXXXX - Nom client
  const numero = cmd?.numero_commande ?? "—";
  const clientNom = cmd?.clients?.nom_complet ?? "";
  lines.push(`${numero} - ${clientNom}`.trim());
  lines.push("");

  // Type
  const typeLabel = TYPE_LABELS[cmd?.type] ?? cmd?.type ?? "—";
  lines.push(`Type : ${typeLabel}`);

  const isLentilles = cmd?.type === "lentilles";
  const isProgressif = cmd?.type === "progressif";
  const isDoubleFoyer = cmd?.type === "double_foyer";
  const hasAddition = isProgressif || isDoubleFoyer;

  if (isLentilles) {
    if (cmd?.lentilles) lines.push(`Modèle : ${cmd.lentilles}`);
  } else {
    if (cmd?.type_verres) lines.push(`Verre : ${cmd.type_verres}`);
    if (isDoubleFoyer) {
      if (cmd?.traitement) lines.push(`Traitement : ${cmd.traitement}`);
    }
  }

  // Correction
  const eyes = (options.eyesOverride ?? cmd?.eyes_ordered ?? "both") as
    | "both"
    | "od"
    | "og";
  const showOD = eyes === "both" || eyes === "od";
  const showOG = eyes === "both" || eyes === "og";

  lines.push("");
  lines.push("Correction :");
  if (showOD) {
    lines.push(
      `OD : ${formatCorrectionDisplay(cmd?.od_sphere, cmd?.od_cylinder, cmd?.od_axe, cmd?.od_addition, hasAddition)}`,
    );
  }
  if (showOG) {
    lines.push(
      `OG : ${formatCorrectionDisplay(cmd?.og_sphere, cmd?.og_cylinder, cmd?.og_axe, cmd?.og_addition, hasAddition)}`,
    );
  }

  // Mesures progressif
  if (isProgressif && cmd?.progressive) {
    const m = cmd.progressive;
    const has = (v: any) => v !== null && v !== undefined && v !== "";
    const measureLines: string[] = [];
    if (has(m.ecart_pupillaire_od) || has(m.ecart_pupillaire_og)) {
      measureLines.push(
        `EP OD : ${has(m.ecart_pupillaire_od) ? `${m.ecart_pupillaire_od} mm` : "—"}   EP OG : ${has(m.ecart_pupillaire_og) ? `${m.ecart_pupillaire_og} mm` : "—"}`,
      );
    }
    if (has(m.hauteur_pupillaire_od) || has(m.hauteur_pupillaire_og)) {
      measureLines.push(
        `HP OD : ${has(m.hauteur_pupillaire_od) ? `${m.hauteur_pupillaire_od} mm` : "—"}   HP OG : ${has(m.hauteur_pupillaire_og) ? `${m.hauteur_pupillaire_og} mm` : "—"}`,
      );
    }
    if (has(m.grand_diametre)) measureLines.push(`Grand diamètre : ${m.grand_diametre} mm`);
    if (has(m.hauteur_calibre)) measureLines.push(`Hauteur calibre : ${m.hauteur_calibre} mm`);
    if (has(m.pont)) measureLines.push(`Pont : ${m.pont} mm`);
    if (measureLines.length > 0) {
      lines.push("");
      lines.push("Mesures :");
      for (const l of measureLines) lines.push(l);
    }
  }

  // Note
  if (cmd?.notes && String(cmd.notes).trim()) {
    lines.push("");
    lines.push(`Note: ${String(cmd.notes).trim()}`);
  }

  // Suffix (ex: détail réclamation)
  if (options.suffix && options.suffix.length > 0) {
    lines.push("");
    for (const s of options.suffix) lines.push(s);
  }

  return lines.join("\n");
}