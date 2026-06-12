
-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'agent_vente', 'agent_montage');
create type public.caisse_status as enum ('open', 'closed');
create type public.transaction_type as enum ('entree', 'sortie');
create type public.prescription_type as enum ('interne', 'externe');
create type public.commande_type as enum ('vision_loin','vision_pres','double_foyer','progressif','lentilles');
create type public.commande_status as enum ('commande_creee','verre_commande','verre_recu','en_montage','casse_montage','finalise','en_reception','livree');
create type public.monture_source as enum ('boutique','donnee');
create type public.casse_eye as enum ('od','og','both');
create type public.personnel_status as enum ('active','inactive');

-- ============ USER_ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "admins read all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============ PERSONNEL ============
create table public.personnel (
  id uuid primary key,
  name text not null,
  email text not null,
  role public.app_role not null,
  status public.personnel_status not null default 'active',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.personnel to authenticated;
grant all on public.personnel to service_role;
alter table public.personnel enable row level security;
create policy "staff read personnel" on public.personnel
  for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );
create policy "admin manage personnel" on public.personnel
  for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- ============ CLIENTS ============
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  date_naissance date not null,
  email text not null,
  telephone text not null,
  adresse text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);
grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;
create policy "read clients" on public.clients for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));
create policy "write clients" on public.clients for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- ============ FOURNISSEURS ============
create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text not null,
  telephone text not null,
  whatsapp text,
  adresse text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);
grant select, insert, update, delete on public.fournisseurs to authenticated;
grant all on public.fournisseurs to service_role;
alter table public.fournisseurs enable row level security;
create policy "read fournisseurs" on public.fournisseurs for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));
create policy "admin manage fournisseurs" on public.fournisseurs for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- ============ PRESCRIPTIONS ============
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type public.prescription_type not null,
  date_prescription date not null,
  od_sphere numeric not null default 0,
  od_cylinder numeric not null default 0,
  od_axe integer not null default 0,
  od_addition numeric not null default 0,
  og_sphere numeric not null default 0,
  og_cylinder numeric not null default 0,
  og_axe integer not null default 0,
  og_addition numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
grant select, insert, update, delete on public.prescriptions to authenticated;
grant all on public.prescriptions to service_role;
alter table public.prescriptions enable row level security;
create policy "read prescriptions" on public.prescriptions for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));
create policy "write prescriptions" on public.prescriptions for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- ============ CAISSES ============
create table public.caisses (
  id uuid primary key default gen_random_uuid(),
  label text,
  opening_balance numeric not null default 0,
  closing_balance numeric,
  status public.caisse_status not null default 'open',
  opened_at timestamptz not null default now(),
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  auto_close_at timestamptz,
  auto_closed boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.caisses to authenticated;
grant all on public.caisses to service_role;
alter table public.caisses enable row level security;
create policy "caisse access" on public.caisses for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- ============ COMMANDES ============
create sequence if not exists public.commandes_numero_seq;

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero_commande text not null unique default ('CMD-' || lpad(nextval('public.commandes_numero_seq')::text, 6, '0')),
  client_id uuid not null references public.clients(id) on delete restrict,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  fournisseur_id uuid references public.fournisseurs(id) on delete set null,
  caisse_id uuid references public.caisses(id) on delete set null,
  type public.commande_type not null,
  status public.commande_status not null default 'commande_creee',
  date_livraison date,
  montant numeric not null default 0,
  avance numeric not null default 0,
  reste numeric generated always as (montant - avance) stored,
  monture_source public.monture_source,
  monture_marque text,
  monture_client_provided boolean,
  monture_client_called_at timestamptz,
  monture_client_called_by uuid,
  monture_client_received_at timestamptz,
  monture_client_received_by uuid,
  type_verres text,
  lentilles text,
  quantite integer not null default 1,
  notes text,
  urgent boolean not null default false,
  od_sphere numeric, od_cylinder numeric, od_axe integer, od_addition numeric,
  og_sphere numeric, og_cylinder numeric, og_axe integer, og_addition numeric,
  casse_eye public.casse_eye,
  casse_note text,
  casse_at timestamptz,
  casse_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid
);
grant select, insert, update, delete on public.commandes to authenticated;
grant all on public.commandes to service_role;
alter table public.commandes enable row level security;
create policy "read commandes" on public.commandes for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));
create policy "write commandes" on public.commandes for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));

-- ============ TRANSACTIONS ============
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  caisse_id uuid not null references public.caisses(id) on delete cascade,
  type public.transaction_type not null,
  amount numeric not null,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid
);
grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "tx access" on public.transactions for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- ============ ORDER HISTORY ============
create table public.order_history (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  old_status text,
  new_status text,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
grant select, insert, update, delete on public.order_history to authenticated;
grant all on public.order_history to service_role;
alter table public.order_history enable row level security;
create policy "history access" on public.order_history for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));

-- ============ PROGRESSIVE MEASUREMENTS ============
create table public.progressive_measurements (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null unique references public.commandes(id) on delete cascade,
  ecart_pupillaire_od numeric,
  ecart_pupillaire_og numeric,
  hauteur_pupillaire_od numeric,
  hauteur_pupillaire_og numeric,
  grand_diametre numeric,
  hauteur_calibre numeric,
  pont numeric,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.progressive_measurements to authenticated;
grant all on public.progressive_measurements to service_role;
alter table public.progressive_measurements enable row level security;
create policy "pm access" on public.progressive_measurements for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));
