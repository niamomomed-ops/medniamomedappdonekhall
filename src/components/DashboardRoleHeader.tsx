import { Shield, ShoppingBag, Wrench } from "lucide-react";
import type { AppRole } from "@/lib/auth";

type RoleStyle = {
  title: string;
  emoji: string;
  Icon: typeof Shield;
  color: string; // CSS color
  tint: string; // bg color w/ alpha
};

const ROLE_STYLES: Record<AppRole, RoleStyle> = {
  admin: {
    title: "Administration",
    emoji: "🛡️",
    Icon: Shield,
    color: "#7C3AED",
    tint: "rgba(124,58,237,0.06)",
  },
  agent_vente: {
    title: "Agent de vente",
    emoji: "🛍️",
    Icon: ShoppingBag,
    color: "#2563EB",
    tint: "rgba(37,99,235,0.06)",
  },
  agent_montage: {
    title: "Atelier montage",
    emoji: "🔧",
    Icon: Wrench,
    color: "#D97706",
    tint: "rgba(217,119,6,0.06)",
  },
};

export function DashboardRoleHeader({ role }: { role: AppRole }) {
  const s = ROLE_STYLES[role];
  return (
    <div
      className="mb-6 flex items-center gap-3 rounded-xl border-l-4 px-4 py-3"
      style={{
        borderLeftColor: s.color,
        background: s.tint,
      }}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {s.emoji}
      </span>
      <s.Icon className="h-5 w-5" style={{ color: s.color }} aria-hidden />
      <h1
        className="text-2xl font-bold tracking-tight"
        style={{ color: s.color }}
      >
        {s.title}
      </h1>
    </div>
  );
}
