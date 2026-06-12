import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClientVersement } from "@/lib/dettes.functions";

export type DetteTarget = {
  client_id: string;
  client_nom: string;
  dette: number;
};

export function DetteVersementDialog({
  dette,
  onOpenChange,
  onSuccess,
}: {
  dette: DetteTarget | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const doCreate = useServerFn(createClientVersement);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (dette) {
      setAmount("");
      setNote("");
    }
  }, [dette?.client_id]);

  const mut = useMutation({
    mutationFn: (v: { client_id: string; amount: number; note?: string }) =>
      doCreate({ data: v }),
    onSuccess: () => {
      toast.success("Remboursement enregistré");
      qc.invalidateQueries();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!dette} onOpenChange={onOpenChange}>
      {dette && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un remboursement</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const n = Number(amount);
              if (!Number.isFinite(n) || n <= 0) {
                toast.error("Montant invalide");
                return;
              }
              await mut.mutateAsync({
                client_id: dette.client_id,
                amount: n,
                note: note.trim() || undefined,
              });
            }}
          >
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">{dette.client_nom}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Dette actuelle</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {dette.dette.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Montant</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={dette.dette}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Note (optionnel)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
