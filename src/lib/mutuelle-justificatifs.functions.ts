import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "mutuelle-justificatifs";

const uploadSchema = z.object({
  demandeId: z.string().uuid(),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        type: z.string().min(1).max(100),
        size: z.number().int().min(0).max(5 * 1024 * 1024),
        base64: z.string().min(1),
      }),
    )
    .min(1)
    .max(20),
});

export const uploadMutuelleJustificatifs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => uploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let successCount = 0;
    let failedCount = 0;

    for (const file of data.files) {
      if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
        failedCount++;
        continue;
      }
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const unique = `${crypto.randomUUID()}.${ext}`;
      const filePath = `demandes/${data.demandeId}/${unique}`;
      const buffer = Buffer.from(file.base64, "base64");

      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(filePath, buffer, { contentType: file.type, upsert: false });
      if (upErr) {
        console.error("mutuelle justif upload failed", file.name, upErr);
        failedCount++;
        continue;
      }

      const { error: insErr } = await sb.from("mutuelle_justificatifs").insert({
        demande_id: data.demandeId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        uploaded_by: context.userId,
      });
      if (insErr) {
        console.error("mutuelle justif insert failed", file.name, insErr);
        await sb.storage.from(BUCKET).remove([filePath]);
        failedCount++;
        continue;
      }
      successCount++;
    }
    return { successCount, failedCount };
  });

export type MutuelleJustificatif = {
  id: string;
  demande_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export const listMutuelleJustificatifs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ demande_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("mutuelle_justificatifs")
      .select("id, demande_id, file_name, file_path, file_size, uploaded_by, uploaded_at")
      .eq("demande_id", data.demande_id)
      .order("uploaded_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as MutuelleJustificatif[];
  });

export const countMutuelleJustificatifsByDemandes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ demande_ids: z.array(z.string().uuid()).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    if (data.demande_ids.length === 0) return {} as Record<string, number>;
    const { data: rows, error } = await sb
      .from("mutuelle_justificatifs")
      .select("demande_id")
      .in("demande_id", data.demande_ids);
    if (error) throw new Error(error.message);
    const out: Record<string, number> = {};
    for (const r of rows ?? []) {
      out[r.demande_id] = (out[r.demande_id] ?? 0) + 1;
    }
    return out;
  });

export const deleteMutuelleJustificatif = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), file_path: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await sb.storage.from(BUCKET).remove([data.file_path]);
    const { error } = await sb
      .from("mutuelle_justificatifs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMutuelleJustificatifsSignedUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ paths: z.array(z.string().min(1)).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    if (data.paths.length === 0) return {} as Record<string, string>;
    const { data: signed, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(data.paths, 3600);
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
    }
    return out;
  });
