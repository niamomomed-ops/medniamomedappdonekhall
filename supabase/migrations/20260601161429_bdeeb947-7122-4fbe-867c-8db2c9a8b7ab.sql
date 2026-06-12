-- Refonte du concept de dette: les versements sont liés au CLIENT, pas à la commande.
-- Un versement réduit la dette globale du client (somme des restes des commandes livrées).

-- 1. Ajouter client_id sur versements
ALTER TABLE public.versements ADD COLUMN IF NOT EXISTS client_id uuid;

-- 2. Backfill client_id depuis la commande liée (pour les versements existants)
UPDATE public.versements v
SET client_id = c.client_id
FROM public.commandes c
WHERE v.commande_id = c.id
  AND v.client_id IS NULL;

-- 3. Rendre client_id obligatoire et commande_id optionnel (référence historique uniquement)
ALTER TABLE public.versements ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE public.versements ALTER COLUMN commande_id DROP NOT NULL;

-- 4. Index pour les requêtes de dette par client
CREATE INDEX IF NOT EXISTS idx_versements_client_id ON public.versements(client_id);
