import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, Plus } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  listFournisseurs,
  createFournisseur,
  updateFournisseur,
  deleteFournisseur,
} from "@/lib/fournisseurs.functions";
import { Pagination } from "@/components/ui/AppPagination";
import { usePagination } from "@/hooks/usePagination";

export const Route = createFileRoute("/dashboard/fournisseurs")({
  component: () => (
    <RoleGuard allow="admin">
      <FournisseursPage />
    </RoleGuard>
  ),
});

type Fournisseur = {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  whatsapp: string | null;
  adresse: string;
  created_at: string;
};

type FormValues = {
  nom: string;
  email: string;
  telephone: string;
  whatsapp: string;
  adresse: string;
};

const normalizePhone = (s: string) => s.replace(/[^\d]/g, "");
const normalizeNom = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function FournisseursPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchList = useServerFn(listFournisseurs);
  const doCreate = useServerFn(createFournisseur);
  const doUpdate = useServerFn(updateFournisseur);
  const doDelete = useServerFn(deleteFournisseur);

  const { data, isLoading } = useQuery({
    queryKey: ["fournisseurs"],
    queryFn: () => fetchList(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["fournisseurs"] });

  const createMut = useMutation({
    mutationFn: (input: FormValues) => doCreate({ data: input }),
    onSuccess: () => {
      toast.success("Fournisseur ajouté");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: FormValues & { id: string }) => doUpdate({ data: input }),
    onSuccess: () => {
      toast.success("Fournisseur mis à jour");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Fournisseur supprimé");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Fournisseur | null>(null);
  const [deleting, setDeleting] = useState<Fournisseur | null>(null);

  const fournisseurs = (data as Fournisseur[] | undefined) ?? [];
  const { page, setPage, visible, total } = usePagination(fournisseurs, []);

  return (
    <DashboardShell
      role="admin"
      title="Fournisseurs"
      subtitle="Gérez la liste des fournisseurs."
      accent="bg-primary"
    >
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/dashboard/admin"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            navigate({ to: "/dashboard/admin" });
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Link>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Ajouter un fournisseur
            </Button>
          </DialogTrigger>
          <FournisseurFormDialog
            title="Nouveau fournisseur"
            submitLabel="Créer"
            submitting={createMut.isPending}
            existing={(data as Fournisseur[] | undefined) ?? []}
            onShowExisting={(f) => {
              setAddOpen(false);
              setEditing(f);
            }}
            onSubmit={async (v) => {
              await createMut.mutateAsync(v);
              setAddOpen(false);
            }}
          />
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>WhatsApp</TableHead>
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
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Aucun fournisseur.
                </TableCell>
              </TableRow>
            )}
            {(data as Fournisseur[] | undefined) && visible.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.nom}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{f.email}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{f.telephone}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{f.whatsapp ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{f.adresse}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleting(f)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination
        currentPage={page}
        totalItems={total}
        pageSize={10}
        onPageChange={setPage}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <FournisseurFormDialog
            title="Modifier le fournisseur"
            submitLabel="Enregistrer"
            initial={{
              nom: editing.nom,
              email: editing.email,
              telephone: editing.telephone,
              whatsapp: editing.whatsapp ?? "",
              adresse: editing.adresse,
            }}
            existing={(data as Fournisseur[] | undefined) ?? []}
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
        title="Supprimer ce fournisseur ?"
        description={`Cette action est irréversible. ${deleting?.nom ?? ""} sera retiré de la base.`}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteMut.mutateAsync(deleting.id);
          setDeleting(null);
        }}
      />
    </DashboardShell>
  );
}

function FournisseurFormDialog({
  title,
  submitLabel,
  initial,
  existing,
  currentId,
  submitting,
  onShowExisting,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: Partial<FormValues>;
  existing: Fournisseur[];
  currentId?: string;
  submitting: boolean;
  onShowExisting?: (f: Fournisseur) => void;
  onSubmit: (v: FormValues) => Promise<void>;
}) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [tel, setTel] = useState(initial?.telephone ?? "");
  const [wa, setWa] = useState(initial?.whatsapp ?? "");
  const [adresse, setAdresse] = useState(initial?.adresse ?? "");

  const nomNorm = normalizeNom(nom);
  const nomDup = nomNorm.length >= 2
    ? existing.find((f) => f.id !== currentId && normalizeNom(f.nom) === nomNorm)
    : null;

  const telNorm = normalizePhone(tel);
  const phoneDup = telNorm.length >= 4
    ? existing.find(
        (f) => f.id !== currentId && normalizePhone(f.telephone ?? "") === telNorm,
      )
    : null;

  const show = (f: Fournisseur) => {
    if (onShowExisting) onShowExisting(f);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (nomDup || phoneDup) return;
          await onSubmit({
            nom: nom.trim(),
            email: email.trim(),
            telephone: tel.trim(),
            whatsapp: wa.trim(),
            adresse: adresse.trim(),
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="fo-nom">Nom</Label>
          <Input
            id="fo-nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            maxLength={150}
            aria-invalid={Boolean(nomDup)}
            className={nomDup ? "border-destructive focus-visible:ring-destructive" : undefined}
          />
          {nomDup && (
            <p className="text-xs text-destructive">
              Un fournisseur avec ce nom existe déjà.{" "}
              {onShowExisting && (
                <button
                  type="button"
                  onClick={() => show(nomDup)}
                  className="underline font-medium hover:no-underline"
                >
                  Voir le fournisseur existant
                </button>
              )}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-email">Email</Label>
          <Input id="fo-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-tel">Téléphone</Label>
          <Input
            id="fo-tel"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            required
            maxLength={50}
            aria-invalid={Boolean(phoneDup)}
            className={phoneDup ? "border-destructive focus-visible:ring-destructive" : undefined}
          />
          {phoneDup && (
            <p className="text-xs text-destructive">
              Un fournisseur avec ce numéro de téléphone existe déjà ({phoneDup.nom}).{" "}
              {onShowExisting && (
                <button
                  type="button"
                  onClick={() => show(phoneDup)}
                  className="underline font-medium hover:no-underline"
                >
                  Voir le fournisseur existant
                </button>
              )}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-wa">WhatsApp (optionnel)</Label>
          <Input id="fo-wa" value={wa} onChange={(e) => setWa(e.target.value)} maxLength={50} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-adr">Adresse</Label>
          <Input id="fo-adr" value={adresse} onChange={(e) => setAdresse(e.target.value)} required maxLength={500} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting || Boolean(nomDup) || Boolean(phoneDup)}>
            {submitting ? "Enregistrement…" : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}