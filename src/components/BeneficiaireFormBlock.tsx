import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MUTUELLE_OPTIONS } from "@/components/ClientExtraFields";

export type BeneficiaireValues = {
  on: boolean;
  nom: string;
  date: string;
  organisme: string;
  organismeAutre: string;
};

export const emptyBeneficiaire = (): BeneficiaireValues => ({
  on: false,
  nom: "",
  date: "",
  organisme: "",
  organismeAutre: "",
});

export function resolveBeneficiaireOrganisme(v: BeneficiaireValues): string {
  return v.organisme === "Autre" ? v.organismeAutre.trim() : v.organisme;
}

export function isBeneficiaireValid(v: BeneficiaireValues): boolean {
  if (!v.on) return true;
  return (
    v.nom.trim().length > 0 &&
    v.date.trim().length > 0 &&
    v.organisme.trim().length > 0 &&
    (v.organisme !== "Autre" || v.organismeAutre.trim().length > 0)
  );
}

export function BeneficiaireFormBlock({
  values,
  onChange,
  title = "Changer le bénéficiaire",
  description = "Activez si le bénéficiaire est différent du client.",
}: {
  values: BeneficiaireValues;
  onChange: (v: BeneficiaireValues) => void;
  title?: string;
  description?: string;
}) {
  const update = (patch: Partial<BeneficiaireValues>) =>
    onChange({ ...values, ...patch });

  return (
    <div>
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch
          checked={values.on}
          onCheckedChange={(v) => {
            if (!v) {
              onChange({
                on: false,
                nom: "",
                date: "",
                organisme: "",
                organismeAutre: "",
              });
            } else {
              update({ on: true });
            }
          }}
        />
      </label>
      {values.on && (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="benef-nom">Nom complet *</Label>
            <Input
              id="benef-nom"
              value={values.nom}
              onChange={(e) => update({ nom: e.target.value })}
              maxLength={150}
              placeholder="Nom complet du bénéficiaire"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="benef-date">Date de naissance *</Label>
            <Input
              id="benef-date"
              type="date"
              value={values.date}
              onChange={(e) => update({ date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Organisme *</Label>
            <div className="flex flex-wrap gap-2">
              {MUTUELLE_OPTIONS.map((opt) => {
                const active = values.organisme === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      update({ organisme: active ? "" : opt })
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {values.organisme === "Autre" && (
              <Input
                className="mt-2"
                value={values.organismeAutre}
                onChange={(e) => update({ organismeAutre: e.target.value })}
                placeholder="Préciser la mutuelle"
                maxLength={150}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
