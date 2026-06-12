-- À exécuter dans le SQL Editor de Lovable Cloud (Prompt 70)
-- Ajout du mode de correction lentilles (Origine / Sphérique)

ALTER TABLE public.commandes
  ADD COLUMN IF NOT EXISTS lentille_type TEXT;

ALTER TABLE public.commandes
  DROP CONSTRAINT IF EXISTS commandes_lentille_type_check;

ALTER TABLE public.commandes
  ADD CONSTRAINT commandes_lentille_type_check
  CHECK (lentille_type IS NULL OR lentille_type IN ('origine', 'spherique'));
