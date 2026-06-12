ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT true;

UPDATE public.transactions
SET is_manual = false
WHERE is_manual = true
  AND description IS NOT NULL
  AND (
    description LIKE 'Versement dette client %'
    OR description LIKE 'Règlement récupération —%'
    OR description LIKE 'Avance commande%'
    OR description LIKE 'Remboursement%'
  );

CREATE INDEX IF NOT EXISTS idx_transactions_caisse_manual
  ON public.transactions (caisse_id, is_manual);
