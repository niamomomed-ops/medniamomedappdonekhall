import { useRef, useState } from "react";
import { Paperclip, X, ImageIcon } from "lucide-react";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/jpg"];

export function validateJustifs(files: File[]): string | null {
  for (const f of files) {
    if (!ALLOWED.includes(f.type)) {
      return "Photos uniquement : JPG ou PNG";
    }
    if (f.size > MAX_SIZE) {
      return `${f.name} dépasse 5 MB`;
    }
  }
  return null;
}

export function MutuelleJustifsUploader({
  value,
  onChange,
}: {
  value: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (incoming: File[]) => {
    const merged = [...value, ...incoming];
    const err = validateJustifs(merged);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onChange(merged);
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
    setError(null);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        }`}
      >
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Glissez les photos ici ou{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            cliquez pour choisir
          </button>
        </p>
        <p className="text-[10px] text-muted-foreground">JPG / PNG · max 5 MB par fichier</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Retirer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export async function filesToBase64Payload(files: File[]) {
  return Promise.all(
    files.map(
      (f) =>
        new Promise<{ name: string; type: string; size: number; base64: string }>(
          (resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.split(",")[1] ?? "";
              resolve({ name: f.name, type: f.type, size: f.size, base64 });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          },
        ),
    ),
  );
}
