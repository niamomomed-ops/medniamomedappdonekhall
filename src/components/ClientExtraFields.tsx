import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const MUTUELLE_OPTIONS = [
  "AMO",
  "CNSS",
  "FAR",
  "CNOPS",
  "SANLAM",
  "Autre",
] as const;

export type MutuelleOption = (typeof MUTUELLE_OPTIONS)[number];

export type ClientExtraValues = {
  cin: string;
  mutuelle: MutuelleOption | "";
  mutuelle_autre: string;
  whatsapp_same: boolean;
  whatsapp: string;
};

export function emptyExtras(): ClientExtraValues {
  return {
    cin: "",
    mutuelle: "",
    mutuelle_autre: "",
    whatsapp_same: true,
    whatsapp: "",
  };
}

export function extrasFromClient(c: {
  cin?: string | null;
  mutuelle?: string | null;
  mutuelle_autre?: string | null;
  whatsapp?: string | null;
  telephone?: string | null;
}): ClientExtraValues {
  const mut = (c.mutuelle ?? "") as MutuelleOption | "";
  const hasWa = !!c.whatsapp && c.whatsapp !== (c.telephone ?? "");
  return {
    cin: c.cin ?? "",
    mutuelle: MUTUELLE_OPTIONS.includes(mut as MutuelleOption) ? mut : "",
    mutuelle_autre: c.mutuelle_autre ?? "",
    whatsapp_same: !hasWa,
    whatsapp: hasWa ? (c.whatsapp ?? "") : "",
  };
}

/**
 * Serialise extras for the server, given the current telephone value.
 * - whatsapp = telephone when "same" is checked.
 * - mutuelle_autre only sent when mutuelle === "Autre".
 */
export function extrasToPayload(extras: ClientExtraValues, telephone: string) {
  const mutuelle = extras.mutuelle === "" ? null : extras.mutuelle;
  return {
    cin: extras.cin.trim() || null,
    mutuelle,
    mutuelle_autre:
      mutuelle === "Autre" ? extras.mutuelle_autre.trim() || null : null,
    whatsapp: extras.whatsapp_same
      ? telephone.trim() || null
      : extras.whatsapp.trim() || null,
  };
}

export function ClientExtraFields({
  value,
  onChange,
  idPrefix = "cf",
}: {
  value: ClientExtraValues;
  onChange: (v: ClientExtraValues) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof ClientExtraValues>(
    k: K,
    v: ClientExtraValues[K],
  ) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-cin`}>CIN</Label>
        <Input
          id={`${idPrefix}-cin`}
          value={value.cin}
          onChange={(e) => set("cin", e.target.value)}
          maxLength={50}
          placeholder="Carte d'identité nationale"
        />
      </div>

      <div className="space-y-2">
        <Label>Mutuelle</Label>
        <div className="flex flex-wrap gap-2">
          {MUTUELLE_OPTIONS.map((opt) => {
            const active = value.mutuelle === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => set("mutuelle", active ? "" : opt)}
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
        {value.mutuelle === "Autre" && (
          <Input
            className="mt-2"
            value={value.mutuelle_autre}
            onChange={(e) => set("mutuelle_autre", e.target.value)}
            placeholder="Préciser la mutuelle"
            maxLength={150}
          />
        )}
      </div>
    </div>
  );
}

/**
 * WhatsApp toggle + optional WhatsApp number input.
 * Rendered separately so it can sit right under the telephone field.
 */
export function WhatsappToggleField({
  value,
  onChange,
  idPrefix = "cf",
}: {
  value: ClientExtraValues;
  onChange: (v: ClientExtraValues) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof ClientExtraValues>(
    k: K,
    v: ClientExtraValues[K],
  ) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={value.whatsapp_same}
          onCheckedChange={(c) => set("whatsapp_same", c === true)}
        />
          Le numéro de téléphone est aussi WhatsApp
      </label>
      {!value.whatsapp_same && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-wa`}>Numéro WhatsApp</Label>
          <Input
            id={`${idPrefix}-wa`}
            value={value.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            maxLength={50}
            placeholder="Numéro WhatsApp"
          />
        </div>
      )}
    </div>
  );
}