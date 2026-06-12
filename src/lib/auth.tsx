import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "agent_vente" | "agent_montage";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  agent_vente: "Agent de vente",
  agent_montage: "Agent de montage",
};

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/dashboard/admin",
  agent_vente: "/dashboard/agent-vente",
  agent_montage: "/dashboard/agent-montage",
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchRole(userId: string): Promise<AppRole | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as AppRole | undefined) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => {
          fetchRole(s.user.id).then(setRole);
        }, 0);
      } else {
        setRole(null);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setRole(await fetchRole(s.user.id));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    role,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshRole: async () => {
      if (user) setRole(await fetchRole(user.id));
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
