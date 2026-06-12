import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { getOpenCaisseSummary, openNewCaisse } from "@/lib/caisses.functions";
import { ConfirmCodeField } from "@/components/ConfirmCodeField";

export function OpenCaisseButton() {
  const { role, session, loading } = useAuth();
  const qc = useQueryClient();
  const fetchSummary = useServerFn(getOpenCaisseSummary);
  const doOpen = useServerFn(openNewCaisse);

  const canSee = role === "admin" || role === "agent_vente";
  const authReady = !loading && !!session && canSee;

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["open-caisse-summary"],
    queryFn: () => fetchSummary(),
    enabled: authReady,
    refetchOnWindowFocus: false,
  });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [autoClose, setAutoClose] = useState(false);
  const [closeTime, setCloseTime] = useState("23:59");
  const [confirmValid, setConfirmValid] = useState(false);

  const openMut = useMutation({
    mutationFn: (input: { opening_balance: number; auto_close_at: string | null }) =>
      doOpen({ data: input }),
    onSuccess: () => {
      toast.success("Caisse ouverte");
      qc.invalidateQueries({ queryKey: ["caisses"] });
      qc.invalidateQueries({ queryKey: ["open-caisse-summary"] });
      qc.invalidateQueries({ queryKey: ["caisse-open-status"] });
      setOpen(false);
      setAmount("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!authReady || summaryLoading || summary) return null;

  const amountNum = Number(amount);
  const amountValid = amount !== "" && Number.isFinite(amountNum) && amountNum >= 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
        >
          <Plus className="mr-2 h-4 w-4" />
          Ouvrir la caisse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ouvrir une caisse</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!amountValid) {
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
              if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
              autoCloseAt = d.toISOString();
            }
            await openMut.mutateAsync({
              opening_balance: amountNum,
              auto_close_at: autoCloseAt,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nav-opening-balance">Solde de démarrage</Label>
            <Input
              id="nav-opening-balance"
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
                <Label htmlFor="nav-auto-close" className="cursor-pointer">
                  Activer l'auto-fermeture
                </Label>
                <p className="text-xs text-muted-foreground">
                  Filet de sécurité : la caisse se fermera seule à l'heure indiquée.
                </p>
              </div>
              <Switch
                id="nav-auto-close"
                checked={autoClose}
                onCheckedChange={setAutoClose}
              />
            </div>
            {autoClose && (
              <div className="space-y-2">
                <Label htmlFor="nav-close-time">Heure de fermeture automatique</Label>
                <Input
                  id="nav-close-time"
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
            <Button
              type="submit"
              disabled={openMut.isPending || !amountValid || !confirmValid}
            >
              {openMut.isPending ? "Ouverture…" : "Ouvrir la caisse"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
