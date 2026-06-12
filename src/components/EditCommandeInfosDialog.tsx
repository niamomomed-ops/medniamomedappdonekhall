import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listFournisseursForSelect } from "@/lib/fournisseurs.functions";
import { updateCommandeInfos } from "@/lib/commandes.functions";
import { TYPE_LABELS } from "@/lib/commande-labels";

const TYPES = ["vision_loin", "vision_pres", "double_foyer", "progressif", "lentilles"] as const;

function addSphere(baseVL: string, addition: string): string {
  if (baseVL === "" || baseVL === null || baseVL === undefined) return "";
  const b = parseFloat(baseVL);
  if (Number.isNaN(b)) return baseVL;
  const a = addition === "" ? 0 : parseFloat(addition);
  if (Number.isNaN(a)) return baseVL;
  return (b + a).toFixed(2);
}
function subSphere(displayed: string, addition: string): string {
  if (displayed === "") return "";
  const d = parseFloat(displayed);
  if (Number.isNaN(d)) return displayed;
  const a = addition === "" ? 0 : parseFloat(addition);
  if (Number.isNaN(a)) return displayed;
  return (d - a).toFixed(2);
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
}) {
  return (
    <Input
      type="number"
      step="0.25"
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function EditCommandeInfosDialog({
  open,
  onOpenChange,
  commande,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  commande: any;
}) {
  const qc = useQueryClient();
  const fetchFournisseurs = useServerFn(listFournisseursForSelect);
  const doUpdate = useServerFn(updateCommandeInfos);

  const { data: fournisseurs } = useQuery({
    queryKey: ["fournisseurs-select"],
    queryFn: () => fetchFournisseurs(),
    enabled: open,
  });

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const s = (v: any) => (v === null || v === undefined ? "" : String(v));

  const [type, setType] = useState<(typeof TYPES)[number] | "">("");
  const [dateLivraison, setDateLivraison] = useState("");
  const [fournisseurId, setFournisseurId] = useState("");
  const [montureSource, setMontureSource] = useState<"" | "boutique" | "donnee">("");
  const [montureMarque, setMontureMarque] = useState("");
  const [montureClientProvided, setMontureClientProvided] = useState(false);
  const [typeVerres, setTypeVerres] = useState("");
  const [lentilles, setLentilles] = useState("");
  const [lentilleType, setLentilleType] = useState<"origine" | "spherique">("origine");

  const [odSphere, setOdSphere] = useState("");
  const [odCylinder, setOdCylinder] = useState("");
  const [odAxe, setOdAxe] = useState("");
  const [odAddition, setOdAddition] = useState("");
  const [ogSphere, setOgSphere] = useState("");
  const [ogCylinder, setOgCylinder] = useState("");
  const [ogAxe, setOgAxe] = useState("");
  const [ogAddition, setOgAddition] = useState("");
  // Base "Vision de loin" — référence pour le recalcul VP = VL + Add.
  const [odSphereBaseVL, setOdSphereBaseVL] = useState("");
  const [ogSphereBaseVL, setOgSphereBaseVL] = useState("");


  // Progressive
  const [epOd, setEpOd] = useState("");
  const [epOg, setEpOg] = useState("");
  const [hpOd, setHpOd] = useState("");
  const [hpOg, setHpOg] = useState("");
  const [grandDia, setGrandDia] = useState("");
  const [hauteurCal, setHauteurCal] = useState("");
  const [pont, setPont] = useState("");

  // Prefill from commande on open
  useEffect(() => {
    if (!open || !commande) return;
    const prescription = commande.prescriptions ?? null;
    const snapshotOrPrescription = (key: string, fallbackAllowed: boolean) => {
      const value = commande[key];
      if (value !== null && value !== undefined) return s(value);
      return fallbackAllowed ? s(prescription?.[key]) : "";
    };
    setType((commande.type as any) ?? "");
    setDateLivraison(s(commande.date_livraison));
    setFournisseurId(s(commande.fournisseur_id));
    setMontureSource((commande.monture_source as any) ?? "");
    setMontureMarque(s(commande.monture_marque));
    setMontureClientProvided(Boolean(commande.monture_client_provided));
    setTypeVerres(s(commande.type_verres));
    setLentilles(s(commande.lentilles));
    setLentilleType((commande.lentille_type as any) ?? "origine");
    // Base VL : si la commande est en VP, on déduit la sphère VL = sphère affichée − addition
    const odS = snapshotOrPrescription("od_sphere", true);
    const ogS = snapshotOrPrescription("og_sphere", true);
    const odA = snapshotOrPrescription("od_addition", true);
    const ogA = snapshotOrPrescription("og_addition", true);
    setOdSphere(odS);
    setOdCylinder(snapshotOrPrescription("od_cylinder", true));
    setOdAxe(snapshotOrPrescription("od_axe", true));
    setOdAddition(odA);
    setOgSphere(ogS);
    setOgCylinder(snapshotOrPrescription("og_cylinder", true));
    setOgAxe(snapshotOrPrescription("og_axe", true));
    setOgAddition(ogA);
    setOdSphereBaseVL(commande.type === "vision_pres" ? subSphere(odS, odA) : odS);
    setOgSphereBaseVL(commande.type === "vision_pres" ? subSphere(ogS, ogA) : ogS);

    const p = commande.progressive ?? {};
    setEpOd(s(p.ecart_pupillaire_od));
    setEpOg(s(p.ecart_pupillaire_og));
    setHpOd(s(p.hauteur_pupillaire_od));
    setHpOg(s(p.hauteur_pupillaire_og));
    setGrandDia(s(p.grand_diametre));
    setHauteurCal(s(p.hauteur_calibre));
    setPont(s(p.pont));
  }, [open, commande]);

  // Recalcul automatique VL ↔ VP : sphère affichée = base VL + addition
  useEffect(() => {
    if (type === "vision_pres") {
      setOdSphere(addSphere(odSphereBaseVL, odAddition));
      setOgSphere(addSphere(ogSphereBaseVL, ogAddition));
    } else if (type === "vision_loin") {
      setOdSphere(odSphereBaseVL);
      setOgSphere(ogSphereBaseVL);
    }
  }, [type, odAddition, ogAddition, odSphereBaseVL, ogSphereBaseVL]);

  // Édition manuelle de la sphère : on met à jour la base VL pour cohérence
  const handleOdSphereChange = (v: string) => {
    setOdSphere(v);
    setOdSphereBaseVL(type === "vision_pres" ? subSphere(v, odAddition) : v);
  };
  const handleOgSphereChange = (v: string) => {
    setOgSphere(v);
    setOgSphereBaseVL(type === "vision_pres" ? subSphere(v, ogAddition) : v);
  };

  const eyes = (commande?.eyes_ordered ?? "both") as "both" | "od" | "og";
  const showOD = eyes !== "og";
  const showOG = eyes !== "od";
  const showAddition = type === "progressif" || type === "double_foyer" || type === "vision_pres";
  const isLentilles = type === "lentilles";


  const mut = useMutation({
    mutationFn: () => {
      const toNum = (v: string) => (v === "" ? null : parseFloat(v));
      const toInt = (v: string) => (v === "" ? null : parseInt(v, 10));
      const payload: any = {
        id: commande.id,
        type,
        date_livraison: dateLivraison || null,
        fournisseur_id: fournisseurId || null,
        monture_source: isLentilles ? null : montureSource || null,
        monture_marque:
          !isLentilles && montureSource === "boutique" ? montureMarque || null : null,
        monture_client_provided:
          !isLentilles && montureSource === "donnee" ? montureClientProvided : null,
        type_verres: isLentilles ? null : typeVerres || null,
        lentilles: isLentilles ? lentilles || null : null,
        lentille_type: isLentilles ? lentilleType : null,
        od_sphere: toNum(odSphere),
        od_cylinder: isLentilles && lentilleType === "spherique" ? null : toNum(odCylinder),
        od_axe: isLentilles && lentilleType === "spherique" ? null : toInt(odAxe),
        od_addition: isLentilles ? null : toNum(odAddition),
        og_sphere: toNum(ogSphere),
        og_cylinder: isLentilles && lentilleType === "spherique" ? null : toNum(ogCylinder),
        og_axe: isLentilles && lentilleType === "spherique" ? null : toInt(ogAxe),
        og_addition: isLentilles ? null : toNum(ogAddition),

        progressive:
          type === "progressif"
            ? {
                ecart_pupillaire_od: toNum(epOd),
                ecart_pupillaire_og: toNum(epOg),
                hauteur_pupillaire_od: toNum(hpOd),
                hauteur_pupillaire_og: toNum(hpOg),
                grand_diametre: toNum(grandDia),
                hauteur_calibre: toNum(hauteurCal),
                pont: toNum(pont),
              }
            : null,
      };
      return doUpdate({ data: payload });
    },
    onSuccess: (res: any) => {
      if (res?.changed === 0) {
        toast.info("Aucune modification");
      } else {
        toast.success("Commande modifiée");
      }
      qc.invalidateQueries({ queryKey: ["commande", commande.id] });
      qc.invalidateQueries({ queryKey: ["commandes"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!type) {
      toast.error("Type obligatoire");
      return;
    }
    if (dateLivraison && dateLivraison < todayStr) {
      toast.error("La date de livraison ne peut pas être antérieure à aujourd'hui");
      return;
    }
    if (!isLentilles && !montureSource) {
      toast.error("Sélectionnez la source de la monture");
      return;
    }
    if (!isLentilles && !typeVerres.trim()) {
      toast.error("Type de verre obligatoire");
      return;
    }
    if (isLentilles && !lentilles.trim()) {
      toast.error("Modèle / référence des lentilles obligatoire");
      return;
    }
    mut.mutate();
  };

  const numero = commande?.numero_commande ?? "—";
  const clientName = commande?.clients?.nom_complet ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Modification commande {numero} du client {clientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Type & date de livraison en premier */}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Type *">
              <Select value={type || undefined} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="-- Sélectionner --" />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date de livraison">
              <Input
                type="date"
                min={todayStr}
                value={dateLivraison}
                onChange={(e) => setDateLivraison(e.target.value)}
              />
            </Field>
          </div>

          {/* Correction */}
          {type && (
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Correction
              </h3>

              {isLentilles && (
                <div className="mb-3">
                  <Field label="Type de lentille">
                    <div className="inline-flex rounded-md border border-border bg-background p-1">
                      <button
                        type="button"
                        onClick={() => setLentilleType("origine")}
                        className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                          lentilleType === "origine"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Origine
                      </button>
                      <button
                        type="button"
                        onClick={() => setLentilleType("spherique")}
                        className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                          lentilleType === "spherique"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Sphérique
                      </button>
                    </div>
                  </Field>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {showOD && (
                  <div className="space-y-3 rounded border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Œil droit (OD)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Sphère">
                        <NumInput value={odSphere} onChange={handleOdSphereChange} />
                      </Field>
                      {!(isLentilles && lentilleType === "spherique") && (
                        <>
                          <Field label="Cylindre">
                            <NumInput value={odCylinder} onChange={setOdCylinder} />
                          </Field>
                          <Field label="Axe">
                            <Input
                              type="number"
                              min={0}
                              max={180}
                              step={1}
                              value={odAxe}
                              onChange={(e) => setOdAxe(e.target.value)}
                            />
                          </Field>
                        </>
                      )}
                      {!isLentilles && showAddition && (
                        <Field label="Addition">
                          <NumInput value={odAddition} onChange={setOdAddition} />
                        </Field>
                      )}
                    </div>
                  </div>
                )}
                {showOG && (
                  <div className="space-y-3 rounded border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Œil gauche (OG)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Sphère">
                        <NumInput value={ogSphere} onChange={handleOgSphereChange} />
                      </Field>
                      {!(isLentilles && lentilleType === "spherique") && (
                        <>
                          <Field label="Cylindre">
                            <NumInput value={ogCylinder} onChange={setOgCylinder} />
                          </Field>
                          <Field label="Axe">
                            <Input
                              type="number"
                              min={0}
                              max={180}
                              step={1}
                              value={ogAxe}
                              onChange={(e) => setOgAxe(e.target.value)}
                            />
                          </Field>
                        </>
                      )}
                      {!isLentilles && showAddition && (
                        <Field label="Addition">
                          <NumInput value={ogAddition} onChange={setOgAddition} />
                        </Field>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {type === "progressif" && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="EP OD (mm)">
                    <NumInput value={epOd} onChange={setEpOd} min={0} />
                  </Field>
                  <Field label="EP OG (mm)">
                    <NumInput value={epOg} onChange={setEpOg} min={0} />
                  </Field>
                  <Field label="HP OD (mm)">
                    <NumInput value={hpOd} onChange={setHpOd} min={0} />
                  </Field>
                  <Field label="HP OG (mm)">
                    <NumInput value={hpOg} onChange={setHpOg} min={0} />
                  </Field>
                  <Field label="Grand diamètre (mm)">
                    <NumInput value={grandDia} onChange={setGrandDia} min={0} />
                  </Field>
                  <Field label="Hauteur calibre (mm)">
                    <NumInput value={hauteurCal} onChange={setHauteurCal} min={0} />
                  </Field>
                  <Field label="Pont (mm)">
                    <NumInput value={pont} onChange={setPont} min={0} />
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* Fournisseur */}
          <Field label="Fournisseur">
            <Select value={fournisseurId || undefined} onValueChange={setFournisseurId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {((fournisseurs as any[]) ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Monture & verres — recopie du style "ajouter commande" */}
          {!isLentilles && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Monture (source) *">
                <Select
                  value={montureSource || undefined}
                  onValueChange={(v) => setMontureSource(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="-- Sélectionner --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boutique">Boutique</SelectItem>
                    <SelectItem value="donnee">Donnée par le client</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {montureSource === "boutique" ? (
                <Field label="Marque de la monture">
                  <Input
                    value={montureMarque}
                    onChange={(e) => setMontureMarque(e.target.value)}
                    placeholder="Ex: Ray-Ban, Oakley…"
                  />
                </Field>
              ) : montureSource === "donnee" ? (
                <Field label="Statut monture client">
                  <div className="inline-flex rounded-md border border-border bg-background p-1">
                    <button
                      type="button"
                      onClick={() => setMontureClientProvided(true)}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                        montureClientProvided
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Fournie
                    </button>
                    <button
                      type="button"
                      onClick={() => setMontureClientProvided(false)}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                        !montureClientProvided
                          ? "bg-amber-500 text-white"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Non fournie
                    </button>
                  </div>
                </Field>
              ) : (
                <div />
              )}

              <Field label="Type de verre *">
                <Input
                  value={typeVerres}
                  onChange={(e) => setTypeVerres(e.target.value)}
                  placeholder="Ex: Anti-reflet, Photochromique…"
                />
              </Field>
            </div>
          )}

          {isLentilles && (
            <Field label="Modèle / référence des lentilles *">
              <Input
                value={lentilles}
                onChange={(e) => setLentilles(e.target.value)}
                placeholder="Référence / modèle"
              />
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={mut.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {mut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
