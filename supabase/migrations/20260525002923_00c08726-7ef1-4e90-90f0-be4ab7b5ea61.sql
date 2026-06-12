
-- Prescriptions table
CREATE TYPE public.prescription_type AS ENUM ('interne', 'externe');

CREATE TABLE public.prescriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.prescription_type NOT NULL,
  date_prescription DATE NOT NULL,
  od_sphere NUMERIC(5,2) NOT NULL DEFAULT 0,
  od_cylinder NUMERIC(5,2) NOT NULL DEFAULT 0,
  od_axe INTEGER NOT NULL DEFAULT 0,
  od_addition NUMERIC(5,2) NOT NULL DEFAULT 0,
  og_sphere NUMERIC(5,2) NOT NULL DEFAULT 0,
  og_cylinder NUMERIC(5,2) NOT NULL DEFAULT 0,
  og_axe INTEGER NOT NULL DEFAULT 0,
  og_addition NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prescriptions_client ON public.prescriptions(client_id);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- All authenticated roles can SELECT prescriptions
CREATE POLICY "All roles can view prescriptions"
  ON public.prescriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','agent_vente','agent_montage')));

CREATE POLICY "Admin or vente can insert prescriptions"
  ON public.prescriptions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','agent_vente')));

CREATE POLICY "Admin or vente can update prescriptions"
  ON public.prescriptions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','agent_vente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','agent_vente')));

CREATE POLICY "Admin or vente can delete prescriptions"
  ON public.prescriptions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','agent_vente')));

CREATE TRIGGER trg_prescriptions_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Commandes table (minimal, with prescription_id)
CREATE TYPE public.commande_status AS ENUM ('en_attente','en_cours','terminee','annulee');

CREATE TABLE public.commandes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  status public.commande_status NOT NULL DEFAULT 'en_attente',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commandes_client ON public.commandes(client_id);
CREATE INDEX idx_commandes_prescription ON public.commandes(prescription_id);

ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All roles can view commandes"
  ON public.commandes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','agent_vente','agent_montage')));

CREATE POLICY "Admin or vente can insert commandes"
  ON public.commandes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','agent_vente')));

CREATE POLICY "Admin or vente can update commandes"
  ON public.commandes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','agent_vente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','agent_vente')));

CREATE POLICY "Admin can delete commandes"
  ON public.commandes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role = 'admin'));

CREATE TRIGGER trg_commandes_updated_at
  BEFORE UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
