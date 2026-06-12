import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, UserPlus, Search, X } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
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
import {
  ClientExtraFields,
  emptyExtras,
  extrasFromClient,
  extrasToPayload,
  WhatsappToggleField,
  type ClientExtraValues,
} from "@/components/ClientExtraFields";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import {
  listClients,
  createClient,
  updateClient,
  deleteClient,
  listClientsLastCommande,
} from "@/lib/clients.functions";
import { listClientDebtsMap } from "@/lib/dettes.functions";
import { Pagination } from "@/components/ui/AppPagination";
import { usePagination } from "@/hooks/usePagination";
import { isBirthdayToday } from "@/lib/birthday";
import { FeliciterButton } from "@/components/FeliciterButton";
import { CIVILITES, composeNomComplet, splitNomComplet } from "@/lib/client-name";

export const Route = createFileRoute("/dashboard/clients/")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <ClientsPage />
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
  cin?: string | null;
  mutuelle?: string | null;
  mutuelle_autre?: string | null;
  created_at: string;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type SortKey = "recent" | "name_asc" | "name_desc" | "dette_desc";

const normalizePhone = (s: string) => s.replace(/[^\d]/g, "");
const normalizeCin = (s: string) => s.trim().toUpperCase();

type FormValues = {
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
};

function ClientsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchList = useServerFn(listClients);
  const doCreate = useServerFn(createClient);
  const doUpdate = useServerFn(updateClient);
  const doDelete = useServerFn(deleteClient);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchList(),
  });

  const fetchDettesGlobal = useServerFn(listClientDebtsMap);
  const { data: dettesMap } = useQuery({
    queryKey: ["clients-dettes-global"],
    queryFn: () => fetchDettesGlobal(),
  });
  const dettes = (dettesMap as Record<string, number> | undefined) ?? {};

  const fetchLastCmd = useServerFn(listClientsLastCommande);
  const { data: lastCmdMap } = useQuery({
    queryKey: ["clients-last-commande"],
    queryFn: () => fetchLastCmd(),
  });
  const lastCmds = (lastCmdMap as Record<string, string> | undefined) ?? {};

  const [search, setSearch] = useState("");
  const [mutuelleFilter, setMutuelleFilter] = useState<string>("all");
  const [debtOnly, setDebtOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [birthdayOnly, setBirthdayOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");

  const urlSearch = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  useEffect(() => {
    if ((urlSearch as { filtre?: string })?.filtre === "anniversaire") {
      setBirthdayOnly(true);
    }
  }, [urlSearch]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["clients"] });

  const createMut = useMutation({
    mutationFn: (input: FormValues) => doCreate({ data: input }),
    onSuccess: () => {
      toast.success("Client ajouté");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: FormValues & { id: string }) => doUpdate({ data: input }),
    onSuccess: () => {
      toast.success("Client mis à jour");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Client supprimé");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);

  const backTo = role ? ROLE_HOME[role] : "/dashboard/admin";
  const guardRole = role === "agent_vente" ? "agent_vente" : "admin";

  const allClients = (data as Client[] | undefined) ?? [];

  const mutuelleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of allClients) {
      const m = c.mutuelle === "Autre" ? c.mutuelle_autre || "Autre" : c.mutuelle;
      if (m) set.add(m);
    }
    return Array.from(set).sort();
  }, [allClients]);

  const now = Date.now();
  const ONE_YEAR = 365 * 24 * 3600 * 1000;

  const filtered = useMemo(() => {
    const q = normalize(search);
    let rows = allClients.filter((c) => {
      if (q) {
        const hay = [
          c.nom_complet,
          c.telephone,
          c.cin ?? "",
          c.mutuelle === "Autre" ? c.mutuelle_autre ?? "" : c.mutuelle ?? "",
          c.email,
        ]
          .map(normalize)
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      if (mutuelleFilter !== "all") {
        const m = c.mutuelle === "Autre" ? c.mutuelle_autre || "Autre" : c.mutuelle;
        if (m !== mutuelleFilter) return false;
      }
      if (debtOnly && !((dettes[c.id] ?? 0) > 0)) return false;
      if (activeOnly) {
        const last = lastCmds[c.id];
        if (!last || now - new Date(last).getTime() > ONE_YEAR) return false;
      }
      if (birthdayOnly && !isBirthdayToday(c.date_naissance)) return false;
      return true;
    });
    const cmpStr = (a: string, b: string) =>
      a.localeCompare(b, "fr", { sensitivity: "base" });
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "name_asc":
          return cmpStr(a.nom_complet, b.nom_complet);
        case "name_desc":
          return cmpStr(b.nom_complet, a.nom_complet);
        case "dette_desc":
          return (dettes[b.id] ?? 0) - (dettes[a.id] ?? 0);
        case "recent":
        default: {
          const la = lastCmds[a.id] ?? a.created_at;
          const lb = lastCmds[b.id] ?? b.created_at;
          return lb.localeCompare(la);
        }
      }
    });
    return rows;
  }, [allClients, search, mutuelleFilter, debtOnly, activeOnly, birthdayOnly, sort, dettes, lastCmds, now]);

  const birthdayCount = useMemo(
    () => allClients.filter((c) => isBirthdayToday(c.date_naissance)).length,
    [allClients],
  );

  const { page, setPage, visible, total } = usePagination(filtered, [
    search,
    mutuelleFilter,
    debtOnly,
    activeOnly,
    birthdayOnly,
    sort,
  ]);

  return (
    <DashboardShell
      role={guardRole}
      title="Clients"
      subtitle="Gérez la liste des clients de l'entreprise."
      accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
    >
      <div className="mb-4 flex items-center justify-between">
        <Link
          to={backTo}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            navigate({ to: backTo });
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Link>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> Ajouter un client
            </Button>
          </DialogTrigger>
          <ClientFormDialog
            title="Nouveau client"
            submitLabel="Créer"
            submitting={createMut.isPending}
            existing={(data as Client[] | undefined) ?? []}
            onSubmit={async (v) => {
              await createMut.mutateAsync(v);
              setAddOpen(false);
            }}
          />
        </Dialog>
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone, CIN, mutuelle, email…"
            className="pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Effacer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMutuelleFilter("all")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              mutuelleFilter === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            Toutes mutuelles
          </button>
          {mutuelleOptions.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMutuelleFilter(m)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                mutuelleFilter === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {m}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setDebtOnly((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              debtOnly
                ? "border-red-500 bg-red-500 text-white"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            Avec dette en cours
          </button>
          <button
            type="button"
            onClick={() => setActiveOnly((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              activeOnly
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            Clients actifs (12 mois)
          </button>
          {role !== "agent_montage" && birthdayCount > 0 && (
            <button
              type="button"
              onClick={() => setBirthdayOnly((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                birthdayOnly
                  ? "border-pink-500 bg-pink-500 text-white"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              🎂 Anniversaire ({birthdayCount})
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Tri :</span>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-8 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Dernière commande (récent)</SelectItem>
                <SelectItem value="name_asc">Nom A → Z</SelectItem>
                <SelectItem value="name_desc">Nom Z → A</SelectItem>
                <SelectItem value="dette_desc">Dette décroissante</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} client{filtered.length > 1 ? "s" : ""}
          {filtered.length !== allClients.length ? ` sur ${allClients.length}` : ""}
        </p>
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom complet</TableHead>
              <TableHead>Date de naissance</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Aucun client.
                </TableCell>
              </TableRow>
            )}
            {visible.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({ to: "/dashboard/clients/$id", params: { id: c.id } })
                }
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {c.nom_complet}
                    {c.mutuelle && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {c.mutuelle === "Autre" ? c.mutuelle_autre || "Autre" : c.mutuelle}
                      </span>
                    )}
                    {(dettes[c.id] ?? 0) > 0 && (
                      <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                        Dette {dettes[c.id].toFixed(2)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(c.date_naissance).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.email}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.telephone}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.adresse}</TableCell>
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end gap-2">
                    {role !== "agent_montage" && isBirthdayToday(c.date_naissance) && (
                      <FeliciterButton
                        clientId={c.id}
                        nomComplet={c.nom_complet}
                        telephone={c.telephone}
                        whatsapp={(c as Client & { whatsapp?: string | null }).whatsapp ?? null}
                      />
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleting(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 lg:hidden">
        {isLoading && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Chargement…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun client.
          </div>
        )}
        {visible.map((c) => (
          <div
            key={c.id}
            className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30"
            onClick={() =>
              navigate({ to: "/dashboard/clients/$id", params: { id: c.id } })
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{c.nom_complet}</p>
              {c.mutuelle && (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {c.mutuelle === "Autre" ? c.mutuelle_autre || "Autre" : c.mutuelle}
                </span>
              )}
              {(dettes[c.id] ?? 0) > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                  Dette {dettes[c.id].toFixed(2)}
                </span>
              )}
            </div>
            <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              <p>📞 {c.telephone || "—"}</p>
              <p className="truncate">✉️ {c.email || "—"}</p>
              <p className="truncate">📍 {c.adresse || "—"}</p>
              <p>🎂 {new Date(c.date_naissance).toLocaleDateString("fr-FR")}</p>
            </div>
            <div
              className="mt-3 flex flex-wrap items-center justify-end gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {role !== "agent_montage" && isBirthdayToday(c.date_naissance) && (
                <FeliciterButton
                  clientId={c.id}
                  nomComplet={c.nom_complet}
                  telephone={c.telephone}
                  whatsapp={(c as Client & { whatsapp?: string | null }).whatsapp ?? null}
                />
              )}
              <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Modifier
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeleting(c)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Supprimer
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={page}
        totalItems={total}
        pageSize={10}
        onPageChange={setPage}
      />


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <ClientFormDialog
            title="Modifier le client"
            submitLabel="Enregistrer"
            initial={editing}
            existing={(data as Client[] | undefined) ?? []}
            currentId={editing.id}
            submitting={updateMut.isPending}
            onSubmit={async (v) => {
              await updateMut.mutateAsync({ id: editing.id, ...v });
              setEditing(null);
            }}
          />
        )}
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o: boolean) => !o && setDeleting(null)}
        title="Supprimer ce client ?"
        description={`Cette action est irréversible. ${deleting?.nom_complet ?? ""} sera retiré de la base.`}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteMut.mutateAsync(deleting.id);
          setDeleting(null);
        }}
      />
    </DashboardShell>
  );
}

function ClientFormDialog({
  title,
  submitLabel,
  initial,
  existing,
  currentId,
  submitting,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: Partial<FormValues>;
  existing: Client[];
  currentId?: string;
  submitting: boolean;
  onSubmit: (v: FormValues) => Promise<void>;
}) {
  const navigate = useNavigate();
  const seed = splitNomComplet(initial?.nom_complet ?? "");
  const [civilite, setCivilite] = useState<string>(
    (initial?.civilite as string | undefined) ?? seed.civilite ?? "",
  );
  const [prenom, setPrenom] = useState((initial?.prenom as string | undefined) ?? seed.prenom ?? "");
  const [nomFam, setNomFam] = useState((initial?.nom as string | undefined) ?? seed.nom ?? "");
  const [date, setDate] = useState(initial?.date_naissance ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [tel, setTel] = useState(initial?.telephone ?? "");
  const [adresse, setAdresse] = useState(initial?.adresse ?? "");
  const [extras, setExtras] = useState<ClientExtraValues>(() =>
    initial
      ? extrasFromClient({
          cin: initial.cin ?? null,
          mutuelle: initial.mutuelle ?? null,
          mutuelle_autre: initial.mutuelle_autre ?? null,
          whatsapp: initial.whatsapp ?? null,
          telephone: initial.telephone ?? "",
        })
      : emptyExtras(),
  );

  const telNorm = normalizePhone(tel);
  const phoneDup = telNorm.length >= 4
    ? existing.find(
        (c) => c.id !== currentId && normalizePhone(c.telephone ?? "") === telNorm,
      )
    : null;

  const cinValue = extras.cin?.trim() ?? "";
  const cinNorm = normalizeCin(cinValue);
  const cinDup = cinNorm.length >= 3
    ? existing.find(
        (c) => c.id !== currentId && normalizeCin(c.cin ?? "") === cinNorm,
      )
    : null;

  const goTo = (id: string) => navigate({ to: "/dashboard/clients/$id", params: { id } });

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (phoneDup || cinDup) return;
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
            <Label htmlFor="cl-civ">Civilité</Label>
            <Select value={civilite || "__none"} onValueChange={(v) => setCivilite(v === "__none" ? "" : v)}>
              <SelectTrigger id="cl-civ">
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
            <Label htmlFor="cl-prenom">Prénom</Label>
            <Input id="cl-prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cl-nom">Nom</Label>
            <Input id="cl-nom" value={nomFam} onChange={(e) => setNomFam(e.target.value)} required maxLength={100} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cl-dob">Date de naissance</Label>
          <Input id="cl-dob" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cl-email">Email</Label>
          <Input id="cl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cl-tel">Téléphone</Label>
          <Input
            id="cl-tel"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            required
            maxLength={50}
            aria-invalid={Boolean(phoneDup)}
            className={phoneDup ? "border-destructive focus-visible:ring-destructive" : undefined}
          />
          {phoneDup && (
            <p className="text-xs text-destructive">
              Un client avec ce numéro de téléphone existe déjà ({phoneDup.nom_complet}).{" "}
              <button
                type="button"
                onClick={() => goTo(phoneDup.id)}
                className="underline font-medium hover:no-underline"
              >
                Voir le client existant
              </button>
            </p>
          )}
        </div>
        <WhatsappToggleField value={extras} onChange={setExtras} idPrefix="cl" />
        <div className="space-y-2">
          <Label htmlFor="cl-adr">Adresse</Label>
          <Input id="cl-adr" value={adresse} onChange={(e) => setAdresse(e.target.value)} required maxLength={500} />
        </div>
        <ClientExtraFields value={extras} onChange={setExtras} idPrefix="cl" />
        {cinDup && (
          <p className="text-xs text-destructive">
            Un client avec ce CIN existe déjà ({cinDup.nom_complet}).{" "}
            <button
              type="button"
              onClick={() => goTo(cinDup.id)}
              className="underline font-medium hover:no-underline"
            >
              Voir le client existant
            </button>
          </p>
        )}
        <DialogFooter>
          <Button type="submit" disabled={submitting || Boolean(phoneDup) || Boolean(cinDup)}>
            {submitting ? "Enregistrement…" : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
