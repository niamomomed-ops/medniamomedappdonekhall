
create type public.app_role as enum ('admin', 'agent_vente', 'agent_montage');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create policy "users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "self insert first role" on public.user_roles for insert to authenticated with check (user_id = auth.uid());
create policy "admin manages roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.personnel (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role public.app_role not null,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger personnel_updated before update on public.personnel for each row execute function public.set_updated_at();
alter table public.personnel enable row level security;
create policy "authenticated read personnel" on public.personnel for select to authenticated using (true);
create policy "admin write personnel" on public.personnel for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  date_naissance date,
  email text,
  telephone text,
  adresse text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clients_updated before update on public.clients for each row execute function public.set_updated_at();
alter table public.clients enable row level security;
create policy "authenticated read clients" on public.clients for select to authenticated using (true);
create policy "sales write clients" on public.clients for all to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('interne','externe')),
  date_prescription date not null,
  od_sphere numeric, od_cylinder numeric, od_axe int, od_addition numeric,
  og_sphere numeric, og_cylinder numeric, og_axe int, og_addition numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger prescriptions_updated before update on public.prescriptions for each row execute function public.set_updated_at();
alter table public.prescriptions enable row level security;
create policy "authenticated read prescriptions" on public.prescriptions for select to authenticated using (true);
create policy "sales write prescriptions" on public.prescriptions for all to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text,
  telephone text,
  whatsapp text,
  adresse text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger fournisseurs_updated before update on public.fournisseurs for each row execute function public.set_updated_at();
alter table public.fournisseurs enable row level security;
create policy "authenticated read fournisseurs" on public.fournisseurs for select to authenticated using (true);
create policy "admin write fournisseurs" on public.fournisseurs for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.caisses (
  id uuid primary key default gen_random_uuid(),
  label text,
  status text not null default 'open' check (status in ('open','closed')),
  opening_balance numeric not null default 0,
  closing_balance numeric,
  opened_at timestamptz,
  opened_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.caisses enable row level security;
create policy "authenticated read caisses" on public.caisses for select to authenticated using (true);
create policy "sales write caisses" on public.caisses for all to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  caisse_id uuid not null references public.caisses(id) on delete cascade,
  type text not null check (type in ('entree','sortie')),
  amount numeric not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
create policy "authenticated read transactions" on public.transactions for select to authenticated using (true);
create policy "sales write transactions" on public.transactions for all to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create sequence public.commande_seq;
create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero_commande text not null unique default ('CMD-' || lpad(nextval('public.commande_seq')::text, 6, '0')),
  client_id uuid not null references public.clients(id) on delete restrict,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  fournisseur_id uuid references public.fournisseurs(id) on delete set null,
  caisse_id uuid references public.caisses(id) on delete set null,
  type text,
  status text not null default 'commande_creee',
  date_livraison date,
  montant numeric not null default 0,
  avance numeric not null default 0,
  reste numeric generated always as (coalesce(montant,0) - coalesce(avance,0)) stored,
  monture_source text,
  type_verres text,
  lentilles text,
  quantite int not null default 1,
  notes text,
  urgent boolean not null default false,
  od_sphere numeric, od_cylinder numeric, od_axe int, od_addition numeric,
  og_sphere numeric, og_cylinder numeric, og_axe int, og_addition numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger commandes_updated before update on public.commandes for each row execute function public.set_updated_at();
alter table public.commandes enable row level security;
create policy "authenticated read commandes" on public.commandes for select to authenticated using (true);
create policy "staff write commandes" on public.commandes for all to authenticated using (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage')
) with check (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage')
);

create table public.order_history (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.order_history enable row level security;
create policy "authenticated read history" on public.order_history for select to authenticated using (true);
create policy "staff write history" on public.order_history for insert to authenticated with check (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage')
);

create table public.progressive_measurements (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null unique references public.commandes(id) on delete cascade,
  ecart_pupillaire_od numeric, ecart_pupillaire_og numeric,
  hauteur_pupillaire_od numeric, hauteur_pupillaire_og numeric,
  grand_diametre numeric, hauteur_calibre numeric, pont numeric,
  created_at timestamptz not null default now()
);
alter table public.progressive_measurements enable row level security;
create policy "authenticated read measures" on public.progressive_measurements for select to authenticated using (true);
create policy "sales write measures" on public.progressive_measurements for all to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));
