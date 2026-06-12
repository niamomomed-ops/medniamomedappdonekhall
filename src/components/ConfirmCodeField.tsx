import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export function computeConfirmCode(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0000";
  return String(Math.round(Math.abs(n))).padStart(4, "0").slice(-4);
}

/** Generate a stable random 4-digit code (for non-monetary actions). */
export function randomConfirmCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

type Props = {
  /** Numeric amount used to derive the code. Ignored if `code` is provided. */
  amount?: number | null;
  /** Explicit 4-digit code to require (used for non-monetary actions). */
  code?: string;
  onValidChange: (valid: boolean) => void;
  label?: string;
};

export function ConfirmCodeField({
  amount,
  code: codeProp,
  onValidChange,
  label = "Pour confirmer, veuillez ressaisir le code affiché ci-dessous.",
}: Props) {
  const code = useMemo(() => {
    if (codeProp && /^\d{4}$/.test(codeProp)) return codeProp;
    return computeConfirmCode(amount ?? 0);
  }, [codeProp, amount]);

  const [value, setValue] = useState("");

  useEffect(() => {
    setValue("");
  }, [code]);

  const valid = value === code;
  useEffect(() => {
    onValidChange(valid);
  }, [valid, onValidChange]);

  const showError = value.length === 4 && !valid;
  const block = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <div className="rounded-lg border-2 border-dashed border-primary/40 bg-accent/30 p-4 space-y-3">
      <p className="text-sm text-foreground">{label}</p>
      <div
        className="select-none text-center font-mono text-4xl font-bold tracking-[0.5em] text-foreground py-2"
        aria-label="Code à recopier"
        onCopy={block}
      >
        {code}
      </div>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={4}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onPaste={block}
        onCopy={block}
        onCut={block}
        onDrop={block}
        placeholder="••••"
        className="text-center font-mono text-xl tracking-[0.5em]"
      />
      {showError && (
        <p className="text-xs text-destructive">
          Code incorrect — veuillez réessayer.
        </p>
      )}
    </div>
  );
}
