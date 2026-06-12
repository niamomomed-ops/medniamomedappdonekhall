import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_HORAIRES,
  useEntreprise,
  type Entreprise,
  type EntrepriseHoraires,
} from "@/hooks/useEntreprise";
import { useLogoUrl } from "@/hooks/useLogoUrl";

const DAYS: { key: keyof EntrepriseHoraires; label: string }[] = [
  { key: "lundi", label: "Lundi" },
  { key: "mardi", label: "Mardi" },
  { key: "mercredi", label: "Mercredi" },
  { key: "jeudi", label: "Jeudi" },
  { key: "vendredi", label: "Vendredi" },
  { key: "samedi", label: "Samedi" },
  { key: "dimanche", label: "Dimanche" },
];

type FormState = {
  nom: string;
  slogan: string;
  couleur_principale: string;
  telephone: string;
  whatsapp: string;
  email: string;
  site_web: string;
  adresse: string;
  ville: string;
  code_postal: string;
  logo_url: string;
  horaires: EntrepriseHoraires;
};

function toForm(e: Entreprise | null): FormState {
  return {
    nom: e?.nom ?? "",
    slogan: e?.slogan ?? "",
    couleur_principale: e?.couleur_principale ?? "#2563EB",
    telephone: e?.telephone ?? "",
    whatsapp: e?.whatsapp ?? "",
    email: e?.email ?? "",
    site_web: e?.site_web ?? "",
    adresse: e?.adresse ?? "",
    ville: e?.ville ?? "",
    code_postal: e?.code_postal ?? "",
    logo_url: e?.logo_url ?? "",
    horaires: (e?.horaires as EntrepriseHoraires) ?? DEFAULT_HORAIRES,
  };
}

export function EntrepriseProfileCard() {
  const { entreprise, isLoading } = useEntreprise();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => toForm(null));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { data: logoPreviewUrl } = useLogoUrl(form.logo_url);

  useEffect(() => {
    if (entreprise) setForm(toForm(entreprise));
  }, [entreprise]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setHoraire = (
    day: keyof EntrepriseHoraires,
    patch: Partial<{ ouvert: boolean; debut: string | null; fin: string | null }>,
  ) =>
    setForm((f) => ({
      ...f,
      horaires: { ...f.horaires, [day]: { ...f.horaires[day], ...patch } },
    }));

  const handleLogo = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo trop volumineux (max 2 Mo)");
      return;
    }
    const ext = file.name.split(".").pop() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    setUploading(true);
    try {
      const { error: upErr } = await supabase.storage
        .from("entreprise-assets")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      update("logo_url", path);

      // Persist immediately to DB so the logo survives refresh
      const payload: Record<string, unknown> = {
        logo_url: path,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (entreprise?.id) {
        payload.id = entreprise.id;
      } else {
        payload.nom = form.nom.trim() || "Entreprise";
      }
      const { error: dbErr } = await (supabase as any)
        .from("entreprise")
        .upsert(payload, { onConflict: "id" });
      if (dbErr) throw dbErr;

      qc.invalidateQueries({ queryKey: ["entreprise"] });
      toast.success("Logo téléversé et enregistré");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec du téléversement");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.nom.trim()) {
      toast.error("Le nom de l'entreprise est requis");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        nom: form.nom.trim(),
        slogan: form.slogan.trim() || null,
        telephone: form.telephone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        site_web: form.site_web.trim() || null,
        adresse: form.adresse.trim() || null,
        ville: form.ville.trim() || null,
        code_postal: form.code_postal.trim() || null,
        logo_url: form.logo_url.trim() || null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (entreprise?.id) payload.id = entreprise.id;
      const { error } = await (supabase as any)
        .from("entreprise")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
      toast.success("✅ Profil entreprise mis à jour");
      qc.invalidateQueries({ queryKey: ["entreprise"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Profil de l'entreprise
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <>
            {/* Bloc 1 — Identité */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Identité</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ent-nom">Nom de l'entreprise *</Label>
                  <Input
                    id="ent-nom"
                    value={form.nom}
                    onChange={(e) => update("nom", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ent-slogan">Slogan / sous-titre</Label>
                  <Input
                    id="ent-slogan"
                    value={form.slogan}
                    onChange={(e) => update("slogan", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ent-couleur">Couleur principale</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="ent-couleur"
                      type="color"
                      value={form.couleur_principale}
                      onChange={(e) => update("couleur_principale", e.target.value)}
                      className="h-10 w-16 cursor-pointer p-1"
                    />
                    <Input
                      value={form.couleur_principale}
                      onChange={(e) => update("couleur_principale", e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Bloc 2 — Logo */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Logo</h3>
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                  {form.logo_url && logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="Logo entreprise"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogo(f);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="mr-2 h-4 w-4" />
                      )}
                      Choisir un fichier
                    </Button>
                    {form.logo_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => update("logo_url", "")}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Retirer
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, SVG — Max 2 Mo
                  </p>
                </div>
              </div>
            </section>

            {/* Bloc 3 — Contact */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Contact</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Téléphone" value={form.telephone} onChange={(v) => update("telephone", v)} />
                <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => update("whatsapp", v)} />
                <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} />
                <Field label="Site web" value={form.site_web} onChange={(v) => update("site_web", v)} />
              </div>
            </section>

            {/* Bloc 4 — Adresse */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Adresse</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Adresse" value={form.adresse} onChange={(v) => update("adresse", v)} />
                <Field label="Ville" value={form.ville} onChange={(v) => update("ville", v)} />
                <Field label="Code postal" value={form.code_postal} onChange={(v) => update("code_postal", v)} />
              </div>
            </section>

            {/* Bloc 5 — Horaires */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Horaires d'ouverture</h3>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Jour</th>
                      <th className="px-3 py-2 text-left">Ouvert</th>
                      <th className="px-3 py-2 text-left">Ouverture</th>
                      <th className="px-3 py-2 text-left">Fermeture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(({ key, label }) => {
                      const h = form.horaires[key];
                      return (
                        <tr key={key} className="border-t">
                          <td className="px-3 py-2 font-medium">{label}</td>
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={h.ouvert}
                              onCheckedChange={(c) =>
                                setHoraire(key, {
                                  ouvert: Boolean(c),
                                  debut: c ? h.debut ?? "09:00" : null,
                                  fin: c ? h.fin ?? "18:00" : null,
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="time"
                              value={h.debut ?? ""}
                              disabled={!h.ouvert}
                              onChange={(e) => setHoraire(key, { debut: e.target.value })}
                              className="h-8 w-32"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="time"
                              value={h.fin ?? ""}
                              disabled={!h.ouvert}
                              onChange={(e) => setHoraire(key, { fin: e.target.value })}
                              className="h-8 w-32"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer les modifications
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
