DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins can view all personnel" ON public.personnel;
DROP POLICY IF EXISTS "Admins can insert personnel" ON public.personnel;
DROP POLICY IF EXISTS "Admins can update personnel" ON public.personnel;
DROP POLICY IF EXISTS "Admins can delete personnel" ON public.personnel;

DROP POLICY IF EXISTS "Admin or vente can view caisses" ON public.caisses;
DROP POLICY IF EXISTS "Admin or vente can insert caisses" ON public.caisses;
DROP POLICY IF EXISTS "Admin or vente can update caisses" ON public.caisses;
DROP POLICY IF EXISTS "Admins can delete caisses" ON public.caisses;

DROP POLICY IF EXISTS "Admin or vente can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admin or vente can insert transactions" ON public.transactions;

DROP POLICY IF EXISTS "Admin or vente can view clients" ON public.clients;
DROP POLICY IF EXISTS "Admin or vente can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Admin or vente can update clients" ON public.clients;
DROP POLICY IF EXISTS "Admin or vente can delete clients" ON public.clients;

CREATE POLICY "Admins can view all personnel"
ON public.personnel FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert personnel"
ON public.personnel FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update personnel"
ON public.personnel FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete personnel"
ON public.personnel FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin or vente can view caisses"
ON public.caisses FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')));

CREATE POLICY "Admin or vente can insert caisses"
ON public.caisses FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')));

CREATE POLICY "Admin or vente can update caisses"
ON public.caisses FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')));

CREATE POLICY "Admins can delete caisses"
ON public.caisses FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin or vente can view transactions"
ON public.transactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')));

CREATE POLICY "Admin or vente can insert transactions"
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente'))
);

CREATE POLICY "Admin or vente can view clients"
ON public.clients FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')));

CREATE POLICY "Admin or vente can insert clients"
ON public.clients FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente'))
);

CREATE POLICY "Admin or vente can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')));

CREATE POLICY "Admin or vente can delete clients"
ON public.clients FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'agent_vente')));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS private.has_role(uuid, public.app_role);