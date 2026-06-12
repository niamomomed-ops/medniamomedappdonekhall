import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Eye, Wallet } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  listAllClientsDebt,
  type ClientDebtRow,
} from "@/lib/dettes.functions";
import {
  DetteVersementDialog,
  type DetteTarget,
} from "@/components/DetteVersementDialog";

export const Route = createFileRoute("/dashboard/dettes")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <DettesPage />
    </RoleGuard>
  ),
});

function DettesPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const fetchAll = useServerFn(listAllClientsDebt);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["clients-debts"],
    queryFn: () => fetchAll(),
  });

  const [search, setSearch] = useState("");
  const [payingFor, setPayingFor] = useState<DetteTarget | null>(null);

  const list = (rows as ClientDebtRow[] | undefined) ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((d) =>
      q.length === 0 ? true : d.client_nom.toLowerCase().includes(q),
    );
  }, [list, search]);

  const totalGlobal = useMemo(
    () => list.reduce((s, d) => s + d.dette, 0),
    [list],
  );

  const guardRole = role === "agent_vente" ? "agent_vente" : "admin";

  return (
    <DashboardShell
      role={guardRole}
      title="Dettes clients"
      subtitle="Dette globale par client = somme des restes des commandes livrées – versements."
      accent={guardRole === "admin" ? "bg-primary" : "bg-emerald-500"}
    >
      <div className="mb-4">
        <BackButton fallback={role ? ROLE_HOME[role] : "/dashboard/admin"} />
      </div>

      <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center">
        <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-300">
          Total dettes clients
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-red-600 dark:text-red-400">
          {totalGlobal.toFixed(2)}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1 space-y-1">
          <Label className="text-xs">Recherche client</Label>
          <Input
            placeholder="Nom du client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Total restes livrés</TableHead>
              <TableHead className="text-right">Total versé</TableHead>
              <TableHead className="text-right">Dette</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Aucune dette client.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((d) => (
              <TableRow key={d.client_id}>
                <TableCell className="font-medium">{d.client_nom}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.total_restes_livrees.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.total_versements.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {d.dette.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      onClick={() =>
                        setPayingFor({
                          client_id: d.client_id,
                          client_nom: d.client_nom,
                          dette: d.dette,
                        })
                      }
                    >
                      <Wallet className="mr-1.5 h-3.5 w-3.5" />
                      Versement
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate({
                          to: "/dashboard/clients/$id",
                          params: { id: d.client_id },
                        })
                      }
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      Fiche client
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DetteVersementDialog
        dette={payingFor}
        onOpenChange={(o) => !o && setPayingFor(null)}
      />
    </DashboardShell>
  );
}
