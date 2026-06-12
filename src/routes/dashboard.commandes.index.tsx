import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ShoppingCart, AlertCircle, AlertTriangle, RefreshCw, MessageCircle, Search, X, Phone, Eye, Trash2, Undo2 } from "lucide-react";
import { pickupTelHref, pickupWhatsappNumber } from "@/lib/whatsapp-pickup";
import { CommanderFournisseurDialog } from "@/components/CommanderFournisseurDialog";
import { PickupWhatsappDialog } from "@/components/PickupWhatsappDialog";
import { ReclamationWhatsappDialog } from "@/components/ReclamationWhatsappDialog";
import { reclamationSummary } from "@/lib/whatsapp-reclamation";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/lib/auth";
import { listCommandes, isCaisseOpen, deleteCommande, restoreCommande } from "@/lib/commandes.functions";
import { STATUS_LABELS, STATUS_COLORS, TYPE_LABELS, CASSE_EYE_LABELS, EYES_ORDERED_SHORT } from "@/lib/commande-labels";
import { CommandeQuickActions } from "@/components/CommandeQuickActions";
import { DeleteCommandeDialog } from "@/components/DeleteCommandeDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CommandeStatus } from "@/lib/commandes.functions";
import { Pagination } from "@/components/ui/AppPagination";
import { usePagination } from "@/hooks/usePagination";
import { DeliveryCalendar } from "@/components/DeliveryCalendar";

export const Route = createFileRoute("/dashboard/commandes/")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente", "agent_montage"]}>
      <CommandesListPage />
    </RoleGuard>
  ),
});

type CommandeRow = {
  id: string;
  numero_commande: string | null;
  status: CommandeStatus;
  type: string;
  montant: number;
  reste: number;
  urgent: boolean;
  eyes_ordered: "both" | "od" | "og" | null;
  created_at: string;
  date_livraison: string | null;
  delivered_at: string | null;
  client_id: string;
  monture_source: string | null;
  monture_marque: string | null;
  monture_client_provided: boolean | null;
  monture_client_called_at: string | null;
  monture_client_received_at: string | null;
  reception_client_called_at: string | null;
  casse_eye: string | null;
  casse_note: string | null;
  casse_at: string | null;
  casse_sent_at?: string | null;
  casse_resolved_at?: string | null;
  clients: {
    nom_complet: string;
    telephone?: string | null;
    whatsapp?: string | null;
    mutuelle?: string | null;
    mutuelle_autre?: string | null;
    cin?: string | null;
    email?: string | null;
  } | null;
  prescriptions: { type: string; date_prescription: string } | null;
  reclamation_detail?: { od?: string | null; og?: string | null } | null;  // ← ajouter
  reclamation_resolved_at?: string | null;  // ← ajouter aussi (déjà utilisé ligne 115)
  reclamation_sent_at?: string | null;
  fournisseurs?: { id: string; nom: string; telephone?: string | null; whatsapp?: string | null } | null;
  caisse_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
  deletion_caisse_id?: string | null;
  status_before_delete?: string | null;
};

type FilterKey =
  | "problemes"
  | "today"
  | "late"
  | "en_cours"
  | "commande_creee"
  | "all"
  | "livree"
  | "a_traiter"
  | "en_montage"
  | "finalise"
  | "supprimees";

type SortKey =
  | "livraison_asc"
  | "livraison_desc"
  | "creation_asc"
  | "creation_desc"
  | "numero_desc"
  | "status"
  | "client";

const FILTER_STORAGE_KEY = "commandes-filter-v2";
const SORT_STORAGE_KEY = "commandes-sort-v2";
const SEARCH_STORAGE_KEY = "commandes-search-v1";
const CHIPS_STORAGE_KEY = "commandes-active-chips-v1";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const todayISO = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
};

const isReclamationActive = (c: CommandeRow) =>
  Boolean(c.reclamation_detail && !c.reclamation_resolved_at);

const isCasseActive = (c: { casse_eye?: string | null; casse_at?: string | null; casse_resolved_at?: string | null }) =>
  Boolean(c.casse_eye && c.casse_at && !c.casse_resolved_at);

const A_TRAITER_STATUSES = [
  "verre_commande",
  "reception_partielle",
  "verre_recu",
  "en_montage",
  "casse_montage",
];

function matchesFilter(
  c: CommandeRow,
  filter: FilterKey,
  today: string,
  isMontage = false,
): boolean {
  if (filter === "supprimees") return Boolean(c.deleted_at);
  // For "commande_creee" include deleted orders whose original status was commande_creee
  if (filter === "commande_creee") {
    if (c.deleted_at) return (c.status_before_delete ?? c.status) === "commande_creee";
    return c.status === "commande_creee";
  }
  // Exclude deleted from all other filters
  if (c.deleted_at) return false;
  switch (filter) {
    case "all":
      return true;
    case "problemes":
      return isReclamationActive(c) || isCasseActive(c);
    case "today":
      if (isMontage) {
        return (
          A_TRAITER_STATUSES.includes(c.status as string) &&
          c.date_livraison === today
        );
      }
      return c.status !== "livree" && c.date_livraison === today;
    case "late":
      return Boolean(
        c.date_livraison && c.date_livraison < today && c.status !== "livree",
      );
    case "en_cours":
      // Toutes les commandes non livrées
      return c.status !== "livree";
    case "livree":
      return c.status === "livree";
    case "a_traiter":
      return A_TRAITER_STATUSES.includes(c.status as string);
    case "en_montage":
      return c.status === "en_montage";
    case "finalise":
      // Agent montage : "Finalisées" = finalise + livree
      return c.status === "finalise" || c.status === "livree";
  }
  return false;
}

type Tone = "red" | "orange" | "amber" | "blue" | "gray" | "emerald";
type FilterCard = { key: FilterKey; label: string; tone: Tone };

const SALES_CARDS: FilterCard[] = [
  { key: "problemes", label: "Problèmes", tone: "red" },
  { key: "today", label: "À livrer aujourd'hui", tone: "orange" },
  { key: "late", label: "En retard", tone: "amber" },
  { key: "commande_creee", label: "Commande créée", tone: "blue" },
  { key: "en_cours", label: "En cours", tone: "blue" },
  { key: "all", label: "Toutes", tone: "gray" },
  { key: "livree", label: "Livrées", tone: "emerald" },
  { key: "supprimees", label: "Supprimées", tone: "gray" },
];

const MONTAGE_CARDS: FilterCard[] = [
  { key: "problemes", label: "Problèmes", tone: "red" },
  { key: "a_traiter", label: "À traiter", tone: "orange" },
  { key: "today", label: "À livrer aujourd'hui", tone: "amber" },
  { key: "finalise", label: "Finalisées", tone: "emerald" },
];

type VisionFilterDef = { id: string; label: string };

const VISION_FILTERS: VisionFilterDef[] = [
  { id: "all", label: "Tous" },
  { id: "vision_loin", label: "VL" },
  { id: "vision_pres", label: "VP" },
  { id: "double_foyer", label: "Double Foyer" },
  { id: "progressif", label: "Progressif" },
  { id: "lentilles", label: "Lentilles" },
];

type ChipDef = { id: string; label: string; match: (c: CommandeRow) => boolean };

const CHIP_VERRE_COMMANDE: ChipDef = {
  id: "verre_commande",
  label: "Verre commandé",
  match: (c) => c.status === "verre_commande",
};
const CHIP_VERRE_RECU: ChipDef = {
  id: "verre_recu",
  label: "Verre reçu",
  match: (c) => c.status === "verre_recu",
};
const CHIP_EN_MONTAGE: ChipDef = {
  id: "en_montage",
  label: "En montage",
  match: (c) => c.status === "en_montage",
};
const CHIP_RECLAMATION: ChipDef = {
  id: "reclamation",
  label: "Réclamation",
  match: (c) => isReclamationActive(c),
};
const CHIP_CASSE: ChipDef = {
  id: "casse_montage",
  label: "Casse montage",
  match: (c) => isCasseActive(c),
};
const CHIP_RECEPTION_PARTIELLE: ChipDef = {
  id: "reception_partielle",
  label: "Réception partielle",
  match: (c) => (c.status as string) === "reception_partielle",
};
const CHIP_FINALISE: ChipDef = {
  id: "finalise",
  label: "Finalisé",
  match: (c) => c.status === "finalise",
};
const CHIP_EN_RECEPTION: ChipDef = {
  id: "en_reception",
  label: "En réception",
  match: (c) => (c.status as string) === "en_reception",
};

const STATUS_CHIP_COLOR: Record<string, string> = {
  verre_commande: "bg-blue-500 text-white border-blue-500",
  reception_partielle: "bg-violet-500 text-white border-violet-500",
  reclamation: "bg-orange-500 text-white border-orange-500",
  verre_recu: "bg-cyan-500 text-white border-cyan-500",
  en_montage: "bg-indigo-500 text-white border-indigo-500",
  finalise: "bg-green-500 text-white border-green-500",
  en_reception: "bg-teal-500 text-white border-teal-500",
  casse_montage: "bg-red-500 text-white border-red-500",
  livree: "bg-gray-500 text-white border-gray-500",
};

function chipsForCard(card: FilterKey, isMontage: boolean): ChipDef[] {
  if (card === "problemes") return [CHIP_RECLAMATION, CHIP_CASSE];
  if (card === "en_cours") {
    return [
      CHIP_VERRE_COMMANDE,
      CHIP_RECEPTION_PARTIELLE,
      CHIP_RECLAMATION,
      CHIP_VERRE_RECU,
      CHIP_EN_MONTAGE,
      CHIP_FINALISE,
      CHIP_EN_RECEPTION,
      CHIP_CASSE,
    ];
  }
  if (card === "today" || card === "late") {
    if (isMontage) {
      return [
        CHIP_VERRE_COMMANDE,
        CHIP_RECEPTION_PARTIELLE,
        CHIP_RECLAMATION,
        CHIP_VERRE_RECU,
        CHIP_EN_MONTAGE,
        CHIP_CASSE,
      ];
    }
    return [
      CHIP_VERRE_COMMANDE,
      CHIP_VERRE_RECU,
      CHIP_EN_MONTAGE,
      CHIP_FINALISE,
      CHIP_EN_RECEPTION,
    ];
  }
  if (card === "a_traiter") {
    return [
      CHIP_VERRE_COMMANDE,
      CHIP_RECEPTION_PARTIELLE,
      CHIP_RECLAMATION,
      CHIP_VERRE_RECU,
      CHIP_EN_MONTAGE,
      CHIP_CASSE,
    ];
  }
  if (card === "en_montage") return [CHIP_EN_MONTAGE];
  return [];
}

const CARDS_WITH_TOGGLES = new Set<FilterKey>(["livree", "finalise"]);
const CARDS_DATE_BY_CREATED = new Set<FilterKey>(["livree", "finalise"]);

const TONE_STYLES: Record<
  Tone,
  { active: string; idle: string; count: string }
> = {
  red: {
    active: "border-red-500 bg-red-500/10",
    idle: "border-border bg-card hover:border-red-500/40 hover:bg-red-500/5",
    count: "text-red-600 dark:text-red-400",
  },
  orange: {
    active: "border-orange-500 bg-orange-500/10",
    idle: "border-border bg-card hover:border-orange-500/40 hover:bg-orange-500/5",
    count: "text-orange-600 dark:text-orange-400",
  },
  amber: {
    active: "border-amber-500 bg-amber-500/10",
    idle: "border-border bg-card hover:border-amber-500/40 hover:bg-amber-500/5",
    count: "text-amber-600 dark:text-amber-400",
  },
  blue: {
    active: "border-blue-500 bg-blue-500/10",
    idle: "border-border bg-card hover:border-blue-500/40 hover:bg-blue-500/5",
    count: "text-blue-600 dark:text-blue-400",
  },
  gray: {
    active: "border-foreground/40 bg-muted",
    idle: "border-border bg-card hover:bg-muted",
    count: "text-foreground",
  },
  emerald: {
    active: "border-emerald-500 bg-emerald-500/10",
    idle: "border-border bg-card hover:border-emerald-500/40 hover:bg-emerald-500/5",
    count: "text-emerald-600 dark:text-emerald-400",
  },
};

function CommandesListPage() {
  const { role } = useAuth();
  const navigate = useNavigate();

  const fetchList = useServerFn(listCommandes);
  const fetchCaisse = useServerFn(isCaisseOpen);
  const doDelete = useServerFn(deleteCommande);
  const doRestore = useServerFn(restoreCommande);
  const qc = useQueryClient();

  const [deleteTarget, setDeleteTarget] = useState<CommandeRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<CommandeRow | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      doDelete({ data: vars }),
    onSuccess: () => {
      toast.success("Commande supprimée");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
      qc.invalidateQueries({ queryKey: ["caisse-open-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => doRestore({ data: { id } }),
    onSuccess: () => {
      toast.success("Commande rétablie");
      qc.invalidateQueries({ queryKey: ["commandes-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["commandes-list"],
    queryFn: () => fetchList(),
  });

  const { data: openCaisse } = useQuery({
    queryKey: ["caisse-open-status"],
    queryFn: () => fetchCaisse(),
  });

  const isMontageOnly = role === "agent_montage";

  // Agent montage ne voit jamais les commandes de lentilles, ni les commandes supprimées.
  const rawList = useMemo(() => {
    const all = (rows as CommandeRow[] | undefined) ?? [];
    return isMontageOnly
      ? all.filter((c) => c.type !== "lentilles" && !c.deleted_at)
      : all;
  }, [rows, isMontageOnly]);

  const cards = isMontageOnly ? MONTAGE_CARDS : SALES_CARDS;
  const defaultFallback: FilterKey = isMontageOnly ? "a_traiter" : "en_cours";

  const [filter, setFilter] = useState<FilterKey>(() => {
    if (typeof window === "undefined") return defaultFallback;
    return (sessionStorage.getItem(FILTER_STORAGE_KEY) as FilterKey) || defaultFallback;
  });
  const [sort, setSort] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "creation_desc";
    return (sessionStorage.getItem(SORT_STORAGE_KEY) as SortKey) || "creation_desc";
  });
  const [search, setSearch] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(SEARCH_STORAGE_KEY) || "";
  });
  const [orderFournisseurId, setOrderFournisseurId] = useState<string | null>(null);
  const [recommanderCasseId, setRecommanderCasseId] = useState<string | null>(null);
  const [pickupWa, setPickupWa] = useState<CommandeRow | null>(null);
  const [reclamWa, setReclamWa] = useState<CommandeRow | null>(null);

  const [activeChips, setActiveChips] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [withCasse, setWithCasse] = useState(false);
  const [withReclam, setWithReclam] = useState(false);
  const [visionFilter, setVisionFilter] = useState<string>("all");

  // Hydrate chips from sessionStorage once (e.g. banner deep-link), then reset on filter change
  const [chipsHydrated, setChipsHydrated] = useState(false);
  useEffect(() => {
    if (chipsHydrated) {
      setActiveChips(new Set());
      setWithCasse(false);
      setWithReclam(false);
      return;
    }
    if (typeof window !== "undefined") {
      const raw = sessionStorage.getItem(CHIPS_STORAGE_KEY);
      if (raw) {
        try {
          const ids = JSON.parse(raw) as string[];
          setActiveChips(new Set(ids));
        } catch {}
        sessionStorage.removeItem(CHIPS_STORAGE_KEY);
      }
    }
    setChipsHydrated(true);
  }, [filter, chipsHydrated]);

  useEffect(() => { sessionStorage.setItem(FILTER_STORAGE_KEY, filter); }, [filter]);
  useEffect(() => { sessionStorage.setItem(SORT_STORAGE_KEY, sort); }, [sort]);
  useEffect(() => { sessionStorage.setItem(SEARCH_STORAGE_KEY, search); }, [search]);

  const today = useMemo(() => todayISO(), []);

  useEffect(() => {
    if (!cards.some((c) => c.key === filter)) setFilter(defaultFallback);
  }, [cards, filter, defaultFallback]);

  const counts = useMemo(() => {
    const map = {} as Record<FilterKey, number>;
    for (const card of cards) map[card.key] = 0;
    for (const c of rawList) {
      for (const card of cards) {
        if (matchesFilter(c, card.key, today, isMontageOnly)) map[card.key]++;
      }
    }
    return map;
  }, [rawList, today, cards]);

  // Compteurs par chip (calculés sur la carte active)
  const chipsForActiveCard = useMemo(
    () => chipsForCard(filter, isMontageOnly),
    [filter, isMontageOnly],
  );
  const chipCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const baseRows = rawList.filter((c) =>
      matchesFilter(c, filter, today, isMontageOnly),
    );
    for (const chip of chipsForActiveCard) {
      map[chip.id] = baseRows.filter((c) => chip.match(c)).length;
    }
    return map;
  }, [rawList, filter, today, chipsForActiveCard, isMontageOnly]);

  // Auto-select "Problèmes" on first load (no stored filter) when count > 0
  const [autoSelected, setAutoSelected] = useState(false);
  useEffect(() => {
    if (autoSelected || isLoading) return;
    const stored = typeof window !== "undefined"
      ? sessionStorage.getItem(FILTER_STORAGE_KEY)
      : null;
    if (!stored) {
      if ((counts.problemes ?? 0) > 0) setFilter("problemes");
      else setFilter(defaultFallback);
    }
    setAutoSelected(true);
  }, [autoSelected, isLoading, counts, defaultFallback]);

  const list = useMemo(() => {
    const q = normalize(search.trim());
    const filtered = rawList.filter((c) => {
      if (!matchesFilter(c, filter, today, isMontageOnly)) return false;

      // Filtre par type de vision
      if (visionFilter !== "all" && c.type !== visionFilter) return false;


      // Chips (status)
      const chips = chipsForCard(filter, isMontageOnly);
      if (chips.length > 0 && activeChips.size > 0) {
        const matchAny = chips.some(
          (chip) => activeChips.has(chip.id) && chip.match(c),
        );
        if (!matchAny) return false;
      }

      // Toggles "Avec casse montage" / "Avec réclamation" — disponibles sur toutes les cartes
      if (withCasse && !isCasseActive(c)) return false;
      if (withReclam && !c.reclamation_detail) return false;

      // Date range
      const dateField = CARDS_DATE_BY_CREATED.has(filter)
        ? (c.created_at ?? "").slice(0, 10)
        : c.date_livraison ?? "";
      if (dateFrom && (!dateField || dateField < dateFrom)) return false;
      if (dateTo && (!dateField || dateField > dateTo)) return false;

      // Search
      if (q) {
        const hay = [
          c.numero_commande,
          c.clients?.nom_complet,
          c.clients?.telephone,
          c.clients?.whatsapp,
          c.clients?.cin,
          c.clients?.mutuelle,
          c.clients?.mutuelle_autre,
          c.clients?.email,
        ]
          .filter(Boolean)
          .map((v) => normalize(String(v)))
          .join(" | ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const cmpStr = (a: string, b: string) => a.localeCompare(b, "fr");
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "livraison_asc":
        case "livraison_desc": {
          const aNone = !a.date_livraison;
          const bNone = !b.date_livraison;
          if (aNone && bNone) return 0;
          if (aNone) return 1;
          if (bNone) return -1;
          return sort === "livraison_asc"
            ? cmpStr(a.date_livraison!, b.date_livraison!)
            : cmpStr(b.date_livraison!, a.date_livraison!);
        }
        case "creation_asc":
          return cmpStr(a.created_at, b.created_at);
        case "creation_desc":
          return cmpStr(b.created_at, a.created_at);
        case "numero_desc": {
          const aNum = a.numero_commande ?? "";
          const bNum = b.numero_commande ?? "";
          return cmpStr(bNum, aNum);
        }
        case "status":
          return cmpStr(STATUS_LABELS[a.status] ?? a.status, STATUS_LABELS[b.status] ?? b.status);
        case "client":
          return cmpStr(a.clients?.nom_complet ?? "", b.clients?.nom_complet ?? "");
      }
    });

    // Always float urgent on top (except delivered)
    return sorted.sort((a, b) => Number(b.urgent && b.status !== "livree") - Number(a.urgent && a.status !== "livree"));
  }, [
    rawList,
    filter,
    search,
    sort,
    today,
    isMontageOnly,
    activeChips,
    dateFrom,
    dateTo,
    withCasse,
    withReclam,
    visionFilter,
  ]);

  const { page, setPage, visible, total } = usePagination(list, [
    filter,
    search,
    sort,
    visionFilter,
    activeChips,
    dateFrom,
    dateTo,
    withCasse,
    withReclam,
  ]);

  const canCreate = role === "admin" || role === "agent_vente";
  const hasOpen = Boolean(openCaisse);

  const guardRole =
    role === "agent_vente"
      ? "agent_vente"
      : role === "agent_montage"
      ? "agent_montage"
      : "admin";

  const fmtDate = (s: string | null) => {
    if (!s) return "—";
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <DashboardShell
      role={guardRole}
      title="Commandes"
      subtitle="Liste de toutes les commandes."
      accent={
        guardRole === "admin"
          ? "bg-primary"
          : guardRole === "agent_vente"
          ? "bg-emerald-500"
          : "bg-amber-500"
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {list.length} commande{list.length > 1 ? "s" : ""} affichée{list.length > 1 ? "s" : ""}
        </div>
        {canCreate && (
          <Button
            disabled={!hasOpen}
            title={!hasOpen ? "Impossible de créer une commande sans caisse ouverte" : undefined}
            onClick={() => navigate({ to: "/dashboard/clients" })}
          >
            <Plus className="mr-2 h-4 w-4" /> Créer commande
          </Button>
        )}
      </div>

      {canCreate && !hasOpen && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Impossible de créer une commande sans caisse ouverte.</span>
        </div>
      )}

      {/* Filter cards + search + sort */}
      <div className="mb-4 space-y-3">
        <div
          className={`grid gap-3 ${
            cards.length >= 6
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
              : "grid-cols-2 sm:grid-cols-4"
          }`}
        >
          {cards.map((card) => {
            const active = filter === card.key;
            const count = counts[card.key] ?? 0;
            const tone = TONE_STYLES[card.tone];
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setFilter(card.key)}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all ${
                  active ? tone.active : tone.idle
                }`}
              >
                <span className={`text-3xl font-bold tabular-nums ${tone.count}`}>
                  {count}
                </span>
                <span className="text-xs font-medium text-foreground">
                  {card.label}
                </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-3 w-full">



        {/* Chips contextuels par carte (cartes actives) */}
        {(() => {
          const chips = chipsForActiveCard;
          if (chips.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => {
                const active = activeChips.has(chip.id);
                const count = chipCounts[chip.id] ?? 0;
                const colorActive =
                  STATUS_CHIP_COLOR[chip.id] ?? "bg-primary text-primary-foreground border-primary";
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setActiveChips((prev) => {
                        const next = new Set(prev);
                        if (next.has(chip.id)) next.delete(chip.id);
                        else next.add(chip.id);
                        return next;
                      });
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? colorActive
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {chip.label} ({count})
                  </button>
                );
              })}
              {activeChips.size > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveChips(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Effacer
                </button>
              )}
            </div>
          );
        })()}

        {/* Toggles "Avec casse montage" / "Avec réclamation" — disponibles sur toutes les cartes */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWithCasse((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              withCasse
                ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            Avec casse montage
          </button>
          <button
            type="button"
            onClick={() => setWithReclam((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              withReclam
                ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            Avec réclamation
          </button>
        </div>

        {/* Filtre par type de vision */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Type de vision —</span>
          {VISION_FILTERS.filter(
            (v) => !(isMontageOnly && v.id === "lentilles"),
          ).map((v) => {
            const active = visionFilter === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVisionFilter(v.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>



        {/* Filtre par date (toujours visible) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {CARDS_DATE_BY_CREATED.has(filter) ? "Créées" : "Livraison"} —
          </span>
          <label className="flex items-center gap-1">
            Du
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-[150px]"
            />
          </label>
          <label className="flex items-center gap-1">
            Au
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-[150px]"
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Réinitialiser
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par n° commande, nom, téléphone, CIN, mutuelle…"
              className="pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Effacer la recherche"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="livraison_asc">Livraison — plus tôt d'abord</SelectItem>
              <SelectItem value="livraison_desc">Livraison — plus tard d'abord</SelectItem>
              <SelectItem value="numero_desc">N° Commande — plus récent d'abord</SelectItem>
              <SelectItem value="creation_desc">Création — plus récent</SelectItem>
              <SelectItem value="creation_asc">Création — plus ancien</SelectItem>
              <SelectItem value="status">Statut</SelectItem>
              <SelectItem value="client">Nom client (A→Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        </div>

        {/* Calendrier livraisons — à côté du bloc filtres, sous la carte "Livrées" */}
        <DeliveryCalendar
          items={rawList
            .filter((c) => !c.deleted_at)
            .map((c) => ({
              date_livraison: c.date_livraison,
              status: c.status as string,
            }))}
          onPick={(iso) => {
            setFilter("en_cours");
            setActiveChips(new Set());
            setVisionFilter("all");
            setDateFrom(iso);
            setDateTo(iso);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
      </div>



      {/* Desktop: full table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N° Commande</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>MDC</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Livraison</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="text-right">Reste</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && list.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Aucune commande.
                </TableCell>
              </TableRow>
            )}
            {visible.map((c) => {
              const isLate = Boolean(c.date_livraison && c.date_livraison < today && c.status !== "livree");
              const isToday = c.date_livraison === today && c.status !== "livree";
              const isDeleted = Boolean(c.deleted_at);
              const canRestore =
                isDeleted &&
                canCreate &&
                Boolean(openCaisse) &&
                openCaisse?.id === c.deletion_caisse_id;
              const canDelete =
                !isDeleted &&
                canCreate &&
                c.status === "commande_creee";
              return (
              <TableRow
                key={c.id}
                onClick={() => navigate({ to: "/dashboard/commandes/$id", params: { id: c.id } })}
                className={`cursor-pointer hover:bg-muted/50 ${
                  isDeleted
                    ? "bg-red-500/10 border-l-4 border-l-red-500"
                    : c.urgent && c.status !== "livree"
                    ? "bg-red-500/5 border-l-4 border-l-red-500"
                    : ""
                }`}
              >
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-2">
                    {c.urgent && c.status !== "livree" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <AlertTriangle className="h-3 w-3" />
                        Urgent
                      </span>
                    )}
                    {c.numero_commande ?? "—"}
                    {isDeleted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <Trash2 className="h-3 w-3" />
                        Supprimée
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    {c.clients?.nom_complet ?? "—"}
                    {c.clients?.mutuelle && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {c.clients.mutuelle === "Autre"
                          ? c.clients.mutuelle_autre || "Autre"
                          : c.clients.mutuelle}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    const mdc =
                      c.prescriptions?.type === "externe"
                        ? "OUI"
                        : c.prescriptions?.type === "interne"
                          ? "NON"
                          : "";
                    if (!mdc) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span
                        className={
                          mdc === "OUI"
                            ? "font-medium text-red-600"
                            : "font-medium text-emerald-600"
                        }
                      >
                        {mdc}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span>{TYPE_LABELS[c.type] ?? c.type}</span>
                    <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {c.eyes_ordered ? EYES_ORDERED_SHORT[c.eyes_ordered] ?? c.eyes_ordered : "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span
                      className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status]}`}
                    >
                      {STATUS_LABELS[c.status]}
                    </span>
                    {isCasseActive(c) && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          <AlertTriangle className="h-3 w-3" />
                          Casse {CASSE_EYE_LABELS[c.casse_eye!] ?? c.casse_eye}
                        </span>
                      )}
                    {isReclamationActive(c) && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <AlertTriangle className="h-3 w-3" />
                        {reclamationSummary(c.reclamation_detail as any)}
                      </span>
                    )}
                    {c.monture_source === "donnee" &&
                      c.monture_client_provided !== true &&
                      !c.monture_client_received_at &&
                      ["verre_recu", "en_montage"].includes(c.status) && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          {c.monture_client_called_at
                            ? "✅ Client appelé — monture attendue"
                            : "⚠️ Monture client — appel requis"}
                        </span>
                      )}
                    {c.status === "en_reception" && (
                      <span
                        className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          c.reception_client_called_at
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {c.reception_client_called_at
                          ? "✅ Client appelé — en attente"
                          : "⚠️ Client à appeler — prête"}
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="text-xs">
                  {c.status === "livree" && c.delivered_at ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      Livrée le {fmtDate(c.delivered_at.slice(0, 10))}
                    </span>
                  ) : c.date_livraison ? (
                    <span
                      className={
                        isLate
                          ? "inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 font-semibold text-red-700 dark:text-red-300"
                          : isToday
                          ? "inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300"
                          : "text-muted-foreground"
                      }
                    >
                      {fmtDate(c.date_livraison)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {Number(c.montant).toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(c.reste).toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {c.status === "commande_creee" && !isDeleted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                        title="Commander au fournisseur (WhatsApp)"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOrderFournisseurId(c.id);
                        }}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {isCasseActive(c) && canCreate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        title="Recommander le verre cassé (WhatsApp)"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecommanderCasseId(c.id);
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {isReclamationActive(c) && canCreate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-500/10"
                        title="Envoyer la réclamation (WhatsApp)"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReclamWa(c);
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {c.status === "en_reception" && (() => {
                      const tel = pickupTelHref(c.clients?.telephone ?? null);
                      const waNumber = pickupWhatsappNumber(
                        c.clients?.telephone ?? null,
                        c.clients?.whatsapp ?? null,
                      );
                      return (
                        <>
                          {tel && (
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="text-primary hover:bg-primary/10"
                              title="Appeler le client"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a href={tel}>
                                <Phone className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {waNumber && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                              title="Envoyer sur WhatsApp"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPickupWa(c);
                              }}
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      );
                    })()}
                    {!isDeleted && <CommandeQuickActions commande={c} />}
                    {canRestore && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-amber-700 border-amber-500/40 hover:bg-amber-500/10"
                        title="Rétablir la commande"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRestoreTarget(c);
                        }}
                        disabled={restoreMutation.isPending}
                      >
                        <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Rétablir
                      </Button>
                    )}
                    {!isDeleted && canCreate && c.status === "livree" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!hasOpen}
                        title={!hasOpen ? "Impossible de créer une commande sans caisse ouverte" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({
                            to: "/dashboard/commandes/new",
                            search: { reorder_from: c.id },
                          });
                        }}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Commander à nouveau
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Voir la commande"
                      onClick={() =>
                        navigate({
                          to: "/dashboard/commandes/$id",
                          params: { id: c.id },
                        })
                      }
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Supprimer la commande"
                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(c);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet: stacked cards */}
      <div className="space-y-3 lg:hidden">
        {isLoading && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Chargement…
          </div>
        )}
        {!isLoading && list.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucune commande.
          </div>
        )}
        {visible.map((c) => {
          const isLate = Boolean(c.date_livraison && c.date_livraison < today && c.status !== "livree");
          const isToday = c.date_livraison === today && c.status !== "livree";
          const isDeleted = Boolean(c.deleted_at);
          const canRestore =
            isDeleted &&
            canCreate &&
            Boolean(openCaisse) &&
            openCaisse?.id === c.deletion_caisse_id;
          const canDelete =
            !isDeleted && canCreate && c.status === "commande_creee";
          const mdc =
            c.prescriptions?.type === "externe"
              ? "OUI"
              : c.prescriptions?.type === "interne"
                ? "NON"
                : null;
          return (
            <div
              key={c.id}
              className={`rounded-xl border bg-card p-4 ${
                isDeleted
                  ? "border-l-4 border-l-red-500 bg-red-500/10"
                  : c.urgent && c.status !== "livree"
                  ? "border-l-4 border-l-red-500 border-red-500/20"
                  : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.urgent && c.status !== "livree" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <AlertTriangle className="h-3 w-3" />
                        Urgent
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.numero_commande ?? "—"}
                    </span>
                    {isDeleted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <Trash2 className="h-3 w-3" />
                        Supprimée
                      </span>
                    )}
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[c.status]}`}
                    >
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-foreground">
                    {c.clients?.nom_complet ?? "—"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{TYPE_LABELS[c.type] ?? c.type}</span>
                    <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold">
                      {c.eyes_ordered ? EYES_ORDERED_SHORT[c.eyes_ordered] ?? c.eyes_ordered : "—"}
                    </span>
                    {mdc && (
                      <span className={mdc === "OUI" ? "font-medium text-red-600" : "font-medium text-emerald-600"}>
                        MDC : {mdc}
                      </span>
                    )}
                    {c.clients?.mutuelle && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                        {c.clients.mutuelle === "Autre"
                          ? c.clients.mutuelle_autre || "Autre"
                          : c.clients.mutuelle}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Livraison</p>
                  {c.status === "livree" && c.delivered_at ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      {fmtDate(c.delivered_at.slice(0, 10))}
                    </span>
                  ) : c.date_livraison ? (
                    <span
                      className={
                        isLate
                          ? "inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 font-semibold text-red-700 dark:text-red-300"
                          : isToday
                          ? "inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300"
                          : "text-muted-foreground"
                      }
                    >
                      {fmtDate(c.date_livraison)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Montant / Reste</p>
                  <p className="tabular-nums">
                    <span className="font-semibold">{Number(c.montant).toFixed(2)}</span>
                    <span className="text-muted-foreground"> / {Number(c.reste).toFixed(2)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {c.status === "commande_creee" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-emerald-600 hover:bg-emerald-500/10"
                    onClick={(e) => { e.stopPropagation(); setOrderFournisseurId(c.id); }}
                  >
                    <MessageCircle className="mr-1 h-4 w-4" />
                    Commander
                  </Button>
                )}
                {isCasseActive(c) && canCreate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-500/10"
                    onClick={(e) => { e.stopPropagation(); setRecommanderCasseId(c.id); }}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />
                    Recommander
                  </Button>
                )}
                {isReclamationActive(c) && canCreate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-orange-600 hover:bg-orange-500/10"
                    onClick={(e) => { e.stopPropagation(); setReclamWa(c); }}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />
                    Réclamer
                  </Button>
                )}
                {!isDeleted && <CommandeQuickActions commande={c} />}
                {canRestore && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-700 border-amber-500/40 hover:bg-amber-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRestoreTarget(c);
                    }}
                    disabled={restoreMutation.isPending}
                  >
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Rétablir
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  title="Voir"
                  onClick={() =>
                    navigate({ to: "/dashboard/commandes/$id", params: { id: c.id } })
                  }
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Supprimer"
                    className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(c);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Pagination
        currentPage={page}
        totalItems={total}
        pageSize={10}
        onPageChange={setPage}
      />


      <CommanderFournisseurDialog
        commandeId={orderFournisseurId}
        open={orderFournisseurId !== null}
        onOpenChange={(o) => {
          if (!o) setOrderFournisseurId(null);
        }}
      />
      <CommanderFournisseurDialog
        commandeId={recommanderCasseId}
        open={recommanderCasseId !== null}
        onOpenChange={(o) => {
          if (!o) setRecommanderCasseId(null);
        }}
        casseMode
      />
      <PickupWhatsappDialog
        open={pickupWa !== null}
        onOpenChange={(o) => { if (!o) setPickupWa(null); }}
        clientName={pickupWa?.clients?.nom_complet ?? null}
        telephone={pickupWa?.clients?.telephone ?? null}
        whatsapp={pickupWa?.clients?.whatsapp ?? null}
        type={pickupWa?.type ?? null}
      />
      <ReclamationWhatsappDialog
        open={reclamWa !== null}
        onOpenChange={(o) => { if (!o) setReclamWa(null); }}
        commande={reclamWa}
      />

      <DeleteCommandeDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        numeroCommande={deleteTarget?.numero_commande ?? null}
        avance={Number((deleteTarget as any)?.avance ?? 0)}
        sameCaisse={
          Boolean(openCaisse) &&
          deleteTarget?.caisse_id === openCaisse?.id
        }
        isPending={deleteMutation.isPending}
        onConfirm={(reason) => {
          if (!deleteTarget) return;
          deleteMutation.mutate({ id: deleteTarget.id, reason });
        }}
      />

      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(o) => { if (!o) setRestoreTarget(null); }}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Rétablir la commande</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget?.numero_commande
                ? `${restoreTarget.numero_commande} — `
                : ""}
              La commande sera rétablie à son dernier statut
              {restoreTarget?.status_before_delete
                ? ` « ${STATUS_LABELS[restoreTarget.status_before_delete as CommandeStatus] ?? restoreTarget.status_before_delete} »`
                : ""}
              . Cette action sera enregistrée dans l'historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!restoreTarget) return;
                restoreMutation.mutate(restoreTarget.id, {
                  onSuccess: () => setRestoreTarget(null),
                });
              }}
            >
              {restoreMutation.isPending ? "Rétablissement…" : "Rétablir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardShell>
  );
}
