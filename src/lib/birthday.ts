export function isBirthdayToday(dateNaissance: string | null | undefined): boolean {
  if (!dateNaissance) return false;
  const d = new Date(dateNaissance);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
}

export function getPrenom(nomComplet: string): string {
  return (nomComplet || "").trim().split(/\s+/)[0] ?? "";
}

export function buildBirthdayMessage(nomComplet: string): string {
  const prenom = getPrenom(nomComplet);
  return `🎂 Joyeux anniversaire ${prenom} !
نتمنى لك عيد ميلاد سعيد وسنة مليئة بالصحة والسعادة 🎉
— Maison d'Optométrie KHALLOUKI`;
}

export function buildWhatsappBirthdayUrl(
  telephone: string | null | undefined,
  whatsapp: string | null | undefined,
  nomComplet: string,
): string | null {
  const raw = (whatsapp && whatsapp.trim()) || (telephone && telephone.trim()) || "";
  const phone = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildBirthdayMessage(nomComplet))}`;
}
