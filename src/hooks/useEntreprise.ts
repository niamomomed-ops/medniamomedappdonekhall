import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntrepriseHoraire = {
  ouvert: boolean;
  debut: string | null;
  fin: string | null;
};

export type EntrepriseHoraires = Record<
  "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche",
  EntrepriseHoraire
>;

export type Entreprise = {
  id: string;
  nom: string | null;
  slogan: string | null;
  telephone: string | null;
  whatsapp: string | null;
  email: string | null;
  site_web: string | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  logo_url: string | null;
  horaires: EntrepriseHoraires | null;
  couleur_principale: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

export const DEFAULT_HORAIRES: EntrepriseHoraires = {
  lundi: { ouvert: true, debut: "09:00", fin: "18:00" },
  mardi: { ouvert: true, debut: "09:00", fin: "18:00" },
  mercredi: { ouvert: true, debut: "09:00", fin: "18:00" },
  jeudi: { ouvert: true, debut: "09:00", fin: "18:00" },
  vendredi: { ouvert: true, debut: "09:00", fin: "18:00" },
  samedi: { ouvert: true, debut: "09:00", fin: "13:00" },
  dimanche: { ouvert: false, debut: null, fin: null },
};

export function useEntreprise() {
  const query = useQuery({
    queryKey: ["entreprise"],
    queryFn: async (): Promise<Entreprise | null> => {
      const { data, error } = await (supabase as any)
        .from("entreprise")
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Entreprise) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    entreprise: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
