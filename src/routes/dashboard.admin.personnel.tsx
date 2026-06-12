import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Pencil, Ban, CheckCircle2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type AppRole } from "@/lib/auth";
import {
  listPersonnel,
  createPersonnel,
  updatePersonnel,
  setPersonnelStatus,
} from "@/lib/personnel.functions";

export const Route = createFileRoute("/dashboard/admin/personnel")({
  component: () => (
    <RoleGuard allow="admin">
      <PersonnelPage />
    </RoleGuard>
  ),
});

type Personnel = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  status: "active" | "suspended";
  created_at: string;
};

function PersonnelPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listPersonnel);
  const doCreate = useServerFn(createPersonnel);
  const doUpdate = useServerFn(updatePersonnel);
  const doSetStatus = useServerFn(setPersonnelStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["personnel"],
    queryFn: () => fetchList(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["personnel"] });

  const createMut = useMutation({
    mutationFn: (input: {
      name: string;
      email: string;
      password: string;
      role: AppRole;
    }) => doCreate({ data: input }),
    onSuccess: () => {
      toast.success("Membre ajouté");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; name: string; role: AppRole }) =>
      doUpdate({ data: input }),
    onSuccess: () => {
      toast.success("Membre mis à jour");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (input: { id: string; status: "active" | "suspended" }) =>
      doSetStatus({ data: input }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);

  return (
    <RoleGuard allow="admin">
      <DashboardShell
        role="admin"
        title="Gestion du personnel"
        subtitle="Ajoutez, modifiez ou suspendez les membres de l'équipe."
        accent="bg-primary"
      >
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/dashboard/admin"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" /> Ajouter un membre
              </Button>
            </DialogTrigger>
            <AddDialog
              onSubmit={async (v) => {
                await createMut.mutateAsync(v);
                setAddOpen(false);
              }}
              submitting={createMut.isPending}
            />
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
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
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Aucun membre.
                  </TableCell>
                </TableRow>
              )}
              {(data as Personnel[] | undefined)?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.email}</TableCell>
                  <TableCell>{ROLE_LABELS[p.role]}</TableCell>
                  <TableCell>
                    {p.status === "active" ? (
                      <Badge variant="secondary">Actif</Badge>
                    ) : (
                      <Badge variant="destructive">Suspendu</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {p.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={statusMut.isPending}
                          onClick={() =>
                            statusMut.mutate({ id: p.id, status: "suspended" })
                          }
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" /> Suspendre
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={statusMut.isPending}
                          onClick={() =>
                            statusMut.mutate({ id: p.id, status: "active" })
                          }
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Réactiver
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          {editing && (
            <EditDialog
              person={editing}
              submitting={updateMut.isPending}
              onSubmit={async (v) => {
                await updateMut.mutateAsync({ id: editing.id, ...v });
                setEditing(null);
              }}
            />
          )}
        </Dialog>
      </DashboardShell>
    </RoleGuard>
  );
}

function AddDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (v: {
    name: string;
    email: string;
    password: string;
    role: AppRole;
  }) => Promise<void>;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("agent_vente");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Ajouter un membre</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({ name, email, password, role });
          setName("");
          setEmail("");
          setPassword("");
          setRole("agent_vente");
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="np-name">Nom complet</Label>
          <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="np-email">Email</Label>
          <Input id="np-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="np-password">Mot de passe</Label>
          <Input id="np-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="space-y-2">
          <Label>Rôle</Label>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrateur</SelectItem>
              <SelectItem value="agent_vente">Agent de vente</SelectItem>
              <SelectItem value="agent_montage">Agent de montage</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Création…" : "Créer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditDialog({
  person,
  onSubmit,
  submitting,
}: {
  person: Personnel;
  onSubmit: (v: { name: string; role: AppRole }) => Promise<void>;
  submitting: boolean;
}) {
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState<AppRole>(person.role);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Modifier {person.email}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({ name, role });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="ed-name">Nom complet</Label>
          <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label>Rôle</Label>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrateur</SelectItem>
              <SelectItem value="agent_vente">Agent de vente</SelectItem>
              <SelectItem value="agent_montage">Agent de montage</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
