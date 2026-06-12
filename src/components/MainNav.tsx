import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  ShoppingCart,
  Users,
  Wallet,
  HandCoins,
  Truck,
  BarChart3,
  Settings,
  HeartHandshake,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_HOME, type AppRole } from "@/lib/auth";
import { getMutuellesBadgeCount } from "@/lib/mutuelles.functions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  roles: AppRole[];
  exact?: boolean;
};

const ITEMS: NavItem[] = [
  { to: "__home__", label: "Tableau de bord", icon: Home, roles: ["admin", "agent_vente", "agent_montage"], exact: true },
  { to: "/dashboard/commandes", label: "Commandes", icon: ShoppingCart, roles: ["admin", "agent_vente", "agent_montage"] },
  { to: "/dashboard/mes-stats", label: "Mes Stats", icon: BarChart3, roles: ["agent_montage"] },
  { to: "/dashboard/clients", label: "Clients", icon: Users, roles: ["admin", "agent_vente"] },
  { to: "/dashboard/caisses", label: "Caisses", icon: Wallet, roles: ["admin", "agent_vente"] },
  { to: "/dashboard/dettes", label: "Dettes", icon: HandCoins, roles: ["admin", "agent_vente"] },
  { to: "/dashboard/fournisseurs", label: "Fournisseurs", icon: Truck, roles: ["admin"] },
  { to: "/dashboard/mutuelles", label: "Mutuelles", icon: HeartHandshake, roles: ["admin", "agent_vente"] },
  { to: "/dashboard/parametres", label: "Paramètres", icon: Settings, roles: ["admin"] },
];


export function MainNav() {
  const { role } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchMutuelleBadge = useServerFn(getMutuellesBadgeCount);
  const { data: mutBadge } = useQuery({
    queryKey: ["mutuelles-badge", role],
    queryFn: () => fetchMutuelleBadge(),
    refetchInterval: 30_000,
    enabled: role === "admin" || role === "agent_vente",
  });
  const mutCount = (mutBadge as { count: number } | undefined)?.count ?? 0;
  const [open, setOpen] = useState(false);

  if (!role) return null;

  const home = ROLE_HOME[role];
  const items = ITEMS.filter((i) => i.roles.includes(role)).map((i) =>
    i.to === "__home__" ? { ...i, to: home } : i,
  );

  const renderItem = (
    item: (typeof items)[number],
    variant: "horizontal" | "drawer",
  ) => {
    const isActive = item.exact
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(item.to + "/");
    const Icon = item.icon;
    const showMutBadge = item.to === "/dashboard/mutuelles" && mutCount > 0;

    if (variant === "drawer") {
      return (
        <Link
          key={item.to}
          to={item.to as never}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
            isActive
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="flex-1">{item.label}</span>
          {showMutBadge && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
              {mutCount > 99 ? "99+" : mutCount}
            </span>
          )}
        </Link>
      );
    }

    return (
      <Link
        key={item.to}
        to={item.to as never}
        className={cn(
          "relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
          isActive
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="relative">
          {item.label}
          {showMutBadge && (
            <span className="absolute -right-3 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {mutCount > 99 ? "99+" : mutCount}
            </span>
          )}
        </span>
        {isActive && (
          <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
        )}
      </Link>
    );
  };

  return (
    <nav className="border-b border-border bg-card">
      {/* Desktop horizontal nav */}
      <div className="mx-auto hidden max-w-7xl items-center gap-1 overflow-x-auto px-6 lg:flex">
        {items.map((item) => renderItem(item, "horizontal"))}
      </div>

      {/* Mobile / tablet hamburger */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Menu className="h-5 w-5" />
              <span className="text-sm font-medium">Menu</span>
              {mutCount > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {mutCount > 99 ? "99+" : mutCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 sm:w-[320px]">
            <SheetHeader className="border-b border-border px-4 py-4 text-left">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 p-3">
              {items.map((item) => renderItem(item, "drawer"))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
