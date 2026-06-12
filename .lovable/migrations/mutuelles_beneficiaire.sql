-- Prompt 92 — Ajout des colonnes bénéficiaire dans demandes_mutuelles
-- À exécuter manuellement dans le SQL Editor Supabase.

ALTER TABLE public.demandes_mutuelles
  ADD COLUMN IF NOT EXISTS beneficiaire_nom TEXT,
  ADD COLUMN IF NOT EXISTS beneficiaire_date_naissance DATE,
  ADD COLUMN IF NOT EXISTS beneficiaire_organisme TEXT;

-- Vérification :
-- SELECT id, numero_demande, beneficiaire_nom, beneficiaire_date_naissance, beneficiaire_organisme
-- FROM public.demandes_mutuelles;
