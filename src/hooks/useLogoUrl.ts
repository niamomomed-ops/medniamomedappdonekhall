import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "entreprise-assets";
const TEN_YEARS = 315360000;

/**
 * Extracts a storage path from a value that may be either:
 *  - a bare file path (e.g. "logo-1780.png")
 *  - a legacy public URL ("/object/public/entreprise-assets/logo-1780.png")
 *  - a previously signed URL ("/object/sign/entreprise-assets/logo-1780.png?...")
 */
function extractPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const marker = `/${BUCKET}/`;
  const idx = v.indexOf(marker);
  if (idx >= 0) {
    const rest = v.slice(idx + marker.length);
    return rest.split("?")[0];
  }
  return v;
}

export function useLogoUrl(stored: string | null | undefined) {
  const path = extractPath(stored);
  return useQuery({
    queryKey: ["logo-signed-url", path],
    enabled: !!path,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, TEN_YEARS);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

export { extractPath as extractLogoPath };
