
CREATE POLICY "Users can self-assign initial role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
);
