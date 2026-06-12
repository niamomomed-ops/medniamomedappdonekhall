-- Ajout des champs de remboursement sur les demandes mutuelles
ALTER TABLE public.demandes_mutuelles
  ADD COLUMN IF NOT EXISTS prix_monture numeric(12,2),
  ADD COLUMN IF NOT EXISTS prix_verre numeric(12,2),
  ADD COLUMN IF NOT EXISTS total_remboursement numeric(12,2)
    GENERATED ALWAYS AS (COALESCE(prix_monture,0) + COALESCE(prix_verre,0)) STORED;

ALTER TABLE public.demandes_mutuelles
  ADD CONSTRAINT demandes_mutuelles_prix_monture_positive CHECK (prix_monture IS NULL OR prix_monture >= 0),
  ADD CONSTRAINT demandes_mutuelles_prix_verre_positive CHECK (prix_verre IS NULL OR prix_verre >= 0);
