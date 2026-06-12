
-- Enums
create type public.app_role as enum ('admin', 'agent_vente', 'agent_montage');
create type public.caisse_status as enum ('open', 'closed');
create type public.personnel_status as enum ('active', 'suspended');
create type public.tx_type as enum ('entree', 'sortie');
create type public.commande_type as enum ('vision_loin','vision_pres','double_foyer','progressif','lentilles');
create type public.commande_status as enum ('commande_creee','verre_commande','verre_recu','en_montage','casse_montage','finalise','en_reception','livree');
create type public.monture_source as enum ('boutique','donnee');
create type public.prescription_type as enum ('interne','externe');

-- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admins read all roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "users insert own first role" on public.user_roles for insert to authenticated with check (user_id = auth.uid());

-- Personnel
create table public.personnel (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role app_role not null,
  status personnel_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.personnel enable row level security;
create policy "authenticated read personnel" on public.personnel for select to authenticated using (true);
create policy "admins manage personnel" on public.personnel for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Caisses
create table public.caisses (
  id uuid primary key default gen_random_uuid(),
  label text,
  opening_balance numeric(14,2) not null default 0,
  status caisse_status not null default 'open',
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users(id),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.caisses enable row level security;
create policy "vente+admin read caisses" on public.caisses for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));
create policy "vente+admin write caisses" on public.caisses for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- Clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  date_naissance date not null,
  email text not null,
  telephone text not null,
  adresse text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clients enable row level security;
create policy "vente+admin read clients" on public.clients for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));
create policy "vente+admin write clients" on public.clients for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- Fournisseurs
create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text not null,
  telephone text not null,
  whatsapp text,
  adresse text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fournisseurs enable row level security;
create policy "auth read fournisseurs" on public.fournisseurs for select to authenticated using (true);
create policy "admin manage fournisseurs" on public.fournisseurs for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Prescriptions
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type prescription_type not null,
  date_prescription date not null,
  od_sphere numeric(6,2) not null,
  od_cylinder numeric(6,2) not null,
  od_axe int not null,
  od_addition numeric(6,2) not null,
  og_sphere numeric(6,2) not null,
  og_cylinder numeric(6,2) not null,
  og_axe int not null,
  og_addition numeric(6,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.prescriptions enable row level security;
create policy "auth read prescriptions" on public.prescriptions for select to authenticated using (true);
create policy "vente+admin write prescriptions" on public.prescriptions for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- Commandes
create sequence if not exists public.commandes_numero_seq;
create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero_commande text not null unique default ('CMD-' || lpad(nextval('public.commandes_numero_seq')::text, 6, '0')),
  client_id uuid not null references public.clients(id) on delete restrict,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  fournisseur_id uuid references public.fournisseurs(id) on delete set null,
  caisse_id uuid references public.caisses(id) on delete set null,
  type commande_type not null,
  status commande_status not null default 'commande_creee',
  date_livraison date,
  montant numeric(14,2) not null default 0,
  avance numeric(14,2) not null default 0,
  reste numeric(14,2) generated always as (montant - avance) stored,
  monture_source monture_source,
  type_verres text,
  lentilles text,
  quantite int not null default 1,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.commandes enable row level security;
create policy "auth read commandes" on public.commandes for select to authenticated using (true);
create policy "vente+admin+montage write commandes" on public.commandes for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));

-- Order history
create table public.order_history (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  old_status commande_status,
  new_status commande_status not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
alter table public.order_history enable row level security;
create policy "auth read order_history" on public.order_history for select to authenticated using (true);
create policy "auth insert order_history" on public.order_history for insert to authenticated with check (true);

-- Progressive measurements
create table public.progressive_measurements (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null unique references public.commandes(id) on delete cascade,
  ecart_pupillaire_od numeric(6,2),
  ecart_pupillaire_og numeric(6,2),
  hauteur_pupillaire_od numeric(6,2),
  hauteur_pupillaire_og numeric(6,2),
  grand_diametre numeric(6,2),
  hauteur_calibre numeric(6,2),
  pont numeric(6,2),
  created_at timestamptz not null default now()
);
alter table public.progressive_measurements enable row level security;
create policy "auth read pm" on public.progressive_measurements for select to authenticated using (true);
create policy "vente+admin write pm" on public.progressive_measurements for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  caisse_id uuid not null references public.caisses(id) on delete cascade,
  type tx_type not null,
  amount numeric(14,2) not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
create policy "vente+admin read tx" on public.transactions for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));
create policy "vente+admin write tx" on public.transactions for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));
