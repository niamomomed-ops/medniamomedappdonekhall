import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, ROLE_HOME, type AppRole } from "@/lib/auth";

export function RoleGuard({
  allow,
  children,
}: {
  allow: AppRole | AppRole[];
  children: ReactNode;
}) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = useMemo(() => (Array.isArray(allow) ? allow : [allow]), [allow]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role && !allowed.includes(role)) {
      navigate({ to: ROLE_HOME[role] });
    }
  }, [user, role, loading, navigate, allowed]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-semibold">Aucun rôle attribué</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre compte n'a pas encore de rôle. Contactez un administrateur.
          </p>
        </div>
      </div>
    );
  }

  if (!allowed.includes(role)) return null;

  return <>{children}</>;
}
