import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CloseCaisseButton } from "@/components/CloseCaisseButton";
import { OpenCaisseButton } from "@/components/OpenCaisseButton";
import { MainNav } from "@/components/MainNav";
import { NotificationBell } from "@/components/NotificationBell";
import { CarteDeVisiteButton } from "@/components/CarteDeVisiteButton";
import { BirthdayIndicator } from "@/components/BirthdayIndicator";
import { UrgentBanner } from "@/components/UrgentBanner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";


type Props = {
  role: AppRole;
  title: string;
  subtitle: string;
  accent: string; // tailwind bg classname for the role badge dot
  children: ReactNode;
};

export function DashboardShell({ role, title, subtitle, accent, children }: Props) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <UrgentBanner />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 md:px-6 md:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent}`} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground md:text-xs">
                {ROLE_LABELS[role]}
              </p>
              <h1 className="truncate text-sm font-semibold text-foreground md:text-base">
                {title}
              </h1>
            </div>
          </div>

          {/* Desktop: all actions inline */}
          <div className="hidden items-center gap-3 lg:flex">
            <span className="hidden text-sm text-muted-foreground xl:inline">
              {user?.email}
            </span>
            <NotificationBell />
            <BirthdayIndicator />
            <CarteDeVisiteButton />
            <OpenCaisseButton />
            <CloseCaisseButton />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </Button>
          </div>

          {/* Mobile / tablet: bell visible + overflow menu */}
          <div className="flex items-center gap-1 lg:hidden">
            <NotificationBell />
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Plus d'actions">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3">
                {user?.email && (
                  <p className="mb-3 truncate border-b border-border pb-2 text-xs text-muted-foreground">
                    {user.email}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <BirthdayIndicator />
                  <CarteDeVisiteButton />
                  <OpenCaisseButton />
                  <CloseCaisseButton />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    setMoreOpen(false);
                    void handleLogout();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Déconnexion
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <MainNav />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
