import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  prescriptionId: z.string().uuid(),
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
    .max(10),
});

export const uploadCorrectionAnnexes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let successCount = 0;
    let failedCount = 0;

    for (const file of data.files) {
      const ext = file.name.split(".").pop() ?? "img";
      const unique = `${crypto.randomUUID()}.${ext}`;
      const filePath = `prescriptions/${data.prescriptionId}/${unique}`;
      const buffer = Buffer.from(file.base64, "base64");

      const { error: upErr } = await sb.storage
        .from("correction-annexes")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (upErr) {
        console.error(`Upload ${file.name} failed:`, upErr);
        failedCount++;
        continue;
      }

      const { error: insErr } = await sb.from("correction_annexes").insert({
        prescription_id: data.prescriptionId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: context.userId,
      });

      if (insErr) {
        console.error(`Insert ${file.name} failed:`, insErr);
        await sb.storage.from("correction-annexes").remove([filePath]);
        failedCount++;
        continue;
      }
      successCount++;
    }

    return { successCount, failedCount };
  });
