import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  Settings as SettingsIcon,
  FileJson,
  FileCode2,
  Loader2,
  CalendarClock,
  Mail,
  HardDriveUpload,
  X,
  PlayCircle,
} from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { exportSqlBackup, exportFullMigration } from "@/lib/settings.functions";
import {
  getBackupSettings,
  listBackupRuns,
  listPublicTables,
  runBackupNow,
  saveBackupSettings,
  type BackupRunRow,
  type BackupSettings,
} from "@/lib/backup.functions";
import { EntrepriseProfileCard } from "@/components/EntrepriseProfileCard";

export const Route = createFileRoute("/dashboard/parametres")({
  component: ParametresPage,
});

const TABLES = [
  "entreprise",
  "personnel",
  "clients",
  "client_felicitations",
  "client_versements",
  "fournisseurs",
  "caisses",
  "prescriptions",
  "correction_annexes",
  "commandes",
  "order_history",
  "versements",
  "transactions",
  "progressive_measurements",
  "demandes_mutuelles",
  "demande_mutuelle_history",
  "demande_mutuelle_commandes",
  "dettes",
  "notifications",
  "notification_reads",
  "backup_settings",
  "backup_runs",
  "user_roles",
] as const;

type TableName = (typeof TABLES)[number];
type AnyResetKey = TableName;

// Ordre de suppression : enfants avant parents.
// correction_annexes en premier (Storage à vider avant prescriptions).
// user_roles, entreprise et personnel exclus du reset complet.
const RESET_ORDER: TableName[] = [
  "correction_annexes",
  "demande_mutuelle_history",
  "demande_mutuelle_commandes",
  "demandes_mutuelles",
  "progressive_measurements",
  "order_history",
  "versements",
  "transactions",
  "dettes",
  "notification_reads",
  "notifications",
  "client_felicitations",
  "client_versements",
  "commandes",
  "prescriptions",
  "caisses",
  "fournisseurs",
  "clients",
];

const FULL_RESET_TABLES: TableName[] = [...RESET_ORDER];

type SelectiveItem = {
  key: AnyResetKey;
  label: string;
  deps?: AnyResetKey[];
  description?: string;
};

const SELECTIVE_TABLES: SelectiveItem[] = [
  { key: "commandes", label: "Commandes", deps: ["order_history", "versements", "progressive_measurements"] },
  { key: "clients", label: "Clients", deps: ["commandes", "order_history", "versements", "progressive_measurements", "client_felicitations", "client_versements"] },
  { key: "caisses", label: "Caisses", deps: ["transactions"] },
  { key: "fournisseurs", label: "Fournisseurs" },
  { key: "prescriptions", label: "Prescriptions", deps: ["correction_annexes"] },
  {
    key: "correction_annexes",
    label: "Annexes justificatives",
    description:
      "Supprime aussi : fichiers dans Supabase Storage (bucket correction-annexes)",
  },
  { key: "versements", label: "Versements seuls" },
  { key: "client_versements", label: "Versements client (globaux)" },
  { key: "client_felicitations", label: "Félicitations clients" },
  { key: "transactions", label: "Transactions seules" },
  { key: "order_history", label: "Historique statuts" },
  { key: "progressive_measurements", label: "Mesures progressif" },
  { key: "demandes_mutuelles", label: "Demandes mutuelles", deps: ["demande_mutuelle_history", "demande_mutuelle_commandes"] },
  { key: "demande_mutuelle_history", label: "Historique demandes mutuelles" },
  { key: "demande_mutuelle_commandes", label: "Liens demande mutuelle ↔ commande" },
  { key: "dettes", label: "Dettes" },
  { key: "notifications", label: "Notifications", deps: ["notification_reads"] },
  { key: "notification_reads", label: "Lectures de notifications" },
];


// Supprime les fichiers du bucket Storage puis les rows de correction_annexes.
async function deleteAnnexesWithStorage(): Promise<void> {
  const { data: annexes, error } = await (supabase as any)
    .from("correction_annexes")
    .select("id, file_path");
  if (error) throw new Error(`correction_annexes (lecture) : ${error.message}`);
  if (!annexes || annexes.length === 0) return;

  const filePaths = annexes
    .map((a: { file_path: string }) => a.file_path)
    .filter(Boolean);
  if (filePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("correction-annexes")
      .remove(filePaths);
    if (storageError) {
      console.error("Erreur suppression Storage:", storageError);
    }
  }

  const { error: delError } = await (supabase as any)
    .from("correction_annexes")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delError) throw new Error(`correction_annexes : ${delError.message}`);
}

function ts() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ParametresPage() {
  return (
    <RoleGuard allow="admin">
      <DashboardShell
        role="admin"
        title="Paramètres"
        subtitle="Sauvegarde, restauration et réinitialisation de la base de données"
        accent="bg-primary"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <SettingsIcon className="h-6 w-6" />
            <div>
              <h2 className="text-2xl font-bold">Paramètres</h2>
              <p className="text-sm text-muted-foreground">
                Accès réservé à l'administrateur
              </p>
            </div>
          </div>

          <BackupCard />
          <BackupScheduleCard />
          <ImportCard />
          <ResetCard />
          <EntrepriseProfileCard />
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}

/* ----------------------- BACKUP ----------------------- */
function BackupCard() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<null | "json" | "sql" | "full">(null);
  const doSql = useServerFn(exportSqlBackup);
  const doFull = useServerFn(exportFullMigration);
  const fetchTables = useServerFn(listPublicTables);

  const exportJson = async () => {
    setBusy("json");
    // Récupère la liste dynamique des tables (fallback : liste statique).
    let tableList: string[] = [];
    try {
      const dyn = await fetchTables();
      if (Array.isArray(dyn) && dyn.length > 0) tableList = dyn;
    } catch {
      // fallback ci-dessous
    }
    if (tableList.length === 0) tableList = [...TABLES];

    const out: Record<string, unknown[]> = {};
    const errs: string[] = [];
    let total = 0;
    for (const t of tableList) {
      const { data, error } = await supabase.from(t as any).select("*");
      if (error) {
        errs.push(t);
        out[t] = [];
      } else {
        out[t] = data ?? [];
        total += data?.length ?? 0;
      }
    }
    const payload = {
      export_version: "1.0",
      exported_at: new Date().toISOString(),
      exported_by: user?.id ?? null,
      tables: out,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `optigestion_backup_${ts()}.json`,
      "application/json",
    );
    setBusy(null);
    if (errs.length) toast.warning(`Backup exporté avec erreurs sur : ${errs.join(", ")}`);
    else toast.success(`✅ Backup exporté — ${total} enregistrements`);
  };

  const exportSql = async () => {
    setBusy("sql");
    try {
      const { sql, totalRows } = await doSql();
      downloadBlob(sql, `optigestion_backup_${ts()}.sql`, "text/plain");
      toast.success(`✅ Backup SQL exporté — ${totalRows} enregistrements`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'export SQL");
    } finally {
      setBusy(null);
    }
  };

  const exportFull = async () => {
    setBusy("full");
    try {
      const { sql, totalRows } = await doFull();
      downloadBlob(sql, `optigestion_migration_${ts()}.sql`, "text/plain");
      toast.success(`✅ Migration complète exportée — ${totalRows} lignes`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'export migration");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" /> Sauvegarder les données
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button onClick={exportJson} disabled={busy !== null}>
          {busy === "json" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileJson className="mr-2 h-4 w-4" />
          )}
          Exporter en JSON
        </Button>
        <Button variant="outline" onClick={exportSql} disabled={busy !== null}>
          {busy === "sql" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileCode2 className="mr-2 h-4 w-4" />
          )}
          Exporter en SQL
        </Button>
        <Button variant="default" onClick={exportFull} disabled={busy !== null}>
          {busy === "full" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileCode2 className="mr-2 h-4 w-4" />
          )}
          Migration complète + données
        </Button>
      </CardContent>
      <CardContent className="pt-0 text-xs text-muted-foreground">
        « Migration complète + données » produit un seul fichier .sql ré-exécutable
        sur un projet Supabase vierge : extensions, types, tables, FK, index, RLS,
        policies, fonctions, triggers, buckets Storage et INSERTs.
        <br />
        ⚠️ Prérequis (une fois) : exécuter <code>.lovable/migrations/dump_full_schema.sql</code> dans l'éditeur SQL Supabase.
      </CardContent>
    </Card>
  );
}

/* ----------------------- IMPORT ----------------------- */
type BackupFile = {
  export_version: string;
  exported_at?: string;
  exported_by?: string | null;
  tables: Record<string, unknown[]>;
};

function ImportCard() {
  const [file, setFile] = useState<BackupFile | null>(null);
  const [selected, setSelected] = useState<Set<TableName>>(
    new Set(TABLES.filter((t) => t !== "user_roles")),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (!parsed.export_version || !parsed.tables) {
        toast.error("❌ Fichier invalide — ce n'est pas un backup OptiGestion");
        return;
      }
      setFile(parsed);
    } catch {
      toast.error("❌ Fichier JSON illisible");
    }
  };

  const toggle = (t: TableName, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(t);
    else next.delete(t);
    setSelected(next);
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    let importedTables = 0;
    let importedRows = 0;
    try {
      for (const t of TABLES) {
        if (!selected.has(t)) continue;
        const rows = file.tables[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        setProgress(`Import ${t} (${rows.length})...`);
        const { error: delErr } = await supabase
          .from(t as any)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (delErr) throw new Error(`Suppression ${t} : ${delErr.message}`);
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase.from(t as any).insert(batch as any);
          if (error) throw new Error(`Insertion ${t} : ${error.message}`);
        }
        importedTables += 1;
        importedRows += rows.length;
      }
      toast.success(`✅ Import terminé — ${importedTables} tables, ${importedRows} enregistrements`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur d'import");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const detected = file
    ? Object.entries(file.tables)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${k} (${(v as unknown[]).length})`)
        .join(", ")
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" /> Restaurer un backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-sm text-orange-900 dark:text-orange-200">
          ⚠️ L'import écrase les données existantes des tables sélectionnées. Cette action est irréversible.
          Effectuez un backup avant de continuer.
        </div>

        <Input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          disabled={busy}
        />

        {file && (
          <>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              📦 Backup du{" "}
              {file.exported_at ? new Date(file.exported_at).toLocaleString("fr-FR") : "?"}
              <br />
              <span className="text-muted-foreground">Tables détectées : {detected}</span>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tables à importer</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TABLES.map((t) => {
                  const danger = t === "user_roles";
                  return (
                    <label
                      key={t}
                      className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                        danger ? "border-destructive/40" : ""
                      }`}
                    >
                      <Checkbox
                        checked={selected.has(t)}
                        onCheckedChange={(c) => toggle(t, Boolean(c))}
                        disabled={busy}
                      />
                      <span className={danger ? "text-destructive font-medium" : ""}>
                        {t}
                        {danger && " ⚠️"}
                      </span>
                    </label>
                  );
                })}
              </div>
              {selected.has("user_roles") && (
                <p className="text-xs text-destructive">
                  ⚠️ Attention : l'import de user_roles modifie les accès utilisateurs
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={runImport} disabled={busy || selected.size === 0}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Lancer l'import
              </Button>
              {progress && (
                <span className="text-xs text-muted-foreground">{progress}</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------- RESET ----------------------- */
function ResetCard() {
  const [fullOpen, setFullOpen] = useState(false);
  const [fullConfirm, setFullConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [selOpen, setSelOpen] = useState(false);
  const [selConfirm, setSelConfirm] = useState("");
  const [picked, setPicked] = useState<Set<AnyResetKey>>(new Set());

  // Compute auto-added deps
  const { finalSet, autoCount } = useMemo(() => {
    const s = new Set<AnyResetKey>(picked);
    let added = 0;
    const initialSize = s.size;
    for (const item of SELECTIVE_TABLES) {
      if (s.has(item.key) && item.deps) {
        for (const d of item.deps) {
          if (!s.has(d)) {
            s.add(d);
            added += 1;
          }
        }
      }
    }
    return { finalSet: s, autoCount: added, manualCount: initialSize };
  }, [picked]);

  const togglePick = (t: AnyResetKey, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(t);
    else next.delete(t);
    setPicked(next);
  };

  const runReset = async (tables: AnyResetKey[]) => {
    setBusy(true);
    try {
      const tableSet = new Set(tables);
      const all = RESET_ORDER.filter((t) => tableSet.has(t));
      for (const t of all) {
        if (t === "correction_annexes") {
          await deleteAnnexesWithStorage();
          continue;
        }
        const col = t === "demande_mutuelle_commandes" ? "demande_id" : "id";
        const { error } = await supabase
          .from(t as any)
          .delete()
          .neq(col, "00000000-0000-0000-0000-000000000000");
        if (error) throw new Error(`${t} : ${error.message}`);
      }
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors du reset");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const runFull = async () => {
    const ok = await runReset(FULL_RESET_TABLES);
    if (ok) {
      toast.success("✅ Reset complet effectué (user_roles, entreprise, personnel conservés)");
      setFullOpen(false);
      setFullConfirm("");
    }
  };

  const runSelective = async () => {
    const ok = await runReset(Array.from(finalSet));
    if (ok) {
      toast.success(`✅ Reset effectué — ${finalSet.size} tables vidées`);
      setSelOpen(false);
      setSelConfirm("");
      setPicked(new Set());
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" /> Réinitialiser les données
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          🔴 DANGER — Cette action supprime définitivement des données. Elle ne peut pas être annulée.
          Assurez-vous d'avoir un backup.
        </div>

        {/* C1 — Reset complet */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Reset complet</h3>
          <p className="text-xs text-muted-foreground">
            Supprime toutes les données métier. Les utilisateurs et rôles sont conservés.
          </p>
          <Button variant="destructive" onClick={() => setFullOpen(true)} disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4" /> Reset complet
          </Button>
        </div>

        {/* C2 — Reset sélectif */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Reset sélectif</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SELECTIVE_TABLES.map((it) => {
              const isAuto = finalSet.has(it.key) && !picked.has(it.key);
              return (
                <label
                  key={it.key}
                  className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                    isAuto ? "bg-muted/50" : ""
                  }`}
                >
                  <Checkbox
                    checked={finalSet.has(it.key)}
                    disabled={isAuto || busy}
                    onCheckedChange={(c) => togglePick(it.key, Boolean(c))}
                  />
                  <div>
                    <div className="font-medium">
                      {it.label}
                      {isAuto && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (dépendance auto)
                        </span>
                      )}
                    </div>
                    {it.description ? (
                      <div className="text-xs text-muted-foreground">
                        {it.description}
                      </div>
                    ) : it.deps ? (
                      <div className="text-xs text-muted-foreground">
                        Supprime aussi : {it.deps.join(", ")}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {picked.size} tables sélectionnées — {autoCount} ajoutées automatiquement (dépendances)
          </p>
          <Button
            variant="destructive"
            disabled={finalSet.size === 0 || busy}
            onClick={() => setSelOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Supprimer la sélection
          </Button>
        </div>
      </CardContent>

      {/* Modale reset complet */}
      <ConfirmResetDialog
        open={fullOpen}
        onOpenChange={(o) => {
          setFullOpen(o);
          if (!o) setFullConfirm("");
        }}
        title="Reset complet de la base"
        description="Êtes-vous sûr de vouloir supprimer TOUTES les données ? Cette action est irréversible."
        confirmWord="RESET"
        value={fullConfirm}
        onValue={setFullConfirm}
        busy={busy}
        onConfirm={runFull}
      />

      {/* Modale reset sélectif */}
      <ConfirmResetDialog
        open={selOpen}
        onOpenChange={(o) => {
          setSelOpen(o);
          if (!o) setSelConfirm("");
        }}
        title={`Supprimer ${finalSet.size} tables`}
        description={`Tables : ${Array.from(finalSet).join(", ")}. Cette action est irréversible.`}
        confirmWord="SUPPRIMER"
        value={selConfirm}
        onValue={setSelConfirm}
        busy={busy}
        onConfirm={runSelective}
      />
    </Card>
  );
}

function ConfirmResetDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  value,
  onValue,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmWord: string;
  value: string;
  onValue: (s: string) => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  // reset step when closing
  const handleOpen = (o: boolean) => {
    if (!o) setStep(1);
    onOpenChange(o);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {step === 2 && (
          <div className="space-y-2">
            <Label>Tapez « {confirmWord} » pour confirmer</Label>
            <Input
              value={value}
              onChange={(e) => onValue(e.target.value)}
              autoFocus
              placeholder={confirmWord}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={busy}>
            Annuler
          </Button>
          {step === 1 ? (
            <Button variant="destructive" onClick={() => setStep(2)}>
              Continuer →
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={value !== confirmWord || busy}
              onClick={onConfirm}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer la suppression
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------- BACKUP SCHEDULE ----------------------- */

const DOW_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700",
    partial: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-700",
    running: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}

function BackupScheduleCard() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getBackupSettings);
  const saveFn = useServerFn(saveBackupSettings);
  const runFn = useServerFn(runBackupNow);
  const fetchRuns = useServerFn(listBackupRuns);
  const fetchTables = useServerFn(listPublicTables);

  const { data: tables } = useQuery({
    queryKey: ["backup-tables"],
    queryFn: () => fetchTables(),
    staleTime: 60_000,
  });

  const { data: loaded } = useQuery({
    queryKey: ["backup-settings"],
    queryFn: () => fetchSettings(),
  });

  const { data: runs } = useQuery({
    queryKey: ["backup-runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 15_000,
  });

  const [s, setS] = useState<BackupSettings | null>(null);
  useEffect(() => {
    if (loaded && !s) setS(loaded as BackupSettings);
  }, [loaded, s]);

  const [emailInput, setEmailInput] = useState("");

  const saveMut = useMutation({
    mutationFn: (v: BackupSettings) =>
      saveFn({
        data: {
          daily_enabled: v.daily_enabled,
          daily_time: v.daily_time,
          weekly_enabled: v.weekly_enabled,
          weekly_dow: v.weekly_dow,
          monthly_enabled: v.monthly_enabled,
          monthly_day: v.monthly_day,
          on_caisse_close: v.on_caisse_close,
          email_enabled: v.email_enabled,
          email_recipients: v.email_recipients,
          drive_enabled: v.drive_enabled,
          drive_folder_id: v.drive_folder_id,
          formats: v.formats,
        },
      }),
    onSuccess: () => {
      toast.success("✅ Configuration enregistrée");
      qc.invalidateQueries({ queryKey: ["backup-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: () => runFn({ data: { trigger: "manual" } }),
    onSuccess: (r: any) => {
      if (r?.status === "success") toast.success(`✅ Sauvegarde réussie (${r.totalRows} lignes)`);
      else if (r?.status === "partial") toast.warning(`Partielle : ${r.error}`);
      else toast.error(`Échec : ${r?.error ?? "inconnu"}`);
      qc.invalidateQueries({ queryKey: ["backup-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!s) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Sauvegarde planifiée
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const set = <K extends keyof BackupSettings>(k: K, v: BackupSettings[K]) =>
    setS({ ...s, [k]: v });

  const addEmail = () => {
    const v = emailInput.trim().toLowerCase();
    if (!v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      toast.error("Email invalide");
      return;
    }
    if (s.email_recipients.includes(v)) return;
    set("email_recipients", [...s.email_recipients, v]);
    setEmailInput("");
  };
  const removeEmail = (e: string) =>
    set("email_recipients", s.email_recipients.filter((x) => x !== e));

  const toggleFormat = (f: "json" | "sql", on: boolean) => {
    const next = new Set(s.formats);
    if (on) next.add(f);
    else next.delete(f);
    if (next.size === 0) return;
    set("formats", Array.from(next));
  };

  const tableCount = Array.isArray(tables) ? tables.length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Sauvegarde planifiée
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {tableCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {tableCount} tables détectées dans la base — la liste est synchronisée
            automatiquement (RPC <code>list_public_tables</code>).
          </p>
        )}

        {/* Fréquences */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Fréquences</h3>

          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <Switch
              checked={s.daily_enabled}
              onCheckedChange={(v) => set("daily_enabled", v)}
            />
            <Label className="flex-1">Chaque jour à</Label>
            <Input
              type="time"
              value={s.daily_time}
              onChange={(e) => set("daily_time", e.target.value)}
              className="w-32"
              disabled={!s.daily_enabled}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <Switch
              checked={s.weekly_enabled}
              onCheckedChange={(v) => set("weekly_enabled", v)}
            />
            <Label className="flex-1">Chaque semaine — jour</Label>
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={s.weekly_dow}
              onChange={(e) => set("weekly_dow", Number(e.target.value))}
              disabled={!s.weekly_enabled}
            >
              {DOW_LABELS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <Switch
              checked={s.monthly_enabled}
              onCheckedChange={(v) => set("monthly_enabled", v)}
            />
            <Label className="flex-1">Chaque mois — jour du mois</Label>
            <Input
              type="number"
              min={1}
              max={28}
              value={s.monthly_day}
              onChange={(e) => set("monthly_day", Math.max(1, Math.min(28, Number(e.target.value))))}
              className="w-24"
              disabled={!s.monthly_enabled}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <Switch
              checked={s.on_caisse_close}
              onCheckedChange={(v) => set("on_caisse_close", v)}
            />
            <Label className="flex-1">Après chaque fermeture de caisse</Label>
          </div>
        </section>

        {/* Formats */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Formats</h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.formats.includes("json")}
                onCheckedChange={(c) => toggleFormat("json", Boolean(c))}
              />
              JSON
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.formats.includes("sql")}
                onCheckedChange={(c) => toggleFormat("sql", Boolean(c))}
              />
              SQL
            </label>
          </div>
        </section>

        {/* Destinations */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Destinations</h3>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4" />
              <Label className="flex-1">Email (Resend)</Label>
              <Switch
                checked={s.email_enabled}
                onCheckedChange={(v) => set("email_enabled", v)}
              />
            </div>
            {s.email_enabled && (
              <>
                <div className="flex flex-wrap gap-2">
                  {s.email_recipients.map((e) => (
                    <span
                      key={e}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                    >
                      {e}
                      <button
                        type="button"
                        onClick={() => removeEmail(e)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Retirer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="admin@exemple.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addEmail();
                      }
                    }}
                  />
                  <Button variant="outline" type="button" onClick={addEmail}>
                    Ajouter
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Nécessite que le connecteur <strong>Resend</strong> soit lié au projet
                  (secret <code>RESEND_API_KEY</code>).
                </p>
              </>
            )}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-3">
              <HardDriveUpload className="h-4 w-4" />
              <Label className="flex-1">Google Drive</Label>
              <Switch
                checked={s.drive_enabled}
                onCheckedChange={(v) => set("drive_enabled", v)}
              />
            </div>
            {s.drive_enabled && (
              <>
                <Input
                  placeholder="ID du dossier Drive (extrait de l'URL)"
                  value={s.drive_folder_id ?? ""}
                  onChange={(e) => set("drive_folder_id", e.target.value || null)}
                />
                <p className="text-xs text-muted-foreground">
                  Nécessite que le connecteur <strong>Google Drive</strong> soit lié au projet
                  (secret <code>GOOGLE_DRIVE_API_KEY</code>). Partagez le dossier avec le
                  compte Google connecté.
                </p>
              </>
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => saveMut.mutate(s)}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
          <Button
            variant="outline"
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
          >
            {runMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            Tester maintenant
          </Button>
        </div>

        {/* Historique */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Dernières exécutions</h3>
          {(runs as BackupRunRow[] | undefined)?.length ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-2 py-1">Quand</th>
                    <th className="px-2 py-1">Déclencheur</th>
                    <th className="px-2 py-1">Destinations</th>
                    <th className="px-2 py-1">Formats</th>
                    <th className="px-2 py-1">Lignes</th>
                    <th className="px-2 py-1">Statut</th>
                    <th className="px-2 py-1">Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs as BackupRunRow[]).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-2 py-1 whitespace-nowrap">
                        {new Date(r.started_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="px-2 py-1">{r.trigger}</td>
                      <td className="px-2 py-1">{r.destinations?.join(", ") || "—"}</td>
                      <td className="px-2 py-1">{r.formats?.join(", ") || "—"}</td>
                      <td className="px-2 py-1">{r.total_rows ?? "—"}</td>
                      <td className="px-2 py-1">{statusBadge(r.status)}</td>
                      <td className="px-2 py-1 max-w-[280px] truncate" title={r.error ?? ""}>
                        {r.error ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune exécution.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

