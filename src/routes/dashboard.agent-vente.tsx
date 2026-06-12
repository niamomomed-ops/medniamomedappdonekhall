import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Contact, ShoppingCart, Wallet, ArrowLeftRight, Coins } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { DashboardRoleHeader } from "@/components/DashboardRoleHeader";

export const Route = createFileRoute("/dashboard/agent-vente")({
  component: () => (
    <RoleGuard allow="agent_vente">
      <SalesDashboard />
    </RoleGuard>
  ),
});

function SalesDashboard() {
  const navigate = useNavigate();
  const cards = [
    {
      icon: Contact,
      label: "Clients",
      value: "Gérer",
      desc: "Fiches clients",
      to: "/dashboard/clients" as const,
    },
    {
      icon: ShoppingCart,
      label: "Commandes",
      value: "Gérer",
      desc: "Liste & création",
      to: "/dashboard/commandes" as const,
    },
    {
      icon: Wallet,
      label: "Caisses",
      value: "Gérer",
      desc: "Ouvrir / fermer",
      to: "/dashboard/caisses" as const,
    },
    {
      icon: ArrowLeftRight,
      label: "Transactions",
      value: "Gérer",
      desc: "Entrées / sorties",
      to: "/dashboard/transactions" as const,
    },
    {
      icon: Coins,
      label: "Dettes",
      value: "Suivre",
      desc: "Versements & reste dû",
      to: "/dashboard/dettes" as const,
    },
  ];
  return (
    <DashboardShell
      role="agent_vente"
      title="Tableau de bord Vente"
      subtitle="Suivez vos clients, devis et commandes depuis cet espace."
      accent="bg-emerald-500"
    >
      <DashboardRoleHeader role="agent_vente" />
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
                clickable ? "cursor-pointer hover:border-emerald-500/40" : "cursor-default"
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

      <div className="mt-8 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Les fonctionnalités de vente seront ajoutées prochainement.
        </p>
      </div>
    </DashboardShell>
  );
}
