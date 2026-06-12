// Civilités et helpers de composition du nom complet client.
// Le reste de l'application continue d'afficher `nom_complet` (champ existant),
// qui est désormais calculé à partir de civilite + prenom + nom.

export const CIVILITES = ["M.", "Mme", "Mlle", "Enf."] as const;
export type Civilite = (typeof CIVILITES)[number];

export function isCivilite(v: unknown): v is Civilite {
  return typeof v === "string" && (CIVILITES as readonly string[]).includes(v);
}

/** Compose un nom complet à partir des composantes (civilité optionnelle). */
export function composeNomComplet(parts: {
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
}): string {
  return [parts.civilite, parts.prenom, parts.nom]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Déduit (civilité, prénom, nom) depuis un nom_complet existant.
 * Best-effort pour pré-remplir un formulaire d'édition lorsque les colonnes
 * dédiées sont vides.
 */
export function splitNomComplet(nomComplet: string): {
  civilite: Civilite | "";
  prenom: string;
  nom: string;
} {
  const tokens = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { civilite: "", prenom: "", nom: "" };
  let civilite: Civilite | "" = "";
  if (isCivilite(tokens[0])) {
    civilite = tokens[0];
    tokens.shift();
  }
  if (tokens.length === 0) return { civilite, prenom: "", nom: "" };
  const [prenom, ...rest] = tokens;
  return { civilite, prenom, nom: rest.join(" ") };
}
