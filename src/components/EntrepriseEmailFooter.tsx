import { useEntreprise, type Entreprise, type EntrepriseHoraires } from "@/hooks/useEntreprise";

const DAY_LABELS: Record<keyof EntrepriseHoraires, string> = {
  lundi: "Lundi",
  mardi: "Mardi",
  mercredi: "Mercredi",
  jeudi: "Jeudi",
  vendredi: "Vendredi",
  samedi: "Samedi",
  dimanche: "Dimanche",
};

type Props = {
  entreprise?: Entreprise | null;
};

/**
 * HTML footer block for transactional emails.
 * Use either by passing `entreprise` directly (server context) or letting
 * the hook fetch it (client context).
 */
export function EntrepriseEmailFooter({ entreprise: passed }: Props) {
  const { entreprise: fetched } = useEntreprise();
  const e = passed ?? fetched;
  if (!e || !e.nom) return null;

  const addressLine = [e.adresse, [e.code_postal, e.ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const horaires = e.horaires
    ? (Object.entries(e.horaires) as [keyof EntrepriseHoraires, EntrepriseHoraires[keyof EntrepriseHoraires]][])
        .map(([k, h]) =>
          h.ouvert && h.debut && h.fin
            ? `${DAY_LABELS[k]} : ${h.debut} – ${h.fin}`
            : `${DAY_LABELS[k]} : Fermé`,
        )
    : [];

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      width="100%"
      style={{
        borderTop: `2px solid ${e.couleur_principale ?? "#2563EB"}`,
        marginTop: 24,
        paddingTop: 16,
        fontFamily: "Arial, sans-serif",
        fontSize: 13,
        color: "#374151",
      }}
    >
      <tbody>
        <tr>
          {e.logo_url && (
            <td style={{ width: 80, verticalAlign: "top", paddingRight: 16 }}>
              <img
                src={e.logo_url}
                alt={e.nom}
                style={{ maxHeight: 60, maxWidth: 80 }}
              />
            </td>
          )}
          <td style={{ verticalAlign: "top" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{e.nom}</div>
            {addressLine && <div>📍 {addressLine}</div>}
            {e.telephone && <div>📞 {e.telephone}</div>}
            {e.site_web && (
              <div>
                🌐{" "}
                <a href={e.site_web} style={{ color: e.couleur_principale ?? "#2563EB" }}>
                  {e.site_web}
                </a>
              </div>
            )}
            {horaires.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                {horaires.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
