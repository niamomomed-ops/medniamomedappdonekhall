import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Search } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth, type AppRole } from "@/lib/auth";
import { listClients } from "@/lib/clients.functions";
import { listCommandesForClient } from "@/lib/prescriptions.functions";
import { createDemandeMutuelle } from "@/lib/mutuelles.functions";
import {
  BeneficiaireFormBlock,
  emptyBeneficiaire,
  isBeneficiaireValid,
  resolveBeneficiaireOrganisme,
  type BeneficiaireValues,
} from "@/components/BeneficiaireFormBlock";

const searchSchema = z.object({ client_id: z.string().uuid().optional() });

export const Route = createFileRoute("/dashboard/mutuelles/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <MutuelleNewPage />
    </RoleGuard>
  ),
});

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const TYPE_LABELS: Record<string, string> = {
  vision_loin: "Vision de loin",
  vision_pres: "Vision de près",
  double_foyer: "Double foyer",
  progressif: "Progressif",
  lentilles: "Lentilles",
};

type Client = {
  id: string;
  nom_complet: string;
  mutuelle: string | null;
  mutuelle_autre: string | null;
  telephone?: string | null;
};

type CommandeRow = {
  id: string;
  numero_commande: string | null;
  type: string;
  montant: number;
  created_at: string;
  prescription_id: string | null;
  prescriptions?: { type?: string | null } | null;
};

function organismeOf(c: Client | null): string {
  if (!c?.mutuelle) return "—";
  return c.mutuelle === "Autre" ? c.mutuelle_autre || "Autre" : c.mutuelle;
}

function MutuelleNewPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const shellRole: AppRole = role === "admin" ? "admin" : "agent_vente";

  const fetchClients = useServerFn(listClients);
  const fetchCmds = useServerFn(listCommandesForClient);
  const doCreate = useServerFn(createDemandeMutuelle);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bénéficiaire (étape 3)
  const [benef, setBenef] = useState<BeneficiaireValues>(emptyBeneficiaire());

  const clientsQ = useQuery({
    queryKey: ["clients-all-mutuelle"],
    queryFn: () => fetchClients(),
  });
  const allClients = (clientsQ.data as Client[] | undefined) ?? [];
  const filteredClients = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return allClients.slice(0, 25);
    return allClients
      .filter((c) =>
        [c.nom_complet, c.telephone ?? ""].join(" ").toLowerCase().includes(term),
      )
      .slice(0, 25);
  }, [allClients, query]);

  // Pré-sélection client depuis ?client_id=
  useEffect(() => {
    if (!search.client_id || client) return;
    const found = allClients.find((c) => c.id === search.client_id);
    if (found) {
      setClient(found);
      setSelected(new Set());
      setStep(2);
    }
  }, [search.client_id, allClients, client]);

  const cmdsQ = useQuery({
    queryKey: ["mutuelle-cmds", client?.id],
    queryFn: () => fetchCmds({ data: { client_id: client!.id } }),
    enabled: !!client,
  });
  const cmds = (cmdsQ.data as any[] | undefined) ?? [];

  const cmdDetailsQ = useQuery({
    queryKey: ["mutuelle-cmd-details", client?.id, cmds.map((c: any) => c.id).join(",")],
    queryFn: async () => {
      const ids = cmds.map((c: any) => c.id);
      if (ids.length === 0) return [];
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase
        .from("commandes")
        .select("id, numero_commande, type, montant, created_at, prescription_id, prescriptions(type)")
        .in("id", ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!client && cmds.length > 0,
  });
  const cmdRows = (cmdDetailsQ.data as CommandeRow[] | undefined) ?? [];

  // Chips "Déjà remboursé" : demandes mutuelles existantes par commande
  const existingDemandesQ = useQuery({
    queryKey: ["mutuelle-existing-for-cmds", cmdRows.map((c) => c.id).join(",")],
    queryFn: async () => {
      const ids = cmdRows.map((c) => c.id);
      if (ids.length === 0) return {} as Record<string, Array<{ id: string; numero_demande: string }>>;
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await (supabase as any)
        .from("demande_mutuelle_commandes")
        .select("commande_id, demandes_mutuelles(id, numero_demande)")
        .in("commande_id", ids);
      if (error) throw new Error(error.message);
      const map: Record<string, Array<{ id: string; numero_demande: string }>> = {};
      for (const r of (data ?? []) as any[]) {
        const d = r.demandes_mutuelles;
        if (!d) continue;
        (map[r.commande_id] ||= []).push({ id: d.id, numero_demande: d.numero_demande });
      }
      return map;
    },
    enabled: cmdRows.length > 0,
  });
  const existingMap = existingDemandesQ.data ?? {};

  const selectedRows = cmdRows.filter((c) => selected.has(c.id));
  const total = selectedRows.reduce((acc, c) => acc + Number(c.montant ?? 0), 0);
  const sources = new Set(
    selectedRows.map((c) => (c.prescriptions?.type === "externe" ? "externe" : "interne")),
  );
  const sourceLabel = sources.size === 2 ? "Mixte" : sources.has("externe") ? "Externe (MDC)" : "Interne";

  const beneficiaireValid = isBeneficiaireValid(benef);

  const createMut = useMutation({
    mutationFn: () =>
      doCreate({
        data: {
          client_id: client!.id,
          commande_ids: Array.from(selected),
          beneficiaire: benef.on
            ? {
                nom: benef.nom.trim(),
                date_naissance: benef.date,
                organisme: resolveBeneficiaireOrganisme(benef),
              }
            : null,
        },
      }),
    onSuccess: (res: { id: string; numero_demande: string }) => {
      toast.success(`Demande ${res.numero_demande} créée`);
      navigate({ to: "/dashboard/mutuelles" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardShell
      role={shellRole}
      title="Nouvelle demande mutuelle"
      subtitle="Sélectionnez un client et les commandes concernées."
      accent="bg-primary"
    >
      <button
        type="button"
        onClick={() => navigate({ to: "/dashboard/mutuelles" })}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Retour à la liste
      </button>

      <div className="mb-6 flex items-center gap-2 text-sm">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </span>
            <span className={step === n ? "font-semibold" : "text-muted-foreground"}>
              {n === 1 ? "Client" : n === 2 ? "Commandes" : "Récapitulatif"}
            </span>
            {n < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un client (nom, téléphone)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="divide-y divide-border">
            {clientsQ.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>}
            {!clientsQ.isLoading && filteredClients.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun client.</p>
            )}
            {filteredClients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setClient(c);
                  setSelected(new Set());
                  setStep(2);
                }}
                className="flex w-full items-center justify-between px-2 py-2.5 text-left text-sm hover:bg-muted/40"
              >
                <div>
                  <p className="font-medium">{c.nom_complet}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.telephone ?? "—"} · Mutuelle : {organismeOf(c)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && client && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Client :</span>{" "}
              <span className="font-medium">{client.nom_complet}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Organisme :</span>{" "}
              <span className="font-medium">{organismeOf(client)}</span>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
              Commandes du client
            </div>
            {cmdDetailsQ.isLoading && (
              <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
            )}
            {!cmdDetailsQ.isLoading && cmdRows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune commande pour ce client.
              </p>
            )}
            {cmdRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left">N° Commande</th>
                      <th className="px-3 py-2 text-left">Déjà remboursé ?</th>
                      <th className="px-3 py-2 text-left">Type de vision</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                      <th className="px-3 py-2 text-right">Date</th>
                      <th className="px-3 py-2 text-right">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cmdRows.map((c) => {
                      const checked = selected.has(c.id);
                      const isExterne = c.prescriptions?.type === "externe";
                      const existing = existingMap[c.id] ?? [];
                      const toggle = (v: boolean) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        });
                      };
                      return (
                        <tr
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => toggle(!checked)}
                        >
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={checked} onCheckedChange={(v) => toggle(!!v)} />
                          </td>
                          <td className="px-3 py-2.5 font-medium">{c.numero_commande ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            {existing.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {existing.map((d) => (
                                  <a
                                    key={d.id}
                                    href={`/dashboard/mutuelles/${d.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-200"
                                  >
                                    ⚠ Déjà remboursé — {d.numero_demande}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {TYPE_LABELS[c.type] ?? c.type}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {fmt(Number(c.montant ?? 0))}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString("fr-FR")}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right text-xs font-semibold ${
                              isExterne ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {isExterne ? "Externe" : "Interne"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Changer de client
            </Button>
            <Button disabled={selected.size === 0} onClick={() => setStep(3)}>
              Continuer ({selected.size}) <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && client && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Bloc gauche — Infos client */}
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="grid gap-1.5">
                <Row label="Numéro demande" value="MUT-XXXXX (généré à la création)" />
                <Row label="Client" value={client.nom_complet} />
                <Row label="Organisme" value={organismeOf(client)} />
                <Row label="Source" value={sourceLabel} />
                <Row label="Total commandes" value={`${fmt(total)} DH`} />
              </div>
            </div>

            {/* Bloc droit — Toggle + formulaire bénéficiaire */}
            <div className="rounded-xl border border-border bg-card p-4">
              <BeneficiaireFormBlock values={benef} onChange={setBenef} />
            </div>
          </div>

          {/* Bloc commandes concernées — pleine largeur */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Commandes concernées
            </p>
            <ul className="space-y-1.5">
              {selectedRows.map((c) => {
                const isExterne = c.prescriptions?.type === "externe";
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-md border border-border p-2 text-sm">
                    <span className="w-24 font-medium">{c.numero_commande ?? "—"}</span>
                    <span className="flex-1">{TYPE_LABELS[c.type] ?? c.type}</span>
                    <span className="tabular-nums">{fmt(Number(c.montant ?? 0))} DH</span>
                    <span
                      className={`w-20 text-right text-xs font-semibold ${
                        isExterne ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {isExterne ? "Externe" : "Interne"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Modifier
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !beneficiaireValid}
            >
              <Check className="mr-2 h-4 w-4" />
              Soumettre la demande
            </Button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
