import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Plus,
  ShoppingCart,
  Phone,
  Cake,
  MapPin,
  Mail,
  Wallet,
  RefreshCw,
  ClipboardCopy,
  Check,
  ChevronRight,
  FileText,
} from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { BackButton } from "@/components/BackButton";
import { buildCorrectionClipboard } from "@/lib/correction-format";
import { printCorrection } from "@/lib/print-correction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClientExtraFields,
  emptyExtras,
  extrasFromClient,
  extrasToPayload,
  WhatsappToggleField,
  type ClientExtraValues,
} from "@/components/ClientExtraFields";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { updateClient } from "@/lib/clients.functions";
import {
  getClient,
  listPrescriptions,
  createPrescription,
  updatePrescription,
  listCommandesForClient,
} from "@/lib/prescriptions.functions";
import { getClientDebt, type ClientDebtDetail } from "@/lib/dettes.functions";
import { listDemandesMutuellesForClient } from "@/lib/mutuelles.functions";
import { countMutuelleJustificatifsByDemandes } from "@/lib/mutuelle-justificatifs.functions";
import { MutuelleJustifsLightboxButton } from "@/components/MutuelleJustifsBlock";
import { MutuelleLivraisonToggle } from "@/components/MutuelleLivraisonToggle";
import { MutuellePrintAuto } from "@/components/MutuellePrintAuto";

import { Printer } from "lucide-react";
import {
  DetteVersementDialog,
  type DetteTarget,
} from "@/components/DetteVersementDialog";
import { uploadCorrectionAnnexes } from "@/lib/correction-annexes.functions";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
import { CorrectionAnnexesUploader } from "@/components/CorrectionAnnexesUploader";
import { CorrectionAnnexesList } from "@/components/CorrectionAnnexesList";
import { Pagination } from "@/components/ui/AppPagination";
import { usePagination } from "@/hooks/usePagination";
import { isBirthdayToday } from "@/lib/birthday";
import { FeliciterButton } from "@/components/FeliciterButton";
import { CIVILITES, composeNomComplet, splitNomComplet } from "@/lib/client-name";

export const Route = createFileRoute("/dashboard/clients/$id")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente", "agent_montage"]}>
      <ClientDetailPage />
    </RoleGuard>
  ),
});

type Client = {
  id: string;
  nom_complet: string;
  civilite?: string | null;
  nom?: string | null;
  prenom?: string | null;
  date_naissance: string;
  email: string;
  telephone: string;
  adresse: string;
  created_at: string;
  cin?: string | null;
  mutuelle?: string | null;
  mutuelle_autre?: string | null;
  whatsapp?: string | null;
};

type Prescription = {
  id: string;
  client_id: string;
  type: "interne" | "externe";
  date_prescription: string;
  od_sphere: number;
  od_cylinder: number;
  od_axe: number;
  od_addition: number;
  og_sphere: number;
  og_cylinder: number;
  og_axe: number;
  og_addition: number;
  correction_par?: string | null;
  note?: string | null;
};

type Commande = {
  id: string;
  status: string;
  created_at: string;
  prescription_id: string | null;
  prescriptions: { date_prescription: string; type: string } | null;
};

type MutuelleDemande = {
  id: string;
  numero_demande: string;
  organisme: string | null;
  source_correction: "interne" | "externe" | "mixte";
  statut: "en_attente" | "remplie" | "livree";
  created_at: string;
  remplie_at: string | null;
  livree: boolean | null;
  livree_at: string | null;
  prix_monture?: number | null;
  prix_verre?: number | null;
  total_remboursement?: number | null;
  demande_mutuelle_commandes?: Array<{
    commande_id: string;
    commandes?: { montant: number; numero_commande?: string | null; type?: string; monture_source?: string | null } | null;
  }>;
};

function ClientDetailPage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchClient = useServerFn(getClient);
  const fetchPrescriptions = useServerFn(listPrescriptions);
  const fetchCommandes = useServerFn(listCommandesForClient);
  const doUpdateClient = useServerFn(updateClient);
  const doCreatePrescription = useServerFn(createPrescription);
  const doUpdatePrescription = useServerFn(updatePrescription);

  const canWrite = role === "admin" || role === "agent_vente";

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ["client", id],
    queryFn: () => fetchClient({ data: { id } }),
  });

  const { data: prescriptions } = useQuery({
    queryKey: ["prescriptions", id],
    queryFn: () => fetchPrescriptions({ data: { client_id: id } }),
  });

  const { data: commandes } = useQuery({
    queryKey: ["commandes", id],
    queryFn: () => fetchCommandes({ data: { client_id: id } }),
  });

  const fetchDebt = useServerFn(getClientDebt);
  const { data: debtData } = useQuery({
    queryKey: ["client-debt", id],
    queryFn: () => fetchDebt({ data: { client_id: id } }),
  });

  const fetchDemandesMutuelles = useServerFn(listDemandesMutuellesForClient);
  const { data: demandesMutuelles } = useQuery({
    queryKey: ["mutuelles-client", id],
    queryFn: () => fetchDemandesMutuelles({ data: { client_id: id } }),
  });

  const fetchJustifsCounts = useServerFn(countMutuelleJustificatifsByDemandes);
  const mutuelleIds = ((demandesMutuelles as MutuelleDemande[] | undefined) ?? []).map((d) => d.id);
  const { data: justifsCountsRaw } = useQuery({
    queryKey: ["mutuelles-client-justifs-counts", id, mutuelleIds.join(",")],
    queryFn: () => fetchJustifsCounts({ data: { demande_ids: mutuelleIds } }),
    enabled: mutuelleIds.length > 0,
  });
  const justifsCountsMap = (justifsCountsRaw as Record<string, number> | undefined) ?? {};

  const [editClientOpen, setEditClientOpen] = useState(false);
  const [addPrescriptionOpen, setAddPrescriptionOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] =
    useState<Prescription | null>(null);
  const [payingDette, setPayingDette] = useState<DetteTarget | null>(null);
  const [printMutuelle, setPrintMutuelle] = useState<MutuelleDemande | null>(null);
  

  const editClientMut = useMutation({
    mutationFn: (v: {
      nom_complet: string;
      civilite: string | null;
      nom: string | null;
      prenom: string | null;
      date_naissance: string;
      email: string;
      telephone: string;
      adresse: string;
      cin: string | null;
      mutuelle: string | null;
      mutuelle_autre: string | null;
      whatsapp: string | null;
    }) =>
      doUpdateClient({ data: { id, ...v } }),
    onSuccess: () => {
      toast.success("Client mis à jour");
      qc.invalidateQueries({ queryKey: ["client", id] });
      setEditClientOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { user } = useAuth();

  const createPrescMut = useMutation({
    mutationFn: async (
      v: Omit<Prescription, "id" | "client_id"> & { annexes: File[] },
    ) => {
      const { annexes, ...prescData } = v;
      const created = await doCreatePrescription({
        data: { ...prescData, client_id: id },
      });
      if (annexes.length > 0 && created?.id) {
        const files = await Promise.all(
          annexes.map(async (f) => ({
            name: f.name,
            type: f.type,
            size: f.size,
            base64: await fileToBase64(f),
          })),
        );
        const res = await uploadCorrectionAnnexes({
          data: { prescriptionId: created.id, files },
        });
        if (res.successCount > 0)
          toast.success(`${res.successCount} image(s) uploadée(s)`);
        if (res.failedCount > 0)
          toast.error(`${res.failedCount} image(s) n'ont pas pu être uploadée(s)`);
      }
      return created;
    },
    onSuccess: () => {
      toast.success("Correction ajoutée");
      qc.invalidateQueries({ queryKey: ["prescriptions", id] });
      setAddPrescriptionOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePrescMut = useMutation({
    mutationFn: async (v: Prescription & { annexes?: File[] }) => {
      const { annexes, ...prescData } = v;
      const updated = await doUpdatePrescription({ data: prescData });
      if (annexes && annexes.length > 0) {
        const files = await Promise.all(
          annexes.map(async (f) => ({
            name: f.name,
            type: f.type,
            size: f.size,
            base64: await fileToBase64(f),
          })),
        );
        const res = await uploadCorrectionAnnexes({
          data: { prescriptionId: prescData.id, files },
        });
        if (res.successCount > 0)
          toast.success(`${res.successCount} image(s) uploadée(s)`);
        if (res.failedCount > 0)
          toast.error(`${res.failedCount} image(s) n'ont pas pu être uploadée(s)`);
      }
      return updated;
    },
    onSuccess: () => {
      toast.success("Correction mise à jour");
      qc.invalidateQueries({ queryKey: ["prescriptions", id] });
      qc.invalidateQueries({ queryKey: ["correction-annexes"] });
      setEditingPrescription(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // (Commande creation now lives in /dashboard/commandes/new)

  const backTo = role ? ROLE_HOME[role] : "/dashboard/admin";
  const guardRole =
    role === "agent_vente"
      ? "agent_vente"
      : role === "agent_montage"
      ? "agent_montage"
      : "admin";

  const c = client as Client | undefined;
  const list = (prescriptions as Prescription[] | undefined) ?? [];
  const {
    page: corrPage,
    setPage: setCorrPage,
    visible: corrVisible,
    total: corrTotal,
  } = usePagination(list, [list.length], { pageSize: 5, syncUrl: false });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash.startsWith("prescription-") || list.length === 0) return;
    const presId = hash.slice("prescription-".length);
    const idx = list.findIndex((p) => p.id === presId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / 5) + 1;
    setCorrPage(targetPage);
    const t = setTimeout(() => {
      document
        .getElementById(hash)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);
  const commandesList = (commandes as Commande[] | undefined) ?? [];
  const debt = debtData as ClientDebtDetail | undefined;
  const dette = debt?.dette ?? 0;

  return (
    <DashboardShell
      role={guardRole}
      title="Fiche client"
      subtitle="Détails, corrections et commandes."
      accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
    >
      <div className="mb-4">
        <BackButton fallback="/dashboard/clients" />
      </div>

      {loadingClient || !c ? (
        <div className="text-muted-foreground">Chargement…</div>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Left panel */}
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold leading-tight sm:text-2xl">
                  {c.nom_complet}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Client depuis{" "}
                  {new Date(c.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="break-all">{c.telephone}</span>
                  {c.whatsapp && c.whatsapp !== c.telephone && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                      WA {c.whatsapp}
                    </span>
                  )}
                  {(!c.whatsapp || c.whatsapp === c.telephone) && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                      WhatsApp
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="break-all">{c.email}</span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Cake className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {new Date(c.date_naissance).toLocaleDateString("fr-FR")}
                  </span>
                  {(() => {
                    const birth = new Date(c.date_naissance);
                    const today = new Date();
                    let age = today.getFullYear() - birth.getFullYear();
                    const m = today.getMonth() - birth.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                    return (
                      <span className="text-xs text-muted-foreground">
                        · {age} ans
                      </span>
                    );
                  })()}
                  {role !== "agent_montage" && isBirthdayToday(c.date_naissance) && (
                    <FeliciterButton
                      clientId={c.id}
                      nomComplet={c.nom_complet}
                      telephone={c.telephone}
                      whatsapp={c.whatsapp ?? null}
                    />
                  )}
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 break-words">{c.adresse}</span>
                </div>
                {c.cin && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">CIN</span>
                    <span>{c.cin}</span>
                  </div>
                )}
                {c.mutuelle && (
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Mutuelle</span>
                    <span className="min-w-0 break-words">
                      {c.mutuelle === "Autre"
                        ? c.mutuelle_autre || "Autre"
                        : c.mutuelle}
                    </span>
                  </div>
                )}
              </div>

              {canWrite && (
                <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      <Pencil className="mr-2 h-4 w-4" /> Modifier
                    </Button>
                  </DialogTrigger>
                  <ClientEditDialog
                    initial={c}
                    submitting={editClientMut.isPending}
                    onSubmit={(v) => editClientMut.mutateAsync(v)}
                  />
                </Dialog>
              )}
            </CardContent>
          </Card>

          {/* Right panel */}
          <div className="min-w-0">
            <Tabs defaultValue="corrections">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 overflow-x-auto sm:inline-flex sm:w-auto sm:grid-cols-none">
                <TabsTrigger value="corrections" className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
                  Corrections ({list.length})
                </TabsTrigger>
                <TabsTrigger value="commandes" className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
                  Commandes ({commandesList.length})
                </TabsTrigger>
                <TabsTrigger value="dettes" className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
                  Dette{dette > 0 ? ` (${dette.toFixed(2)})` : ""}
                </TabsTrigger>
                <TabsTrigger value="mutuelles" className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
                  Mutuelles ({(demandesMutuelles as MutuelleDemande[] | undefined)?.length ?? 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="corrections" className="space-y-4">
                {canWrite && (
                  <div className="flex justify-end">
                    <Dialog
                      open={addPrescriptionOpen}
                      onOpenChange={setAddPrescriptionOpen}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" /> Nouvelle correction
                        </Button>
                      </DialogTrigger>
                      <PrescriptionFormDialog
                        title="Nouvelle correction"
                        submitLabel="Créer"
                        submitting={createPrescMut.isPending}
                        onSubmit={(v) => createPrescMut.mutateAsync(v)}
                      />
                    </Dialog>
                  </div>
                )}

                {list.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Aucune correction enregistrée.
                  </div>
                )}

                {corrVisible.map((p) => (
                  <PrescriptionCard
                    key={p.id}
                    p={p}
                    canWrite={canWrite}
                    clientName={c?.nom_complet ?? null}
                    onEdit={() => setEditingPrescription(p)}
                    onCreateOrder={() =>
                      navigate({
                        to: "/dashboard/commandes/new",
                        search: { client_id: id, prescription_id: p.id },
                      })
                    }
                    creatingOrder={false}
                  />
                ))}

                <Pagination
                  currentPage={corrPage}
                  totalItems={corrTotal}
                  pageSize={5}
                  onPageChange={setCorrPage}
                />
              </TabsContent>

              <TabsContent value="commandes">
                <div className="rounded-xl border border-border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Prescription</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commandesList.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-muted-foreground"
                          >
                            Aucune commande.
                          </TableCell>
                        </TableRow>
                      )}
                      {commandesList.map((cmd) => (
                        <TableRow key={cmd.id}>
                          <TableCell>
                            {new Date(cmd.created_at).toLocaleDateString(
                              "fr-FR",
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {cmd.prescriptions
                              ? `${cmd.prescriptions.type} — ${new Date(
                                  cmd.prescriptions.date_prescription,
                                ).toLocaleDateString("fr-FR")}`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{cmd.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canWrite && cmd.status === "livree" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    navigate({
                                      to: "/dashboard/commandes/new",
                                      search: { reorder_from: cmd.id },
                                    })
                                  }
                                >
                                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                  Commander à nouveau
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  navigate({
                                    to: "/dashboard/commandes/$id",
                                    params: { id: cmd.id },
                                  })
                                }
                              >
                                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Ouvrir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="dettes" className="space-y-4">
                {dette > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center">
                      <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-300">
                        Reste à payer
                      </p>
                      <p
                        className="mt-1 font-bold tabular-nums text-red-600 dark:text-red-400"
                        style={{ fontSize: "1.5rem", fontWeight: 700 }}
                      >
                        {dette.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                      <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        Total versé
                      </p>
                      <p
                        className="mt-1 tabular-nums text-emerald-600 dark:text-emerald-400"
                        style={{ fontSize: "1.25rem", fontWeight: 600 }}
                      >
                        {(debt?.total_versements ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Reste initial
                      </p>
                      <p
                        className="mt-1 tabular-nums text-muted-foreground"
                        style={{ fontSize: "1.25rem", fontWeight: 600 }}
                      >
                        {(debt?.total_restes_livrees ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Ce client n'a aucune dette.
                  </div>
                )}

                {canWrite && dette > 0 && (
                  <Button
                    onClick={() =>
                      setPayingDette({
                        client_id: id,
                        client_nom: c?.nom_complet ?? "",
                        dette,
                      })
                    }
                  >
                    <Wallet className="mr-1.5 h-3.5 w-3.5" />
                    Enregistrer un remboursement
                  </Button>
                )}

                {(debt?.commandes_livrees.length ?? 0) > 0 && (
                  <Card>
                    <CardContent className="space-y-2 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Commandes livrées avec reste à payer
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>N° commande</TableHead>
                            <TableHead>Livrée le</TableHead>
                            <TableHead className="text-right">Montant</TableHead>
                            <TableHead className="text-right">Avance</TableHead>
                            <TableHead className="text-right">Reste initial</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {debt?.commandes_livrees.map((cmd) => (
                            <TableRow
                              key={cmd.id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() =>
                                navigate({
                                  to: "/dashboard/commandes/$id",
                                  params: { id: cmd.id },
                                })
                              }
                            >
                              <TableCell className="font-mono text-xs">
                                {cmd.numero_commande ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(cmd.created_at).toLocaleDateString("fr-FR")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {cmd.montant.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {cmd.avance.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {cmd.reste.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {(debt?.versements.length ?? 0) > 0 && (
                  <Card>
                    <CardContent className="space-y-2 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Historique des remboursements ({debt?.versements.length})
                      </p>
                      <div className="divide-y divide-border">
                        {debt?.versements.map((v) => (
                          <div
                            key={v.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                          >
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">
                                {new Date(v.created_at).toLocaleString("fr-FR")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Agent : {v.created_by_name ?? "—"}
                              </span>
                              {v.note && (
                                <span className="text-xs italic text-muted-foreground">
                                  {v.note}
                                </span>
                              )}
                            </div>
                            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                              +{v.amount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="mutuelles" className="space-y-4">
                {canWrite && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate({
                          to: "/dashboard/mutuelles/new",
                          search: { client_id: id },
                        })
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" /> Demande Mutuelle
                    </Button>
                  </div>
                )}
                {(() => {
                  const dm = (demandesMutuelles as MutuelleDemande[] | undefined) ?? [];
                  if (dm.length === 0) {
                    return (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        Aucune demande mutuelle.
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:hidden">
                        {dm.map((d) => {
                          const nbCmds = d.demande_mutuelle_commandes?.length ?? 0;
                          const total = (d.demande_mutuelle_commandes ?? []).reduce(
                            (sum, c) => sum + (c.commandes?.montant ?? 0),
                            0,
                          );
                          const remboursement = d.total_remboursement != null
                            ? Number(d.total_remboursement).toFixed(2)
                            : d.prix_monture != null || d.prix_verre != null
                              ? (Number(d.prix_monture ?? 0) + Number(d.prix_verre ?? 0)).toFixed(2)
                              : "—";
                          return (
                            <Card key={d.id}>
                              <CardContent className="space-y-3 p-4">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-mono text-xs text-muted-foreground">
                                      {d.numero_demande}
                                    </p>
                                    <h3 className="mt-1 break-words text-base font-semibold">
                                      {d.organisme ?? "—"}
                                    </h3>
                                  </div>
                                  {d.statut === "remplie" ? (
                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25">
                                      Remplie
                                    </Badge>
                                  ) : d.statut === "livree" ? (
                                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25">
                                      Livrée
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25">
                                      En attente
                                    </Badge>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div className="rounded-lg border border-border p-2">
                                    <p className="text-xs text-muted-foreground">Commandes</p>
                                    <p className="font-semibold tabular-nums">{nbCmds}</p>
                                  </div>
                                  <div className="rounded-lg border border-border p-2">
                                    <p className="text-xs text-muted-foreground">Source</p>
                                    <Badge variant="outline" className="mt-1 text-xs capitalize">
                                      {d.source_correction}
                                    </Badge>
                                  </div>
                                  <div className="rounded-lg border border-border p-2">
                                    <p className="text-xs text-muted-foreground">Total</p>
                                    <p className="font-semibold tabular-nums">{total.toFixed(2)}</p>
                                  </div>
                                  <div className="rounded-lg border border-border p-2">
                                    <p className="text-xs text-muted-foreground">Remb.</p>
                                    <p className="font-semibold tabular-nums">{remboursement}</p>
                                  </div>
                                </div>

                                <div className="rounded-lg border border-border p-2">
                                  <p className="mb-2 text-xs text-muted-foreground">Livraison</p>
                                  <MutuelleLivraisonToggle
                                    id={d.id}
                                    livree={!!d.livree}
                                    canEdit={canWrite}
                                    statut={d.statut}
                                  />
                                </div>

                                <div className="grid gap-2">
                                  {(justifsCountsMap[d.id] ?? 0) > 0 && (
                                    <MutuelleJustifsLightboxButton
                                      demandeId={d.id}
                                      count={justifsCountsMap[d.id] ?? 0}
                                    />
                                  )}
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setPrintMutuelle(d)}>
                                      <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimer
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        navigate({
                                          to: "/dashboard/mutuelles/$id",
                                          params: { id: d.id },
                                        })
                                      }
                                    >
                                      <FileText className="mr-1.5 h-3.5 w-3.5" /> Ouvrir
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                      <div className="hidden rounded-xl border border-border bg-card md:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>N° demande</TableHead>
                              <TableHead>Organisme</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Nb commandes</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right">Remb.</TableHead>
                              <TableHead>Statut</TableHead>
                              <TableHead>Livraison</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dm.map((d) => {
                              const nbCmds = d.demande_mutuelle_commandes?.length ?? 0;
                              const total = (d.demande_mutuelle_commandes ?? []).reduce(
                                (sum, c) => sum + (c.commandes?.montant ?? 0),
                                0,
                              );
                              return (
                                <TableRow key={d.id}>
                                  <TableCell className="font-mono text-xs">{d.numero_demande}</TableCell>
                                  <TableCell className="text-sm">{d.organisme ?? "—"}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {d.source_correction}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm">{nbCmds}</TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {total.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {d.total_remboursement != null
                                      ? Number(d.total_remboursement).toFixed(2)
                                      : d.prix_monture != null || d.prix_verre != null
                                        ? (Number(d.prix_monture ?? 0) + Number(d.prix_verre ?? 0)).toFixed(2)
                                        : "—"}
                                  </TableCell>
                                  <TableCell>
                                    {d.statut === "remplie" ? (
                                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25">
                                        Remplie
                                      </Badge>
                                    ) : d.statut === "livree" ? (
                                      <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25">
                                        Livrée
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25">
                                        En attente
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <MutuelleLivraisonToggle
                                      id={d.id}
                                      livree={!!d.livree}
                                      canEdit={canWrite}
                                      statut={d.statut}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {(justifsCountsMap[d.id] ?? 0) > 0 && (
                                        <MutuelleJustifsLightboxButton
                                          demandeId={d.id}
                                          count={justifsCountsMap[d.id] ?? 0}
                                        />
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setPrintMutuelle(d)}
                                      >
                                        <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimer
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          navigate({
                                            to: "/dashboard/mutuelles/$id",
                                            params: { id: d.id },
                                          })
                                        }
                                      >
                                        <FileText className="mr-1.5 h-3.5 w-3.5" /> Ouvrir
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <DetteVersementDialog
        dette={payingDette}
        onOpenChange={(o) => !o && setPayingDette(null)}
      />

      <MutuellePrintAuto
        open={!!printMutuelle}
        onOpenChange={(o) => { if (!o) setPrintMutuelle(null); }}
        numeroDemande={printMutuelle?.numero_demande ?? ""}
        clientOrigineNom={c?.nom_complet ?? null}
        clientOrigineDateNaissance={c?.date_naissance ?? null}
        beneficiaireNom={(printMutuelle as any)?.beneficiaire_nom ?? null}
        beneficiaireDateNaissance={(printMutuelle as any)?.beneficiaire_date_naissance ?? null}
        beneficiaireOrganisme={(printMutuelle as any)?.beneficiaire_organisme ?? null}
        organisme={printMutuelle?.organisme ?? null}
        source={(printMutuelle?.source_correction ?? "interne") as "interne" | "externe" | "mixte"}
        statut={(printMutuelle?.statut ?? "en_attente") as "en_attente" | "remplie" | "livree"}
        createdAt={printMutuelle?.created_at ?? new Date().toISOString()}
        dette={dette}
        commandes={(printMutuelle?.demande_mutuelle_commandes ?? []).map((l) => ({
          numero_commande: l.commandes?.numero_commande ?? null,
          type: l.commandes?.type ?? "",
          monture_source: l.commandes?.monture_source ?? null,
          montant: Number(l.commandes?.montant ?? 0),
        }))}
        total={(printMutuelle?.demande_mutuelle_commandes ?? []).reduce(
          (a, l) => a + Number(l.commandes?.montant ?? 0),
          0,
        )}
      />


      {/* Edit prescription dialog */}
      <Dialog
        open={!!editingPrescription}
        onOpenChange={(o) => !o && setEditingPrescription(null)}
      >
        {editingPrescription && (
          <PrescriptionFormDialog
            title="Modifier la correction"
            submitLabel="Enregistrer"
            initial={editingPrescription}
            withAnnexes
            prescriptionId={editingPrescription.id}
            canDeleteAnnexes
            submitting={updatePrescMut.isPending}
            onSubmit={({ annexes, ...v }) =>
              updatePrescMut.mutateAsync({
                ...v,
                annexes,
                id: editingPrescription.id,
                client_id: editingPrescription.client_id,
              })
            }
          />
        )}
      </Dialog>
    </DashboardShell>
  );
}

function PrescriptionCard({
  p,
  canWrite,
  onEdit,
  onCreateOrder,
  creatingOrder,
  clientName,
}: {
  p: Prescription;
  canWrite: boolean;
  onEdit: () => void;
  onCreateOrder: () => void;
  creatingOrder: boolean;
  clientName: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copyText = () => {
    const text = buildCorrectionClipboard({
      clientName: clientName ?? null,
      showOD: true,
      showOG: true,
      od: {
        sphere: p.od_sphere,
        cylinder: p.od_cylinder,
        axe: p.od_axe,
        addition: p.od_addition,
      },
      og: {
        sphere: p.og_sphere,
        cylinder: p.og_cylinder,
        axe: p.og_axe,
        addition: p.og_addition,
      },
    });
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Impossible de copier"),
    );
  };
  return (
    <Card id={`prescription-${p.id}`} className="scroll-mt-24">

      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              Correction du{" "}
              {new Date(p.date_prescription).toLocaleDateString("fr-FR")}
            </h3>
            <p className="text-sm text-muted-foreground">
              Prescription {p.type === "interne" ? "interne" : "externe"}
              {p.type === "interne" && p.correction_par
                ? ` — par ${p.correction_par}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyText}>
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Copié ✓
                </>
              ) : (
                <>
                  <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Copier correction
                </>
              )}
            </Button>
            <Badge variant={p.type === "interne" ? "default" : "secondary"}>
              {p.type}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <EyeBlock label="OD (œil droit)" eye="od" p={p} />
          <EyeBlock label="OG (œil gauche)" eye="og" p={p} />
        </div>

        {p.note && p.note.trim().length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Note
            </p>
            <p className="whitespace-pre-wrap text-foreground">{p.note}</p>
          </div>
        )}


        <CorrectionAnnexesList
          prescriptionId={p.id}
          canDelete={canWrite}
          mode="client"
        />

        {canWrite && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="print:hidden"
              onClick={() =>
                printCorrection({
                  clientName: clientName ?? null,
                  showOD: true,
                  showOG: true,
                  od: {
                    sphere: p.od_sphere,
                    cylinder: p.od_cylinder,
                    axe: p.od_axe,
                    addition: p.od_addition,
                  },
                  og: {
                    sphere: p.og_sphere,
                    cylinder: p.og_cylinder,
                    axe: p.og_axe,
                    addition: p.og_addition,
                  },
                })
              }
            >
              <Printer className="mr-2 h-3.5 w-3.5" /> Imprimer correction
            </Button>
            <Button size="sm" onClick={onCreateOrder} disabled={creatingOrder}>
              <ShoppingCart className="mr-2 h-3.5 w-3.5" /> Créer commande
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EyeBlock({
  label,
  eye,
  p,
}: {
  label: string;
  eye: "od" | "og";
  p: Prescription;
}) {
  const sph = p[`${eye}_sphere` as const];
  const cyl = p[`${eye}_cylinder` as const];
  const axe = p[`${eye}_axe` as const];
  const add = p[`${eye}_addition` as const];
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">Sphère</span>
        <span className="text-right font-medium">{sph}</span>
        <span className="text-muted-foreground">Cylindre</span>
        <span className="text-right font-medium">{cyl}</span>
        <span className="text-muted-foreground">Axe</span>
        <span className="text-right font-medium">{axe}°</span>
        <span className="text-muted-foreground">Addition</span>
        <span className="text-right font-medium">{add}</span>
      </div>
    </div>
  );
}

function ClientEditDialog({
  initial,
  submitting,
  onSubmit,
}: {
  initial: Client;
  submitting: boolean;
  onSubmit: (v: {
    nom_complet: string;
    civilite: string | null;
    nom: string | null;
    prenom: string | null;
    date_naissance: string;
    email: string;
    telephone: string;
    adresse: string;
    cin: string | null;
    mutuelle: string | null;
    mutuelle_autre: string | null;
    whatsapp: string | null;
  }) => Promise<unknown>;
}) {
  const seed = splitNomComplet(initial.nom_complet ?? "");
  const [civilite, setCivilite] = useState<string>(
    (initial.civilite as string | null | undefined) ?? seed.civilite ?? "",
  );
  const [prenom, setPrenom] = useState((initial.prenom as string | null | undefined) ?? seed.prenom ?? "");
  const [nomFam, setNomFam] = useState((initial.nom as string | null | undefined) ?? seed.nom ?? "");
  const [date, setDate] = useState(initial.date_naissance);
  const [email, setEmail] = useState(initial.email);
  const [tel, setTel] = useState(initial.telephone);
  const [adresse, setAdresse] = useState(initial.adresse);
  const [extras, setExtras] = useState<ClientExtraValues>(() =>
    extrasFromClient({
      cin: initial.cin ?? null,
      mutuelle: initial.mutuelle ?? null,
      mutuelle_autre: initial.mutuelle_autre ?? null,
      whatsapp: initial.whatsapp ?? null,
      telephone: initial.telephone,
    }),
  );

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Modifier le client</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const telephone = tel.trim();
          const civ = civilite.trim();
          const pr = prenom.trim();
          const nm = nomFam.trim();
          const nomComplet = composeNomComplet({ civilite: civ, prenom: pr, nom: nm });
          await onSubmit({
            nom_complet: nomComplet,
            civilite: civ || null,
            prenom: pr || null,
            nom: nm || null,
            date_naissance: date,
            email: email.trim(),
            telephone,
            adresse: adresse.trim(),
            ...extrasToPayload(extras, telephone),
          });
        }}
      >
        <div className="grid grid-cols-[120px_1fr_1fr] gap-2">
          <div className="space-y-2">
            <Label htmlFor="ec-civ">Civilité</Label>
            <Select value={civilite || "__none"} onValueChange={(v) => setCivilite(v === "__none" ? "" : v)}>
              <SelectTrigger id="ec-civ">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {CIVILITES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-prenom">Prénom</Label>
            <Input id="ec-prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-nom">Nom</Label>
            <Input id="ec-nom" value={nomFam} onChange={(e) => setNomFam(e.target.value)} required maxLength={100} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ec-dob">Date de naissance</Label>
          <Input id="ec-dob" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ec-email">Email</Label>
          <Input id="ec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ec-tel">Téléphone</Label>
          <Input id="ec-tel" value={tel} onChange={(e) => setTel(e.target.value)} required />
        </div>
        <WhatsappToggleField value={extras} onChange={setExtras} idPrefix="ec" />
        <div className="space-y-2">
          <Label htmlFor="ec-adr">Adresse</Label>
          <Input id="ec-adr" value={adresse} onChange={(e) => setAdresse(e.target.value)} required />
        </div>
        <ClientExtraFields value={extras} onChange={setExtras} idPrefix="ec" />
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

type PrescFormValues = {
  type: "interne" | "externe";
  date_prescription: string;
  correction_par: string | null;
  od_sphere: number;
  od_cylinder: number;
  od_axe: number;
  od_addition: number;
  og_sphere: number;
  og_cylinder: number;
  og_axe: number;
  og_addition: number;
  note: string | null;
  annexes: File[];
};

function PrescriptionFormDialog({
  title,
  submitLabel,
  initial,
  submitting,
  withAnnexes = true,
  prescriptionId,
  canDeleteAnnexes = false,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: Partial<Prescription>;
  submitting: boolean;
  withAnnexes?: boolean;
  prescriptionId?: string;
  canDeleteAnnexes?: boolean;
  onSubmit: (v: PrescFormValues) => Promise<unknown>;
}) {
  const [type, setType] = useState<"interne" | "externe">(
    (initial?.type as "interne" | "externe") ?? "interne",
  );
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initial?.date_prescription ?? today);
  const [correctionPar, setCorrectionPar] = useState(
    initial?.correction_par ?? "",
  );
  const [vals, setVals] = useState({
    od_sphere: initial?.od_sphere ?? 0,
    od_cylinder: initial?.od_cylinder ?? 0,
    od_axe: initial?.od_axe ?? 0,
    od_addition: initial?.od_addition ?? 0,
    og_sphere: initial?.og_sphere ?? 0,
    og_cylinder: initial?.og_cylinder ?? 0,
    og_axe: initial?.og_axe ?? 0,
    og_addition: initial?.og_addition ?? 0,
  });
  const [annexes, setAnnexes] = useState<File[]>([]);
  const [note, setNote] = useState<string>(initial?.note ?? "");

  const num = (k: keyof typeof vals, v: string) =>
    setVals((s) => ({ ...s, [k]: v === "" ? 0 : Number(v) }));

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({
            type,
            date_prescription: date,
            correction_par:
              type === "interne" ? correctionPar.trim() || null : null,
            ...vals,
            note: note.trim() ? note.trim() : null,
            annexes,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "interne" | "externe")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interne">Interne</SelectItem>
                <SelectItem value="externe">Externe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-date">Date</Label>
            <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        {type === "interne" && (
          <div className="space-y-2">
            <Label htmlFor="p-cor-par">Correction effectuée par</Label>
            <Input
              id="p-cor-par"
              value={correctionPar}
              onChange={(e) => setCorrectionPar(e.target.value)}
              placeholder="Nom de la personne"
              maxLength={150}
            />
          </div>
        )}

        {(["od", "og"] as const).map((eye) => (
          <div key={eye} className="rounded-lg border border-border p-3">
            <div className="mb-2 text-sm font-medium">
              {eye === "od" ? "Œil droit (OD)" : "Œil gauche (OG)"}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["sphere", "cylinder", "axe", "addition"] as const).map((f) => {
                const key = `${eye}_${f}` as keyof typeof vals;
                const isAxe = f === "axe";
                const axeValue = vals[key];
                const axeInvalid =
                  isAxe && (axeValue < 0 || axeValue > 180 || !Number.isInteger(axeValue));
                return (
                  <div key={f} className="space-y-1">
                    <Label className="text-xs capitalize">{f}</Label>
                    <Input
                      type="number"
                      step={isAxe ? "1" : "0.25"}
                      min={isAxe ? 0 : undefined}
                      max={isAxe ? 180 : undefined}
                      value={vals[key]}
                      onChange={(e) => num(key, e.target.value)}
                      required
                      aria-invalid={axeInvalid || undefined}
                      className={axeInvalid ? "border-destructive focus-visible:ring-destructive" : undefined}
                    />
                    {axeInvalid && (
                      <p className="text-xs font-medium text-destructive">
                        L'axe doit être compris entre 0 et 180°
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <Label htmlFor="p-note">Note</Label>
          <Textarea
            id="p-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observations, remarques..."
            maxLength={2000}
            rows={3}
          />
        </div>


        {withAnnexes && (
          <div className="space-y-3">
            {prescriptionId && (
              <CorrectionAnnexesList
                prescriptionId={prescriptionId}
                canDelete={canDeleteAnnexes}
                mode="client"
              />
            )}
            <CorrectionAnnexesUploader value={annexes} onChange={setAnnexes} />
          </div>
        )}

        <DialogFooter>
          <Button
            type="submit"
            disabled={
              submitting ||
              vals.od_axe < 0 ||
              vals.od_axe > 180 ||
              vals.og_axe < 0 ||
              vals.og_axe > 180 ||
              !Number.isInteger(vals.od_axe) ||
              !Number.isInteger(vals.og_axe)
            }
          >
            {submitting ? "Enregistrement…" : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}