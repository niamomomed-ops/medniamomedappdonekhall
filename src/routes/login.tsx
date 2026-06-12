import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth, ROLE_HOME, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { assignDemoRole } from "@/lib/demo-auth.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const DEMO_ACCOUNTS: { role: AppRole; email: string; label: string }[] = [
  { role: "admin", email: "admin@demo.local", label: "Administrateur" },
  { role: "agent_vente", email: "vente@demo.local", label: "Agent de vente" },
  { role: "agent_montage", email: "montage@demo.local", label: "Agent de montage" },
];

function LoginPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && role) navigate({ to: ROLE_HOME[role] });
  }, [user, role, loading, navigate]);

  const loginAs = async (email: string) => {
    setBusy(email);
    try {
      // Deterministic strong password per demo account (passes HIBP check)
      const password = `Demo!${email}#Lovable2026$Optic`;
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        const retry = await supabase.auth.signInWithPassword({ email, password });
        if (retry.error) throw retry.error;
      }
      await assignDemoRole();
      toast.success("Connecté");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur de connexion démo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary" />
            <span className="font-semibold text-foreground">Workspace</span>
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-card-foreground">Connexion rapide</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisissez un rôle pour entrer dans le tableau de bord.
          </p>

          <div className="mt-6 space-y-3">
            {DEMO_ACCOUNTS.map((acc) => (
              <Button
                key={acc.email}
                type="button"
                className="w-full"
                disabled={busy !== null}
                onClick={() => loginAs(acc.email)}
              >
                {busy === acc.email ? "Connexion…" : `Entrer en tant que ${acc.label}`}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
