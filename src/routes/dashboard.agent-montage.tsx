import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Wrench, Calendar, ShoppingCart, CheckCircle2 } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { DashboardRoleHeader } from "@/components/DashboardRoleHeader";

export const Route = createFileRoute("/dashboard/agent-montage")({
  component: () => (
    <RoleGuard allow="agent_montage">
      <MontageDashboard />
    </RoleGuard>
  ),
});

function MontageDashboard() {
  const navigate = useNavigate();
  const cards = [
    {
      icon: ShoppingCart,
      label: "Commandes",
      value: "Voir",
      desc: "Montage des verres",
      to: "/dashboard/commandes" as const,
    },
    { icon: Calendar, label: "Planning", value: "—", desc: "Cette semaine" },
    { icon: Wrench, label: "Interventions", value: "—", desc: "En cours" },
    { icon: CheckCircle2, label: "Terminées", value: "—", desc: "Ce mois" },
  ];
  return (
    <DashboardShell
      role="agent_montage"
      title="Tableau de bord Montage"
      subtitle="Gérez vos interventions et votre planning d'assemblage."
      accent="bg-amber-500"
    >
      <DashboardRoleHeader role="agent_montage" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ icon: Icon, label, value, desc, to }: any) => {
          const clickable = Boolean(to);
          return (
            <button
              key={label}
              type="button"
              disabled={!clickable}
              onClick={() => to && navigate({ to })}
              className={`h-full rounded-xl border border-border bg-card p-5 text-left transition-colors ${
                clickable ? "cursor-pointer hover:border-amber-500/40" : "cursor-default"
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
          Les fonctionnalités de montage seront ajoutées prochainement.
        </p>
      </div>
    </DashboardShell>
  );
}
