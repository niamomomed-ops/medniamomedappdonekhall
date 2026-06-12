// Helpers pour construire le message WhatsApp de réclamation fournisseur
// (verre manquant / erroné / mixte) — cf. flux contrôle qualité.

import { buildFournisseurMessage } from "@/lib/whatsapp-fournisseur";

export type ReclamationState = "correct" | "manquant" | "errone";
export type ReclamationDetail = {
  od?: ReclamationState | null;
  og?: ReclamationState | null;
};

export function reclamationSummary(detail: ReclamationDetail | null | undefined): string {
  if (!detail) return "";
  const parts: string[] = [];
  if (detail.od === "manquant") parts.push("OD manquant");
  if (detail.od === "errone") parts.push("OD erroné");
  if (detail.og === "manquant") parts.push("OG manquant");
  if (detail.og === "errone") parts.push("OG erroné");
  return parts.join(" · ");
}

export function hasActiveReclamation(cmd: {
  reclamation_detail?: ReclamationDetail | null;
  reclamation_resolved_at?: string | null;
}): boolean {
  if (!cmd.reclamation_detail) return false;
  if (cmd.reclamation_resolved_at) return false;
  const d = cmd.reclamation_detail;
  return d.od === "manquant" || d.od === "errone" || d.og === "manquant" || d.og === "errone";
}

export function buildReclamationMessage(
  cmd: any,
  detail: ReclamationDetail,
  magasinNom?: string | null,
): string {
  const manquants: string[] = [];
  const errones: string[] = [];
  if (detail.od === "manquant") manquants.push("OD");
  if (detail.og === "manquant") manquants.push("OG");
  if (detail.od === "errone") errones.push("OD");
  if (detail.og === "errone") errones.push("OG");

  // Date de passage commande au fournisseur (statut verre_commande).
  // L'historique de getCommande est trié desc — on prend la plus récente entrée.
  const history: any[] = Array.isArray(cmd?.history) ? cmd.history : [];
  const verreEntry = history.find(
    (h: any) => h?.new_status === "verre_commande",
  );
  const commandeLeStr = verreEntry?.changed_at
    ? new Date(verreEntry.changed_at).toLocaleDateString("fr-FR")
    : null;

  const header: string[] = [];
  const nom = (magasinNom ?? "").trim();
  if (nom) {
    header.push(nom);
    header.push("");
  }
  header.push("⚠️ RÉCLAMATION");
  if (commandeLeStr) header.push(`Commandé le ${commandeLeStr}`);
  for (const e of manquants) header.push(`👉 ${e} manquant`);
  for (const e of errones) header.push(`👉 ${e} erroné – correction reçue incorrecte`);
  header.push("Merci de traiter en urgence.");

  const sep = "-------------------------------------------------------";
  const rappelLine = cmd?.urgent
    ? "RAPPEL DE LA COMMANDE: 🚨 URGENT"
    : "RAPPEL DE LA COMMANDE:";

  const base = buildFournisseurMessage(cmd, { hideUrgent: true });

  return [...header, sep, rappelLine, sep, base].join("\n");
}
