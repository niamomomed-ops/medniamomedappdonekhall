import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Store, Wrench, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, ROLE_HOME } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && role) {
      navigate({ to: ROLE_HOME[role] });
    }
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary" />
            <span className="font-semibold text-foreground">Workspace</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Connexion</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Créer un compte</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <span className="inline-block rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Plateforme multi-rôles
          </span>
          <h1 className="mt-6 text-5xl font-bold tracking-tight text-foreground">
            Un espace de travail unique pour chaque équipe
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Trois rôles, trois tableaux de bord. Connectez-vous selon votre fonction pour
            accéder à votre espace dédié.
          </p>
          <div className="mt-8 flex gap-3">
            <Button size="lg" asChild>
              <Link to="/login">
                Se connecter
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/signup">Créer un compte</Link>
            </Button>
          </div>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Administrateur", desc: "Gestion globale, utilisateurs et configuration." },
            { icon: Store, title: "Agent de vente", desc: "Suivi commercial, clients et commandes." },
            { icon: Wrench, title: "Agent de montage", desc: "Tâches d'assemblage et planning d'intervention." },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold text-card-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
