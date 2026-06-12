
CREATE TYPE public.personnel_status AS ENUM ('active', 'suspended');

CREATE TABLE public.personnel (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  status public.personnel_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all personnel"
  ON public.personnel FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own personnel record"
  ON public.personnel FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can insert personnel"
  ON public.personnel FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update personnel"
  ON public.personnel FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete personnel"
  ON public.personnel FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Backfill existing accounts
INSERT INTO public.personnel (id, name, email, role, status)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       u.email,
       ur.role,
       'active'::public.personnel_status
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
ON CONFLICT (id) DO NOTHING;
