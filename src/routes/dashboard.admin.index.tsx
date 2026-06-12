import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users, Wallet, ArrowLeftRight, Contact, Truck, ShoppingCart, Coins, BarChart3 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashboardRoleHeader } from "@/components/DashboardRoleHeader";

export const Route = createFileRoute("/dashboard/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const navigate = useNavigate();
  const cards = [
    {
      icon: Users,
      label: "Personnel",
      value: "Gérer",
      desc: "Ajouter, modifier, suspendre",
      to: "/dashboard/admin/personnel" as const,
    },
    {
      icon: Wallet,
      label: "Caisses",
      value: "Gérer",
      desc: "Ouvrir, fermer, configurer",
      to: "/dashboard/caisses" as const,
    },
    {
      icon: ArrowLeftRight,
      label: "Transactions",
      value: "Gérer",
      desc: "Entrées et sorties",
      to: "/dashboard/transactions" as const,
    },
    {
      icon: Contact,
      label: "Clients",
      value: "Gérer",
      desc: "Fiches clients",
      to: "/dashboard/clients" as const,
    },
    {
      icon: Truck,
      label: "Fournisseurs",
      value: "Gérer",
      desc: "Liste des fournisseurs",
      to: "/dashboard/fournisseurs" as const,
    },
    {
      icon: ShoppingCart,
      label: "Commandes",
      value: "Gérer",
      desc: "Liste & statuts",
      to: "/dashboard/commandes" as const,
    },
    {
      icon: Coins,
      label: "Dettes",
      value: "Suivre",
      desc: "Versements & reste dû",
      to: "/dashboard/dettes" as const,
    },
    {
      icon: BarChart3,
      label: "Stats agents montage",
      value: "Analyser",
      desc: "Activité de tous les agents",
      to: "/dashboard/mes-stats" as const,
    },
  ];

  return (
    <DashboardShell
      role="admin"
      title="Tableau de bord Administrateur"
      subtitle="Vous avez accès à toutes les fonctionnalités. Les modules seront ajoutés progressivement."
      accent="bg-primary"
    >
      <DashboardRoleHeader role="admin" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ icon: Icon, label, value, desc, to }) => {
          const clickable = Boolean(to);
          return (
            <button
              key={label}
              type="button"
              disabled={!clickable}
              onClick={() => to && navigate({ to })}
              className={`h-full rounded-xl border border-border bg-card p-5 text-left transition-colors ${
                clickable ? "cursor-pointer hover:border-primary/40" : "cursor-default"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="mt-4 text-2xl font-semibold text-card-foreground">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
            </button>
          );
        })}
      </div>
    </DashboardShell>
  );
}