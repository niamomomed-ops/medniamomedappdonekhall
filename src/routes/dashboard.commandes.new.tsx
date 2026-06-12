import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { listClients } from "@/lib/clients.functions";
import { listFournisseursForSelect } from "@/lib/fournisseurs.functions";
import { createCommande, isCaisseOpen, getCommande } from "@/lib/commandes.functions";
import { listPrescriptions } from "@/lib/prescriptions.functions";
import { TYPE_LABELS, CASSE_EYE_LABELS, EYES_ORDERED_LABELS } from "@/lib/commande-labels";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ConfirmCodeField, randomConfirmCode } from "@/components/ConfirmCodeField";
import { ReceiptDialog } from "@/components/ReceiptDialog";


const searchSchema = z.object({
  client_id: z.string().uuid().optional(),
  prescription_id: z.string().uuid().optional(),
  replace_from: z.string().uuid().optional(),
  reorder_from: z.string().uuid().optional(),
});

export const Route = createFileRoute("/dashboard/commandes/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <CreateCommandePage />
    </RoleGuard>
  ),
});

const TYPES = ["vision_loin", "vision_pres", "double_foyer", "progressif", "lentilles"] as const;

function CreateCommandePage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const fetchClients = useServerFn(listClients);
  const fetchFournisseurs = useServerFn(listFournisseursForSelect);
  const fetchCaisse = useServerFn(isCaisseOpen);
  const fetchPrescriptions = useServerFn(listPrescriptions);
  const doCreate = useServerFn(createCommande);
  const fetchOne = useServerFn(getCommande);

  const { data: sourceCmd } = useQuery({
    queryKey: ["commande", search.replace_from],
    queryFn: () => fetchOne({ data: { id: search.replace_from as string } }),
    enabled: Boolean(search.replace_from),
  });
  const { data: reorderCmd } = useQuery({
    queryKey: ["commande", search.reorder_from],
    queryFn: () => fetchOne({ data: { id: search.reorder_from as string } }),
    enabled: Boolean(search.reorder_from),
  });
  const [replacementApplied, setReplacementApplied] = useState<string | null>(null);
  const [reorderApplied, setReorderApplied] = useState<string | null>(null);
  const replacementEye = (sourceCmd as any)?.casse_eye as
    | "od"
    | "og"
    | "both"
    | undefined;
  const reorderNumero = (reorderCmd as any)?.numero_commande as string | undefined;

  const { data: clients } = useQuery({
    queryKey: ["clients-select"],
    queryFn: () => fetchClients(),
  });
  const { data: fournisseurs } = useQuery({
    queryKey: ["fournisseurs-select"],
    queryFn: () => fetchFournisseurs(),
  });
  const { data: openCaisse, isLoading: caisseLoading } = useQuery({
    queryKey: ["caisse-open-status"],
    queryFn: () => fetchCaisse(),
  });

  const [clientId, setClientId] = useState<string>(search.client_id ?? "");
  const [type, setType] = useState<(typeof TYPES)[number] | "">("");
  const [lentilleType, setLentilleType] = useState<"origine" | "spherique">("origine");
  const [dateLivraison, setDateLivraison] = useState<string>("");
  const [fournisseurId, setFournisseurId] = useState<string>("");
  const [montant, setMontant] = useState<string>("0");
  const [avance, setAvance] = useState<string>("0");
  const [gratuit, setGratuit] = useState<boolean>(false);
  const [montureSource, setMontureSource] = useState<"" | "boutique" | "donnee">("");
  const [montureMarque, setMontureMarque] = useState("");
  const [montureClientProvided, setMontureClientProvided] = useState<boolean>(false);
  const [typeVerres, setTypeVerres] = useState("");
  const [lentilles, setLentilles] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [notes, setNotes] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [eyesOrdered, setEyesOrdered] = useState<"both" | "od" | "og" | "">("");
  const [eyesError, setEyesError] = useState<string>("");

  // Correction (snapshot, modifiable, ne modifie pas la prescription d'origine)
  const [odSphere, setOdSphere] = useState("");
  const [odCylinder, setOdCylinder] = useState("");
  const [odAxe, setOdAxe] = useState("");
  const [odAddition, setOdAddition] = useState("");
  const [ogSphere, setOgSphere] = useState("");
  const [ogCylinder, setOgCylinder] = useState("");
  const [ogAxe, setOgAxe] = useState("");
  const [ogAddition, setOgAddition] = useState("");
  const [prescriptionLoaded, setPrescriptionLoaded] = useState<string | null>(null);
  // Sphère de base "Vision de loin" — référence pour le recalcul VP = VL + Add.
  const [odSphereBaseVL, setOdSphereBaseVL] = useState("");
  const [ogSphereBaseVL, setOgSphereBaseVL] = useState("");

  // Prefill correction values from the patient's latest prescription
  const { data: prescriptionList } = useQuery({
    queryKey: ["client-prescriptions", clientId],
    queryFn: () => fetchPrescriptions({ data: { client_id: clientId } }),
    enabled: Boolean(clientId),
  });

  // When prescriptions arrive, prefill once per client
  useMemo(() => {
    // When reordering, the source order's correction values take precedence.
    if (search.reorder_from) return;
    const rows = (prescriptionList as any[]) ?? [];
    if (!clientId || rows.length === 0) return;
    const target =
      (search.prescription_id && rows.find((r) => r.id === search.prescription_id)) ||
      rows[0];
    if (!target) return;
    if (prescriptionLoaded === target.id) return;
    const s = (v: any) => (v === null || v === undefined ? "" : String(v));
    const odS = s(target.od_sphere);
    const ogS = s(target.og_sphere);
    const odA = s(target.od_addition);
    const ogA = s(target.og_addition);
    setOdSphereBaseVL(odS);
    setOgSphereBaseVL(ogS);
    setOdCylinder(s(target.od_cylinder));
    setOdAxe(s(target.od_axe));
    setOdAddition(odA);
    setOgCylinder(s(target.og_cylinder));
    setOgAxe(s(target.og_axe));
    setOgAddition(ogA);
    if (type === "vision_pres") {
      setOdSphere(addSphere(odS, odA));
      setOgSphere(addSphere(ogS, ogA));
    } else {
      setOdSphere(odS);
      setOgSphere(ogS);
    }
    setPrescriptionLoaded(target.id);
  }, [prescriptionList, clientId, search.prescription_id, prescriptionLoaded, type]);

  // Recalcul automatique selon le type (VL ↔ VP) et l'addition
  useMemo(() => {
    if (type === "vision_pres") {
      setOdSphere(addSphere(odSphereBaseVL, odAddition));
      setOgSphere(addSphere(ogSphereBaseVL, ogAddition));
    } else if (type === "vision_loin") {
      setOdSphere(odSphereBaseVL);
      setOgSphere(ogSphereBaseVL);
    }
  }, [type, odAddition, ogAddition, odSphereBaseVL, ogSphereBaseVL]);

  // Prefill from a casse_montage source commande (partial replacement order)
  useEffect(() => {
    const src = sourceCmd as any;
    if (!src || !src.casse_eye) return;
    if (replacementApplied === src.id) return;
    setClientId(src.client_id ?? "");
    if (src.type) setType(src.type);
    if (src.fournisseur_id) setFournisseurId(src.fournisseur_id);
    if (src.type_verres) setTypeVerres(src.type_verres);
    const s = (v: any) => (v === null || v === undefined ? "" : String(v));
    if (src.casse_eye === "od" || src.casse_eye === "both") {
      setOdSphere(s(src.od_sphere));
      setOdSphereBaseVL(s(src.od_sphere));
      setOdCylinder(s(src.od_cylinder));
      setOdAxe(s(src.od_axe));
      setOdAddition(s(src.od_addition));
    }
    if (src.casse_eye === "og" || src.casse_eye === "both") {
      setOgSphere(s(src.og_sphere));
      setOgSphereBaseVL(s(src.og_sphere));
      setOgCylinder(s(src.og_cylinder));
      setOgAxe(s(src.og_axe));
      setOgAddition(s(src.og_addition));
    }
    setNotes(
      `Commande de remplacement (casse ${
        src.casse_eye === "both" ? "OD + OG" : src.casse_eye.toUpperCase()
      }) — référence ${src.numero_commande ?? src.id}`,
    );
    setEyesOrdered(src.casse_eye === "od" || src.casse_eye === "og" ? src.casse_eye : "both");
    setReplacementApplied(src.id);
  }, [sourceCmd, replacementApplied]);

  // Prefill from a "Commander à nouveau" source: copy every field, reset
  // delivery date / notes / urgency, generate a fresh order.
  useEffect(() => {
    const src = reorderCmd as any;
    if (!src) return;
    if (reorderApplied === src.id) return;
    const s = (v: any) => (v === null || v === undefined ? "" : String(v));
    setClientId(src.client_id ?? "");
    // Type de vision préremplie depuis la commande source.
    setType((src.type ?? "") as any);
    setFournisseurId(src.fournisseur_id ?? "");
    setTypeVerres(s(src.type_verres));
    setLentilles(s(src.lentilles));
    // Montant prérempli depuis la commande source.
    setMontant(s(src.montant));
    setAvance("0");
    setQuantite(s(src.quantite) || "1");
    // Informations monture préremplies depuis la commande source.
    setMontureSource((src.monture_source ?? "") as "" | "boutique" | "donnee");
    setMontureMarque(s(src.monture_marque));
    setMontureClientProvided(Boolean(src.monture_client_provided));
    if (src.lentille_type) setLentilleType(src.lentille_type);
    // Yeux à commander laissé vide volontairement.
    setEyesOrdered("");
    setOdSphere(s(src.od_sphere));
    setOdSphereBaseVL(src.type === "vision_pres" ? subSphere(s(src.od_sphere), s(src.od_addition)) : s(src.od_sphere));
    setOdCylinder(s(src.od_cylinder));
    setOdAxe(s(src.od_axe));
    setOdAddition(s(src.od_addition));
    setOgSphere(s(src.og_sphere));
    setOgSphereBaseVL(src.type === "vision_pres" ? subSphere(s(src.og_sphere), s(src.og_addition)) : s(src.og_sphere));
    setOgCylinder(s(src.og_cylinder));
    setOgAxe(s(src.og_axe));
    setOgAddition(s(src.og_addition));
    if (src.progressive) {
      setEpOd(s(src.progressive.ecart_pupillaire_od));
      setEpOg(s(src.progressive.ecart_pupillaire_og));
      setHpOd(s(src.progressive.hauteur_pupillaire_od));
      setHpOg(s(src.progressive.hauteur_pupillaire_og));
      setGrandDia(s(src.progressive.grand_diametre));
      setHauteurCal(s(src.progressive.hauteur_calibre));
      setPont(s(src.progressive.pont));
    }
    setUrgent(false);
    setDateLivraison("");
    setNotes("");
    setReorderApplied(src.id);
  }, [reorderCmd, reorderApplied]);


  // Édition manuelle : on garde la valeur saisie et on met à jour la base VL
  // pour rester cohérent (en VP, base = sphère affichée − addition).
  const handleOdSphereChange = (v: string) => {
    setOdSphere(v);
    setOdSphereBaseVL(type === "vision_pres" ? subSphere(v, odAddition) : v);
  };
  const handleOgSphereChange = (v: string) => {
    setOgSphere(v);
    setOgSphereBaseVL(type === "vision_pres" ? subSphere(v, ogAddition) : v);
  };

  // Progressive
  const [epOd, setEpOd] = useState("");
  const [epOg, setEpOg] = useState("");
  const [hpOd, setHpOd] = useState("");
  const [hpOg, setHpOg] = useState("");
  const [grandDia, setGrandDia] = useState("");
  const [hauteurCal, setHauteurCal] = useState("");
  const [pont, setPont] = useState("");
  const [progErrors, setProgErrors] = useState<Record<string, string>>({});

  const validateProgressive = () => {
    const errs: Record<string, string> = {};
    const required = (v: string, key: string) => {
      if (v.trim() === "") {
        errs[key] = "Champ obligatoire";
        return false;
      }
      const n = parseFloat(v);
      if (Number.isNaN(n)) {
        errs[key] = "Valeur numérique invalide";
        return false;
      }
      return true;
    };
    const positive = (v: string, key: string) => {
      if (!required(v, key)) return;
      if (parseFloat(v) <= 0) errs[key] = "La valeur doit être strictement positive";
    };
    const positiveOrZero = (v: string, key: string) => {
      if (!required(v, key)) return;
      if (parseFloat(v) < 0) errs[key] = "La valeur doit être positive";
    };
    positiveOrZero(epOd, "epOd");
    positiveOrZero(epOg, "epOg");
    positiveOrZero(hpOd, "hpOd");
    positiveOrZero(hpOg, "hpOg");
    positive(grandDia, "grandDia");
    positive(hauteurCal, "hauteurCal");
    positive(pont, "pont");
    return errs;
  };




  const reste = useMemo(() => {
    const m = parseFloat(montant) || 0;
    const a = parseFloat(avance) || 0;
    return (m - a).toFixed(2);
  }, [montant, avance]);

  const clientName = useMemo(() => {
    const list = (clients as any[] | undefined) ?? [];
    return list.find((c) => c.id === clientId)?.nom_complet ?? "";
  }, [clients, clientId]);

  const odAxeNum = odAxe === "" ? null : parseInt(odAxe, 10);
  const ogAxeNum = ogAxe === "" ? null : parseInt(ogAxe, 10);
  const odAxeInvalid =
    odAxe !== "" && (Number.isNaN(odAxeNum as number) || (odAxeNum as number) < 0 || (odAxeNum as number) > 180);
  const ogAxeInvalid =
    ogAxe !== "" && (Number.isNaN(ogAxeNum as number) || (ogAxeNum as number) < 0 || (ogAxeNum as number) > 180);

  const createMut = useMutation({
    mutationFn: () => {
      const toNum = (v: string) => (v === "" ? null : parseFloat(v));
      const toInt = (v: string) => (v === "" ? null : parseInt(v, 10));
      const payload: any = {
        client_id: clientId,
        prescription_id:
          search.prescription_id ??
          ((reorderCmd as any)?.prescription_id ?? null),
        fournisseur_id: fournisseurId || null,
        type,
        date_livraison: dateLivraison || null,
        montant: parseFloat(montant) || 0,
        avance: parseFloat(avance) || 0,
        monture_source: type === "lentilles" ? null : montureSource,
        monture_marque:
          type !== "lentilles" && montureSource === "boutique"
            ? montureMarque || null
            : null,
        monture_client_provided:
          type !== "lentilles" && montureSource === "donnee"
            ? montureClientProvided
            : null,
        type_verres: typeVerres || null,
        lentilles: type === "lentilles" ? lentilles || null : null,
        quantite: parseInt(quantite, 10) || 1,
        notes: notes || null,
        urgent,
        od_sphere: toNum(odSphere),
        od_cylinder: type === "lentilles" && lentilleType === "spherique" ? null : toNum(odCylinder),
        od_axe: type === "lentilles" && lentilleType === "spherique" ? null : toInt(odAxe),
        od_addition: type === "lentilles" ? null : toNum(odAddition),
        og_sphere: toNum(ogSphere),
        og_cylinder: type === "lentilles" && lentilleType === "spherique" ? null : toNum(ogCylinder),
        og_axe: type === "lentilles" && lentilleType === "spherique" ? null : toInt(ogAxe),
        og_addition: type === "lentilles" ? null : toNum(ogAddition),
        eyes_ordered: eyesOrdered || "both",
        lentille_type: type === "lentilles" ? lentilleType : null,
        based_on_id: search.reorder_from ?? null,
      };
      if (type === "progressif") {
        payload.progressive = {
          ecart_pupillaire_od: toNum(epOd),
          ecart_pupillaire_og: toNum(epOg),
          hauteur_pupillaire_od: toNum(hpOd),
          hauteur_pupillaire_og: toNum(hpOg),
          grand_diametre: toNum(grandDia),
          hauteur_calibre: toNum(hauteurCal),
          pont: toNum(pont),
        };
      }
      return doCreate({ data: payload });
    },

    onSuccess: (created: any) => {
      toast.success("Commande créée");
      setCreatedCommande(created);
      setRecuOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [createdCommande, setCreatedCommande] = useState<any>(null);
  const [recuOpen, setRecuOpen] = useState(false);

  const guardRole = role === "agent_vente" ? "agent_vente" : "admin";
  const backHome = role ? ROLE_HOME[role] : "/dashboard/admin";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast.error("Sélectionnez un client");
      return;
    }
    if (!type) {
      toast.error("Le type de vision est obligatoire");
      return;
    }
    if (odAxeInvalid || ogAxeInvalid) {
      toast.error("L'axe doit être compris entre 0 et 180°");
      return;
    }
    if (!eyesOrdered) {
      const msg = "Veuillez sélectionner les yeux à commander";
      setEyesError(msg);
      toast.error(msg);
      return;
    }
    setEyesError("");
    if (type !== "lentilles") {
      if (!montureSource) {
        toast.error("Veuillez sélectionner la source de la monture");
        return;
      }
      if (!typeVerres.trim()) {
        toast.error("Le type de verre est obligatoire");
        return;
      }
    }
    if (type === "progressif") {
      const errs = validateProgressive();
      setProgErrors(errs);
      if (Object.keys(errs).length > 0) {
        toast.error("Mesures progressif incomplètes ou invalides");
        return;
      }
    } else {
      setProgErrors({});
    }
    if (!dateLivraison) {
      toast.error("La date de livraison est obligatoire");
      return;
    }
    createMut.mutate();
  };


  if (!caisseLoading && !openCaisse) {
    return (
      <DashboardShell
        role={guardRole}
        title="Créer une commande"
        subtitle=""
        accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
      >
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
          <p className="text-amber-900 dark:text-amber-200">
            Impossible de créer une commande sans caisse ouverte.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard/caisses" })}>
            Ouvrir une caisse
          </Button>
        </div>
      </DashboardShell>
    );
  }

  // Wait for the source order to be loaded AND applied before rendering the form,
  // so the Select inputs (Type / Fournisseur / Monture source) start out controlled
  // with the prefilled values instead of switching from uncontrolled → controlled
  // (Radix Select ignores the value change in that case).
  const reorderPending =
    Boolean(search.reorder_from) &&
    (!reorderCmd || reorderApplied !== (reorderCmd as any)?.id);
  if (reorderPending) {
    return (
      <DashboardShell
        role={guardRole}
        title="Créer une commande"
        subtitle="Chargement de la commande source…"
        accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
      >
        <div className="rounded-xl border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Préparation du formulaire à partir de la commande précédente…
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      role={guardRole}
      title="Créer une commande"
      subtitle="Renseignez les détails de la commande."
      accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
    >
      <div className="mb-4">
        <BackButton fallback="/dashboard/clients" />
      </div>

      {replacementEye && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-900 dark:text-red-200">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Commande de remplacement partielle —{" "}
              {CASSE_EYE_LABELS[replacementEye] ?? replacementEye}
            </p>
            <p className="text-xs">
              Seules les corrections de l'œil cassé sont pré-remplies. À recommander :{" "}
              <span className="font-semibold">
                {CASSE_EYE_LABELS[replacementEye] ?? replacementEye}
              </span>
              .
            </p>
          </div>
        </div>
      )}

      {search.reorder_from && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">
              Nouvelle commande basée sur {reorderNumero ?? "une commande livrée"}
            </p>
            <p className="text-xs text-muted-foreground">
              Tous les champs ont été pré-remplis et restent modifiables. Saisissez une nouvelle
              date de livraison souhaitée.
            </p>
          </div>
        </div>
      )}



      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Nouvelle commande
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Commande N° <span className="text-muted-foreground">(généré automatiquement)</span>
              {clientName && (
                <>
                  {" — "}
                  <span className="text-primary">{clientName}</span>
                </>
              )}
            </h2>
            {!clientId && (
              <p className="mt-2 text-sm text-destructive">
                Aucun client sélectionné. Revenez à la liste des clients pour démarrer la commande.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <Field label="Type *">
              <Select value={type || undefined} onValueChange={(v) => {
                setType(v as any);
                if (v === "lentilles" && !eyesOrdered) setEyesOrdered("both");
              }}>
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

            <Field label="Fournisseur">
              <Select value={fournisseurId} onValueChange={setFournisseurId}>
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

            <Field label="Quantité">
              <Input
                type="number"
                min="1"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
              />
            </Field>

            {type !== "lentilles" && (
              <>
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
                    <p className="text-xs text-muted-foreground">
                      {montureClientProvided
                        ? "Le client a déjà apporté sa monture."
                        : "Le client sera appelé à l'arrivée du verre pour apporter sa monture."}
                    </p>
                  </Field>
                ) : null}

                <Field label="Type de verre *">
                  <Input
                    value={typeVerres}
                    onChange={(e) => setTypeVerres(e.target.value)}
                    placeholder="Ex: Anti-reflet, Photochromique…"
                  />
                </Field>
              </>
            )}

            {type === "lentilles" && (
              <Field label="Lentilles">
                <Input
                  value={lentilles}
                  onChange={(e) => setLentilles(e.target.value)}
                  placeholder="Référence / modèle"
                />
              </Field>
            )}
          </CardContent>
        </Card>

        {/* Urgent toggle */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 ${urgent ? "text-red-600" : "text-muted-foreground"}`}
              />
              <div>
                <p className="text-sm font-medium">Commande urgente</p>
                <p className="text-xs text-muted-foreground">
                  Marque la commande comme prioritaire pour le montage et l'impression.
                </p>
              </div>
            </div>
            <Switch checked={urgent} onCheckedChange={setUrgent} aria-label="Commande urgente" />
          </CardContent>
        </Card>

        {/* Correction (prefilled from latest prescription, editable, no impact on patient file) */}
        {type && (
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Correction
                </h3>
                <p className="text-xs text-muted-foreground">
                  {prescriptionLoaded
                    ? "Pré-rempli depuis la dernière prescription. Modifiable — n'écrase pas le dossier patient."
                    : clientId
                    ? "Aucune prescription trouvée pour ce patient — saisie manuelle."
                    : "Sélectionnez un patient pour pré-remplir les valeurs."}
                </p>
              </div>

              {type === "lentilles" && (
                <div className="mb-4">
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

              <div className="mb-4">
                <Field label="Yeux à commander *">
                  <Select
                    value={eyesOrdered || undefined}
                    onValueChange={(v) => {
                      setEyesOrdered(v as "both" | "od" | "og");
                      setEyesError("");
                    }}
                  >
                    <SelectTrigger
                      className={eyesError ? "border-destructive focus-visible:ring-destructive" : ""}
                    >
                      <SelectValue placeholder="Sélectionner les yeux à commander" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">{EYES_ORDERED_LABELS.both}</SelectItem>
                      <SelectItem value="od">{EYES_ORDERED_LABELS.od}</SelectItem>
                      <SelectItem value="og">{EYES_ORDERED_LABELS.og}</SelectItem>
                    </SelectContent>
                  </Select>
                  {eyesError && (
                    <p className="mt-1 text-xs font-medium text-destructive">{eyesError}</p>
                  )}
                </Field>
              </div>


              <div className="grid gap-6 md:grid-cols-2">
                <div
                  className={`space-y-3 rounded-lg border border-border p-4 transition ${
                    eyesOrdered === "og" ? "pointer-events-none opacity-40" : ""
                  }`}
                  aria-disabled={eyesOrdered === "og"}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Œil droit (OD)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Sphère">
                      <NumInput value={odSphere} onChange={handleOdSphereChange} />
                    </Field>
                    {type === "lentilles" && lentilleType === "spherique" ? (
                      <div className="flex items-end pb-2 text-xs text-muted-foreground">
                        sphérique
                      </div>
                    ) : (
                      <>
                        <Field label="Cylindre"><NumInput value={odCylinder} onChange={setOdCylinder} /></Field>
                        <Field label="Axe">
                          <Input
                            type="number"
                            min="0"
                            max="180"
                            step="1"
                            value={odAxe}
                            onChange={(e) => setOdAxe(e.target.value)}
                            aria-invalid={odAxeInvalid || undefined}
                            className={odAxeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
                          />
                          {odAxeInvalid && (
                            <p className="mt-1 text-xs font-medium text-destructive">
                              L'axe doit être compris entre 0 et 180°
                            </p>
                          )}
                        </Field>
                      </>
                    )}
                    {type !== "lentilles" && (
                      <Field label="Addition"><NumInput value={odAddition} onChange={setOdAddition} /></Field>
                    )}
                  </div>
                </div>
                <div
                  className={`space-y-3 rounded-lg border border-border p-4 transition ${
                    eyesOrdered === "od" ? "pointer-events-none opacity-40" : ""
                  }`}
                  aria-disabled={eyesOrdered === "od"}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Œil gauche (OG)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Sphère">
                      <NumInput value={ogSphere} onChange={handleOgSphereChange} />
                    </Field>
                    {type === "lentilles" && lentilleType === "spherique" ? (
                      <div className="flex items-end pb-2 text-xs text-muted-foreground">
                        sphérique
                      </div>
                    ) : (
                      <>
                        <Field label="Cylindre"><NumInput value={ogCylinder} onChange={setOgCylinder} /></Field>
                        <Field label="Axe">
                          <Input
                            type="number"
                            min="0"
                            max="180"
                            step="1"
                            value={ogAxe}
                            onChange={(e) => setOgAxe(e.target.value)}
                            aria-invalid={ogAxeInvalid || undefined}
                            className={ogAxeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
                          />
                          {ogAxeInvalid && (
                            <p className="mt-1 text-xs font-medium text-destructive">
                              L'axe doit être compris entre 0 et 180°
                            </p>
                          )}
                        </Field>
                      </>
                    )}
                    {type !== "lentilles" && (
                      <Field label="Addition"><NumInput value={ogAddition} onChange={setOgAddition} /></Field>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}



        {type === "progressif" && (
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Mesures progressif
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <ProgField label="EP OD (mm)" error={progErrors.epOd}>
                  <NumInput value={epOd} onChange={(v) => { setEpOd(v); setProgErrors((p) => ({ ...p, epOd: "" })); }} invalid={!!progErrors.epOd} min={0} />
                </ProgField>
                <ProgField label="EP OG (mm)" error={progErrors.epOg}>
                  <NumInput value={epOg} onChange={(v) => { setEpOg(v); setProgErrors((p) => ({ ...p, epOg: "" })); }} invalid={!!progErrors.epOg} min={0} />
                </ProgField>
                <ProgField label="HP OD (mm)" error={progErrors.hpOd}>
                  <NumInput value={hpOd} onChange={(v) => { setHpOd(v); setProgErrors((p) => ({ ...p, hpOd: "" })); }} invalid={!!progErrors.hpOd} min={0} />
                </ProgField>
                <ProgField label="HP OG (mm)" error={progErrors.hpOg}>
                  <NumInput value={hpOg} onChange={(v) => { setHpOg(v); setProgErrors((p) => ({ ...p, hpOg: "" })); }} invalid={!!progErrors.hpOg} min={0} />
                </ProgField>
                <ProgField label="Grand diamètre (mm)" error={progErrors.grandDia}>
                  <NumInput value={grandDia} onChange={(v) => { setGrandDia(v); setProgErrors((p) => ({ ...p, grandDia: "" })); }} invalid={!!progErrors.grandDia} min={0} />
                </ProgField>
                <ProgField label="Hauteur calibre (mm)" error={progErrors.hauteurCal}>
                  <NumInput value={hauteurCal} onChange={(v) => { setHauteurCal(v); setProgErrors((p) => ({ ...p, hauteurCal: "" })); }} invalid={!!progErrors.hauteurCal} min={0} />
                </ProgField>
                <ProgField label="Pont (mm)" error={progErrors.pont}>
                  <NumInput value={pont} onChange={(v) => { setPont(v); setProgErrors((p) => ({ ...p, pont: "" })); }} invalid={!!progErrors.pont} min={0} />
                </ProgField>
              </div>

            </CardContent>
          </Card>
        )}

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Informations financières
              </h3>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={gratuit}
                  onCheckedChange={(v) => {
                    setGratuit(v);
                    if (v) {
                      setMontant("0");
                      setAvance("0");
                    }
                  }}
                />
                <span>Commande gratuite</span>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Montant total *">
                <Input
                  type="number"
                  step="0.01"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  disabled={gratuit}
                />
              </Field>
              <Field label="Avance (Donné)">
                <Input
                  type="number"
                  step="0.01"
                  value={avance}
                  onChange={(e) => setAvance(e.target.value)}
                  disabled={gratuit}
                />
              </Field>
              <Field label="Reste à payer">
                <Input value={reste} readOnly disabled />
              </Field>
              {(parseFloat(avance) || 0) > (parseFloat(montant) || 0) + 0.001 && (
                <p className="text-xs text-destructive md:col-span-2">
                  ⚠️ L'avance ne peut pas être supérieure au montant total.
                </p>
              )}

              <Field label="Date de livraison prévue *">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateLivraison && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateLivraison
                        ? format(new Date(dateLivraison + "T00:00:00"), "PPP", { locale: fr })
                        : <span>Choisir une date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={fr}
                      selected={dateLivraison ? new Date(dateLivraison + "T00:00:00") : undefined}
                      onSelect={(d) => {
                        if (!d) { setDateLivraison(""); return; }
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, "0");
                        const day = String(d.getDate()).padStart(2, "0");
                        setDateLivraison(`${y}-${m}-${day}`);
                      }}
                      disabled={(d) => {
                        const t = new Date();
                        t.setHours(0, 0, 0, 0);
                        return d < t;
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </Field>
            </div>
          </CardContent>
        </Card>


        <Card>
          <CardContent className="p-6">
            <Field label="Notes">
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <AvanceConfirmGate avance={parseFloat(avance) || 0}>
          {(confirmValid) => (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: backHome })}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={
                  createMut.isPending ||
                  Boolean(createdCommande) ||
                  !confirmValid ||
                  (parseFloat(avance) || 0) > (parseFloat(montant) || 0) + 0.001
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {createMut.isPending ? "Création…" : "Créer la commande"}
              </Button>

            </div>
          )}
        </AvanceConfirmGate>
      </form>

      {createdCommande && (
        <ReceiptDialog
          open={recuOpen}
          onOpenChange={setRecuOpen}
          title="Commande créée ✅"
          cancelLabel="Annuler"
          numeroCommande={createdCommande.numero_commande ?? null}
          clientName={clientName || null}
          telephone={
            ((clients as any[] | undefined) ?? []).find((c) => c.id === clientId)?.telephone ?? null
          }
          total={Number(createdCommande.montant ?? montant) || 0}
          verse={Number(createdCommande.avance ?? avance) || 0}
          reste={Math.max(0, (Number(createdCommande.montant ?? montant) || 0) - (Number(createdCommande.avance ?? avance) || 0))}
          type={createdCommande.type ?? type ?? null}
          montureSource={(createdCommande.monture_source ?? montureSource) || null}
          dateCreation={createdCommande.created_at ?? null}
          dateLivraison={createdCommande.date_livraison ?? dateLivraison ?? null}
          onAfterAction={() => {
            navigate({ to: "/dashboard/commandes/$id", params: { id: createdCommande.id } });
          }}
        />
      )}

    </DashboardShell>
  );
}

function AvanceConfirmGate({
  avance,
  children,
}: {
  avance: number;
  children: (valid: boolean) => React.ReactNode;
}) {
  const [valid, setValid] = useState(false);
  const fallbackCode = useMemo(() => randomConfirmCode(), []);
  const hasAvance = avance > 0;
  return (
    <>
      <ConfirmCodeField
        amount={hasAvance ? avance : undefined}
        code={hasAvance ? undefined : fallbackCode}
        onValidChange={setValid}
        label={
          hasAvance
            ? "Avance encaissée — recopiez le code pour confirmer le montant avant de créer la commande."
            : "Recopiez le code pour confirmer la création de la commande."
        }
      />
      {children(valid)}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ProgField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  invalid,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  min?: number;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={invalid ? "border-destructive focus-visible:ring-destructive" : ""}
    />
  );
}


// Sphère VP = Sphère VL + Addition. Conserve une représentation lisible (2 décimales).
function addSphere(baseVL: string, addition: string): string {
  if (baseVL === "" || baseVL === null || baseVL === undefined) return "";
  const b = parseFloat(baseVL);
  if (Number.isNaN(b)) return baseVL;
  const a = addition === "" ? 0 : parseFloat(addition);
  if (Number.isNaN(a)) return baseVL;
  return (b + a).toFixed(2);
}

// Inverse: sphère VL = sphère affichée − addition (utilisé après édition manuelle en VP).
function subSphere(displayed: string, addition: string): string {
  if (displayed === "") return "";
  const d = parseFloat(displayed);
  if (Number.isNaN(d)) return displayed;
  const a = addition === "" ? 0 : parseFloat(addition);
  if (Number.isNaN(a)) return displayed;
  return (d - a).toFixed(2);
}
