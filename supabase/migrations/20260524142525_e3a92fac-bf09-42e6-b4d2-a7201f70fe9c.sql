
-- Re-grant execute on has_role (required by RLS policies)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

-- Assign roles to existing accounts
INSERT INTO public.user_roles (user_id, role) VALUES
  ('cd4174db-14d0-40e8-a12b-9324d21a96d4', 'admin'),
  ('e2c2bafc-8e19-4a9f-ace6-f432a4b23ed9', 'agent_montage'),
  ('4f7eb172-6989-455b-afb5-e42d8667c54f', 'agent_vente')
ON CONFLICT (user_id, role) DO NOTHING;
