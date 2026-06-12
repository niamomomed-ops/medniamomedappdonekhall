import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText, Lock, Plus } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { CloseCaisseButton } from "@/components/CloseCaisseButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { listCaisses, openNewCaisse, runAutoCloseSweep } from "@/lib/caisses.functions";
import { ConfirmCodeField } from "@/components/ConfirmCodeField";
import { Pagination } from "@/components/ui/AppPagination";
import { usePagination } from "@/hooks/usePagination";

export const Route = createFileRoute("/dashboard/caisses/")({
  component: () => (
    <RoleGuard allow={["admin", "agent_vente"]}>
      <CaissesPage />
    </RoleGuard>
  ),
});

type Caisse = {
  id: string;
  opening_balance: number | null;
  closing_balance: number | null;
  status: "open" | "closed";
  opened_at: string | null;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  auto_close_at: string | null;
  auto_closed: boolean | null;
  created_at: string;
  summary?: {
    opening_balance: number;
    encaissements: number;
    charges: number;
    expected_balance: number;
  };
};

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CaissesPage() {
  const { role, session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchList = useServerFn(listCaisses);
  const doOpen = useServerFn(openNewCaisse);
  const sweep = useServerFn(runAutoCloseSweep);

  const { data, isLoading } = useQuery({
    queryKey: ["caisses"],
    queryFn: () => fetchList(),
    enabled: !loading && !!session,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["caisses"] });

  // On mount: sweep due auto-closes, then notify on caisses we haven't acknowledged yet.
  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;
    (async () => {
      try {
        const closed = await sweep();
        if (cancelled) return;
        if (closed.length > 0) refresh();
        const lastSeen = Number(localStorage.getItem("autoCloseSeenAt") ?? 0);
        let maxSeen = lastSeen;
        for (const c of closed) {
          const t = new Date(c.closed_at).getTime();
          if (t > lastSeen) {
            const d = new Date(c.closed_at);
            toast.warning(
              `⚠️ La caisse du ${d.toLocaleDateString("fr-FR")} a été fermée automatiquement à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Pensez à vérifier le journal de caisse.`,
              { duration: 10000 },
            );
          }
          if (t > maxSeen) maxSeen = t;
        }
        if (maxSeen > lastSeen) {
          localStorage.setItem("autoCloseSeenAt", String(maxSeen));
        }
      } catch {
        /* ignore sweep failure */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  const openMut = useMutation({
    mutationFn: (input: { opening_balance: number; auto_close_at: string | null }) =>
      doOpen({ data: input }),
    onSuccess: () => {
      toast.success("Caisse ouverte");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);

  const backTo = role ? ROLE_HOME[role] : "/dashboard/admin";
  const guardRole = role === "agent_vente" ? "agent_vente" : "admin";
  const hasOpen = (data as Caisse[] | undefined)?.some((c) => c.status === "open") ?? false;
  const authReady = !loading && !!session;
  const caisses = (data as Caisse[] | undefined) ?? [];
  const { page, setPage, visible, total } = usePagination(caisses, []);

  return (
    <DashboardShell
      role={guardRole}
      title="Gestion des caisses"
      subtitle="Ouvrez, fermez et consultez les caisses du magasin."
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
            <Button
              disabled={!authReady || hasOpen}
              title={hasOpen ? "Une caisse est déjà ouverte" : undefined}
            >
              <Plus className="mr-2 h-4 w-4" /> Ouvrir une caisse
            </Button>
          </DialogTrigger>
          <OpenDialog
            submitting={openMut.isPending || !authReady}
            onSubmit={async (input) => {
              if (!authReady) {
                toast.error("Session en cours de chargement");
                return;
              }
              await openMut.mutateAsync(input);
              setAddOpen(false);
            }}
          />
        </Dialog>
      </div>

      {hasOpen && (
        <p className="mb-4 text-xs text-muted-foreground">
          Une seule caisse peut être ouverte à la fois.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Solde démarrage</TableHead>
              <TableHead className="text-right">Encaissé</TableHead>
              <TableHead className="text-right">Charges</TableHead>
              <TableHead className="text-right">Solde attendu</TableHead>
              <TableHead className="text-right">Solde final</TableHead>
              <TableHead className="text-right">Écart</TableHead>
              <TableHead>Ouverte</TableHead>
              <TableHead>Fermée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  Aucune caisse.
                </TableCell>
              </TableRow>
            )}
            {visible.map((c) => {
              const s = c.summary ?? {
                opening_balance: Number(c.opening_balance ?? 0),
                encaissements: 0,
                charges: 0,
                expected_balance: Number(c.opening_balance ?? 0),
              };
              const isClosed = c.status === "closed";
              const finalBal = c.closing_balance != null ? Number(c.closing_balance) : null;
              const ecart = isClosed && finalBal != null ? finalBal - s.expected_balance : null;
              const ecartZero = ecart != null && Math.abs(ecart) < 0.005;

              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.status === "open" ? (
                        <Badge>Ouverte</Badge>
                      ) : (
                        <Badge variant="secondary">Fermée</Badge>
                      )}
                      {c.status === "closed" && c.auto_closed && (
                        <Badge
                          variant="outline"
                          className="border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                        >
                          Fermeture auto
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt(s.opening_balance)}</TableCell>
                  <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                    + {fmt(s.encaissements)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
                    - {fmt(s.charges)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmt(s.expected_balance)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {isClosed && finalBal != null ? fmt(finalBal) : "—"}
                  </TableCell>
                  <TableCell
                    className={
                      ecart == null
                        ? "text-right text-muted-foreground"
                        : ecartZero
                          ? "text-right font-semibold text-emerald-600 dark:text-emerald-400"
                          : "text-right font-bold text-red-600 dark:text-red-400"
                    }
                  >
                    {ecart == null ? "—" : `${ecart >= 0 ? "+" : ""}${fmt(ecart)}`}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {c.opened_at ? new Date(c.opened_at).toLocaleString("fr-FR") : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {c.closed_at ? new Date(c.closed_at).toLocaleString("fr-FR") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/dashboard/caisses/$id" params={{ id: c.id }}>
                          <FileText className="mr-1 h-3.5 w-3.5" /> Journal
                        </Link>
                      </Button>
                      {c.status === "open" && (
                        <CloseCaisseButton
                          summary={{ id: c.id, ...s }}
                          trigger={
                            <Button size="sm" variant="outline" disabled={!authReady}>
                              <Lock className="mr-1 h-3.5 w-3.5" /> Fermer
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Pagination
        currentPage={page}
        totalItems={total}
        pageSize={10}
        onPageChange={setPage}
      />
    </DashboardShell>
  );
}

function OpenDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: { opening_balance: number; auto_close_at: string | null }) => Promise<void>;
  submitting: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [autoClose, setAutoClose] = useState(true);
  const [closeTime, setCloseTime] = useState("23:59");
  const [confirmValid, setConfirmValid] = useState(false);
  const amountNum = Number(amount);
  const amountValid = amount !== "" && Number.isFinite(amountNum) && amountNum >= 0;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Ouvrir une caisse</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(amount);
          if (!Number.isFinite(n) || n < 0) {
            toast.error("Montant invalide");
            return;
          }
          let autoCloseAt: string | null = null;
          if (autoClose) {
            const [hh, mm] = closeTime.split(":").map((s) => Number(s));
            if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
              toast.error("Heure invalide");
              return;
            }
            const d = new Date();
            d.setHours(hh, mm, 0, 0);
            // If the chosen time has already passed today, schedule for tomorrow.
            if (d.getTime() <= Date.now()) {
              d.setDate(d.getDate() + 1);
            }
            autoCloseAt = d.toISOString();
          }
          await onSubmit({ opening_balance: n, auto_close_at: autoCloseAt });
          setAmount("");
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="opening-balance">Solde de démarrage</Label>
          <Input
            id="opening-balance"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
            autoFocus
          />
        </div>
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-close" className="cursor-pointer">
                Activer l'auto-fermeture
              </Label>
              <p className="text-xs text-muted-foreground">
                Filet de sécurité : la caisse se fermera seule à l'heure indiquée.
              </p>
            </div>
            <Switch id="auto-close" checked={autoClose} onCheckedChange={setAutoClose} />
          </div>
          {autoClose && (
            <div className="space-y-2">
              <Label htmlFor="close-time">Heure de fermeture automatique</Label>
              <Input
                id="close-time"
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                required
              />
            </div>
          )}
        </div>
        {amountValid && (
          <ConfirmCodeField amount={amountNum} onValidChange={setConfirmValid} />
        )}
        <DialogFooter>
          <Button type="submit" disabled={submitting || !amountValid || !confirmValid}>
            {submitting ? "Ouverture…" : "Ouvrir la caisse"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}