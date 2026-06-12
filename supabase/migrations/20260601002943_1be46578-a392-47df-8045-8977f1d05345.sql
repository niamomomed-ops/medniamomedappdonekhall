
-- Enforce axe range [0, 180] on prescriptions and commandes
ALTER TABLE public.prescriptions
  ADD CONSTRAINT prescriptions_od_axe_range CHECK (od_axe >= 0 AND od_axe <= 180),
  ADD CONSTRAINT prescriptions_og_axe_range CHECK (og_axe >= 0 AND og_axe <= 180);

ALTER TABLE public.commandes
  ADD CONSTRAINT commandes_od_axe_range CHECK (od_axe IS NULL OR (od_axe >= 0 AND od_axe <= 180)),
  ADD CONSTRAINT commandes_og_axe_range CHECK (og_axe IS NULL OR (og_axe >= 0 AND og_axe <= 180));
