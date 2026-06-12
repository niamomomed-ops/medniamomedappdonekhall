import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  MessageCircle,
  PackageCheck,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  markReclamationSent,
  resolveReclamation,
} from "@/lib/commandes.functions";
import {
  buildReclamationMessage,
  hasActiveReclamation,
  reclamationSummary,
  type ReclamationDetail,
} from "@/lib/whatsapp-reclamation";
import { useAuth } from "@/lib/auth";
import { useEntreprise } from "@/hooks/useEntreprise";

type Props = {
  commande: any;
};

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

export function ReclamationBlock({ commande }: Props) {
  const { role } = useAuth();
  const { entreprise } = useEntreprise();
  const qc = useQueryClient();
  const doMarkSent = useServerFn(markReclamationSent);
  const doResolve = useServerFn(resolveReclamation);

  const [waOpen, setWaOpen] = useState(false);
  const [message, setMessage] = useState("");

  if (!hasActiveReclamation(commande)) return null;

  const detail = (commande.reclamation_detail ?? {}) as ReclamationDetail;
  const sent = Boolean(commande.reclamation_sent_at);
  const summary = reclamationSummary(detail);
  const canManage = role === "admin" || role === "agent_vente";
  const canResolve = role === "admin" || role === "agent_montage";

  const fournisseur = commande.fournisseurs ?? null;
  const fournisseurPhone =
    (fournisseur?.whatsapp && String(fournisseur.whatsapp).trim()) ||
    (fournisseur?.telephone && String(fournisseur.telephone).trim()) ||
    "";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["commande", commande.id] });
    qc.invalidateQueries({ queryKey: ["commandes-list"] });
  };

  const markSentMut = useMutation({
    mutationFn: () => doMarkSent({ data: { id: commande.id } }),
    onSuccess: () => {
      toast.success("Réclamation marquée comme envoyée");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: () => doResolve({ data: { id: commande.id } }),
    onSuccess: () => {
      toast.success("Réclamation résolue — Verre totalement reçu");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openWhatsapp = () => {
    setMessage(buildReclamationMessage(commande, detail, entreprise?.nom ?? null));
    setWaOpen(true);
  };

  const sendWhatsapp = () => {
    if (!fournisseurPhone) {
      toast.error("Aucun numéro WhatsApp pour ce fournisseur");
      return;
    }
    const url = `https://wa.me/${normalizePhone(fournisseurPhone)}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setWaOpen(false);
  };

  return (
    <>
      <Card className="border-amber-500/60 bg-amber-500/5">
        <CardContent className="space-y-3 p-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1 space-y-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  Réclamation fournisseur en cours
                </h3>
                <p className="mt-1 text-sm font-semibold">
                  {summary}
                  {sent && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                      <PackageCheck className="h-3 w-3" /> Réclamé
                    </span>
                  )}
                </p>
                {sent && commande.reclamation_sent_at && (
                  <p className="text-xs text-muted-foreground">
                    Réclamation envoyée le{" "}
                    {new Date(commande.reclamation_sent_at).toLocaleString("fr-FR")}
                  </p>
                )}
                {!sent && canManage && (
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    Envoyez la réclamation au fournisseur via WhatsApp puis
                    confirmez l'envoi.
                  </p>
                )}
                {!canManage && !canResolve && (
                  <p className="text-xs text-muted-foreground">
                    En attente du traitement par l'agent de vente.
                  </p>
                )}
                {!canManage && canResolve && sent && (
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    Une fois le verre conforme reçu du fournisseur, confirmez ci-dessous.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      onClick={openWhatsapp}
                      className="bg-orange-600 text-white hover:bg-orange-700"
                    >
                      <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                      {sent ? "Renvoyer sur WhatsApp" : "Envoyer la réclamation (WhatsApp)"}
                      {!sent && (
                        <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-orange-600">
                          !
                        </span>
                      )}
                    </Button>
                    {!sent && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markSentMut.isPending}
                        onClick={() => markSentMut.mutate()}
                      >
                        Marquer comme envoyée
                      </Button>
                    )}
                  </>
                )}
                {canResolve && sent && (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={resolveMut.isPending}
                    onClick={() => resolveMut.mutate()}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Verre totalement reçu
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Réclamation au fournisseur</DialogTitle>
            <DialogDescription>
              {fournisseur?.nom
                ? `Message à envoyer à ${fournisseur.nom} via WhatsApp.`
                : "Aperçu du message à envoyer via WhatsApp."}
            </DialogDescription>
          </DialogHeader>
          {!fournisseur ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Aucun fournisseur associé à cette commande
            </p>
          ) : !fournisseurPhone ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Numéro WhatsApp du fournisseur non renseigné
            </p>
          ) : (
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={14}
              className="font-mono text-sm"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={!fournisseur || !fournisseurPhone || !message.trim()}
              onClick={sendWhatsapp}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Envoyer sur WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
