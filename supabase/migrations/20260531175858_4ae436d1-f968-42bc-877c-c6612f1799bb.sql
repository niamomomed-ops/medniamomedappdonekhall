CREATE SEQUENCE IF NOT EXISTS public.commande_numero_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_commande_numero()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_commande IS NULL OR NEW.numero_commande = '' THEN
    NEW.numero_commande := 'CMD-' || LPAD(nextval('public.commande_numero_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_commande_numero ON public.commandes;
CREATE TRIGGER set_commande_numero
BEFORE INSERT ON public.commandes
FOR EACH ROW
EXECUTE FUNCTION public.generate_commande_numero();

-- Backfill existing rows missing a numero_commande
UPDATE public.commandes
SET numero_commande = 'CMD-' || LPAD(nextval('public.commande_numero_seq')::text, 4, '0')
WHERE numero_commande IS NULL OR numero_commande = '';

-- Align sequence with highest existing CMD-#### value
SELECT setval(
  'public.commande_numero_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(numero_commande, '\D', '', 'g'), '')::bigint), 0)
       FROM public.commandes
       WHERE numero_commande ~ '^CMD-\d+$'),
    1
  )
);