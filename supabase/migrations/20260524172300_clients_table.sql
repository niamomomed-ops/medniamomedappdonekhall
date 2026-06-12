create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  date_naissance date not null,
  email text not null unique,
  telephone text not null,
  adresse text not null,
  created_by uuid references public.personnel(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "clients_select_allowed_roles"
on public.clients for select to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'agent_vente'));

create policy "clients_insert_allowed_roles"
on public.clients for insert to authenticated
with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'agent_vente'));

create policy "clients_update_allowed_roles"
on public.clients for update to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'agent_vente'))
with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'agent_vente'));

create policy "clients_delete_allowed_roles"
on public.clients for delete to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'agent_vente'));

create or replace function public.set_clients_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_clients_updated_at();
