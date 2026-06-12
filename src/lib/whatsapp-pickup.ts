// Helpers to build pickup contact links (tel: + wa.me) for a ready commande.

export type PickupOrderType = string | null | undefined;

/**
 * Which bilingual WhatsApp message to send.
 * - "pickup": commande prête (statut "en_reception").
 * - "frame_request": demander au client d'apporter sa monture
 *   (statut "verre_recu" + monture client non fournie).
 */
export type WhatsappMessageKind = "pickup" | "frame_request";

function firstName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] ?? "";
}

function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  // wa.me expects digits only (with country code, no +).
  return raw.replace(/[^\d]/g, "");
}

/** Returns the WhatsApp-preferred number (distinct whatsapp, else telephone). */
export function pickupWhatsappNumber(
  telephone: string | null | undefined,
  whatsapp: string | null | undefined,
): string {
  const wa = (whatsapp ?? "").trim();
  if (wa) return wa;
  return (telephone ?? "").trim();
}

export function pickupTelHref(telephone: string | null | undefined): string | null {
  const t = (telephone ?? "").trim();
  if (!t) return null;
  return `tel:${t.replace(/\s+/g, "")}`;
}

/**
 * Build the bilingual (FR + AR) pickup message.
 * Picks the noun based on the commande type ("lentilles" vs anything else → lunettes).
 */
export function pickupMessage(
  fullName: string | null | undefined,
  type: PickupOrderType,
  kind: WhatsappMessageKind = "pickup",
): string {
  const fullSafe = (fullName ?? "").trim() || "Client";
  const firstSafe = firstName(fullName) || "Client";
  const isLentilles = (type ?? "").toLowerCase() === "lentilles";

  if (kind === "frame_request") {
    const fr = `Bonjour ${fullSafe}, votre verre est arrivé. Merci de passer déposer votre monture pour que nous puissions commencer le montage.`;
    const ar = `مرحباً ${firstSafe}، وصل زجاجك. نرجو منك المرور لإحضار إطارك حتى نتمكن من البدء في التركيب. شكراً.`;
    return `${fr}\n${ar}`;
  }

  const fr = isLentilles
    ? `Bonjour ${fullSafe}, vos lentilles sont prêtes. Vous pouvez passer les récupérer. Merci.`
    : `Bonjour ${fullSafe}, vos lunettes sont prêtes. Vous pouvez passer les récupérer. Merci.`;
  const ar = isLentilles
    ? `مرحباً ${firstSafe}، عدساتك أصبحت جاهزة. يمكنك المرور لاستلامها. شكراً.`
    : `مرحباً ${firstSafe}، نظارتك أصبحت جاهزة. يمكنك المرور لاستلامها. شكراً.`;

  return `${fr}\n${ar}`;
}

export function pickupWhatsappHref(
  telephone: string | null | undefined,
  whatsapp: string | null | undefined,
  fullName: string | null | undefined,
  type: PickupOrderType,
): string | null {
  const target = normalisePhone(pickupWhatsappNumber(telephone, whatsapp));
  if (!target) return null;
  const msg = encodeURIComponent(pickupMessage(fullName, type));
  return `https://wa.me/${target}?text=${msg}`;
}
