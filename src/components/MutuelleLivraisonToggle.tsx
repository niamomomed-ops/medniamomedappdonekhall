import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageCheck, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { setMutuelleLivraison } from "@/lib/mutuelles.functions";

type Props = {
  id: string;
  livree: boolean;
  canEdit: boolean;
  size?: "sm" | "default";
  /** Display only the badge, no toggle button. */
  badgeOnly?: boolean;
  /** Si fourni, le bouton n'est affiché que lorsque la demande est prête (statut === 'remplie' ou 'livree'). */
  statut?: "en_attente" | "remplie" | "livree";
};

export function MutuelleLivraisonBadge({ livree }: { livree: boolean }) {
  return livree ? (
    <Badge className="bg-blue-600 text-white hover:bg-blue-600">Livrée</Badge>
  ) : (
    <Badge variant="secondary">Pas encore livrée</Badge>
  );
}

export function MutuelleLivraisonToggle({
  id,
  livree,
  canEdit,
  size = "sm",
  badgeOnly = false,
  statut,
}: Props) {
  const qc = useQueryClient();
  const doSet = useServerFn(setMutuelleLivraison);
  const [open, setOpen] = useState(false);

  const mut = useMutation({
    mutationFn: () => doSet({ data: { id, livree: !livree } }),
    onSuccess: () => {
      toast.success(livree ? "Demande remise en « Pas encore livrée »" : "Demande marquée comme livrée");
      qc.invalidateQueries({ queryKey: ["mutuelles-list"] });
      qc.invalidateQueries({ queryKey: ["mutuelle"] });
      qc.invalidateQueries({ queryKey: ["mutuelles-client"] });
      qc.invalidateQueries({ queryKey: ["commande-mutuelle"] });
      setOpen(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setOpen(false);
    },
  });

  if (badgeOnly || !canEdit) {
    return <MutuelleLivraisonBadge livree={livree} />;
  }

  // Le bouton de livraison n'a de sens que si la demande est prête (remplie ou déjà livrée).
  if (statut !== undefined && statut === "en_attente") {
    return null;
  }


  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          livree
            ? "border-blue-600/40 text-blue-700 hover:bg-blue-600/10"
            : "border-border"
        }
      >
        {livree ? (
          <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Package className="mr-1.5 h-3.5 w-3.5" />
        )}
        {livree ? "Marquer non livrée" : "Marquer livrée"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {livree
                ? "Remettre en « Pas encore livrée » ?"
                : "Marquer la mutuelle comme livrée ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {livree
                ? "Le statut de livraison de cette demande mutuelle sera remis à « Pas encore livrée »."
                : "La demande mutuelle sera marquée comme livrée au client (cette action sera tracée dans l'historique)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mut.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={mut.isPending}
              onClick={(e) => {
                e.preventDefault();
                mut.mutate();
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
