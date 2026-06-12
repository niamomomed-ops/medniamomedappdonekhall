import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DemoRole = "admin" | "agent_vente" | "agent_montage";

const DEMO: Record<string, { role: DemoRole; name: string }> = {
  "admin@demo.local": { role: "admin", name: "Administrateur" },
  "vente@demo.local": { role: "agent_vente", name: "Agent Vente" },
  "montage@demo.local": { role: "agent_montage", name: "Agent Montage" },
};

export const assignDemoRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) throw new Error("No email on session");
    const meta = DEMO[email];
    if (!meta) throw new Error("Not a demo account");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: claims.sub as string, role: meta.role },
        { onConflict: "user_id,role" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
