CREATE POLICY "Users can self-assign their role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

GRANT INSERT ON public.user_roles TO authenticated;