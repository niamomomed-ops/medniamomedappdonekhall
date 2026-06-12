import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/dashboard/admin")({
  component: () => (
    <RoleGuard allow="admin">
      <Outlet />
    </RoleGuard>
  ),
});
