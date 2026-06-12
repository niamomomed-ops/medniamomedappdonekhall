import { supabase as typedSupabase } from "@/integrations/supabase/client";

// The generated Database types don't include `correction_annexes` yet.
// Cast through `any` for table access while keeping storage typed.
const supabase = typedSupabase as any;

const BUCKET = "correction-annexes";
const MAX_FILES = 10;
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];

export const ANNEXE_LIMITS = {
  maxFiles: MAX_FILES,
  maxSize: MAX_SIZE,
  allowedTypes: ALLOWED_TYPES,
};

export type CorrectionAnnexe = {
  id: string;
  prescription_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
  uploader_name?: string | null;
};

export function validateAnnexes(files: File[]): string | null {
  if (files.length > MAX_FILES) {
    return `Maximum ${MAX_FILES} images autorisées`;
  }
  for (const file of files) {
    if (file.size > MAX_SIZE) {
      return `Image ${file.name} dépasse 5 MB`;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Format non autorisé. Acceptés : JPG, PNG, GIF uniquement";
    }
  }
  return null;
}

export async function uploadAnnexes(
  prescriptionId: string,
  files: File[],
  uploaderUserId: string | null,
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "img";
    const unique = `${crypto.randomUUID()}.${ext}`;
    const filePath = `prescriptions/${prescriptionId}/${unique}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { cacheControl: "3600", upsert: false });
    if (upErr) {
      console.error("annexe upload failed", file.name, upErr);
      failed++;
      continue;
    }

    const { error: insErr } = await supabase.from("correction_annexes").insert({
      prescription_id: prescriptionId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type,
      uploaded_by: uploaderUserId,
    });
    if (insErr) {
      console.error("annexe insert failed", file.name, insErr);
      await supabase.storage.from(BUCKET).remove([filePath]);
      failed++;
      continue;
    }
    success++;
  }

  return { success, failed };
}

export async function listAnnexes(
  prescriptionId: string,
): Promise<CorrectionAnnexe[]> {
  const { data, error } = await supabase
    .from("correction_annexes")
    .select("*")
    .eq("prescription_id", prescriptionId)
    .order("uploaded_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CorrectionAnnexe[];

  const userIds = Array.from(
    new Set(rows.map((r) => r.uploaded_by).filter(Boolean)),
  ) as string[];
  if (userIds.length === 0) return rows;

  const { data: persons } = await supabase
    .from("personnel")
    .select("id, name")
    .in("id", userIds);
  const nameById = new Map<string, string>(
    (persons ?? []).map((p: { id: string; name: string }) => [p.id, p.name]),
  );
  return rows.map((r) => ({
    ...r,
    uploader_name: r.uploaded_by ? nameById.get(r.uploaded_by) ?? null : null,
  }));
}

export async function getAnnexeSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (paths.length === 0) return out;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 3600);
  if (error) {
    console.error("signed urls error", error);
    return out;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

export async function deleteAnnexe(
  annexeId: string,
  filePath: string,
): Promise<void> {
  await supabase.storage.from(BUCKET).remove([filePath]);
  const { error } = await supabase
    .from("correction_annexes")
    .delete()
    .eq("id", annexeId);
  if (error) throw new Error(error.message);
}
