CREATE TABLE public.fournisseurs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telephone TEXT NOT NULL,
  whatsapp TEXT,
  adresse TEXT NOT NULL,
  created_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fournisseurs"
ON public.fournisseurs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert fournisseurs"
ON public.fournisseurs FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update fournisseurs"
ON public.fournisseurs FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete fournisseurs"
ON public.fournisseurs FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE TRIGGER fournisseurs_set_updated_at
BEFORE UPDATE ON public.fournisseurs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();