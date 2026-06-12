-- ============================================================
-- 1. ENUMS
-- ============================================================

create type public.app_role as enum ('admin', 'agent_vente', 'agent_montage');

-- ============================================================
-- 2. USER ROLES
-- ============================================================

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);

grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "user_roles_authenticated" on public.user_roles
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 3. PERSONNEL
-- ============================================================

create table public.personnel (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role app_role not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.personnel to authenticated;
grant all on public.personnel to service_role;

alter table public.personnel enable row level security;

create policy "personnel_authenticated" on public.personnel
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 4. CLIENTS
-- ============================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  date_naissance text not null,
  email text not null,
  telephone text not null,
  adresse text not null,
  cin text,
  mutuelle text,
  mutuelle_autre text,
  whatsapp text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;

alter table public.clients enable row level security;

create policy "clients_authenticated" on public.clients
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 5. FOURNISSEURS
-- ============================================================

create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text not null,
  telephone text not null,
  whatsapp text,
  adresse text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.fournisseurs to authenticated;
grant all on public.fournisseurs to service_role;

alter table public.fournisseurs enable row level security;

create policy "fournisseurs_authenticated" on public.fournisseurs
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 6. PRESCRIPTIONS
-- ============================================================

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('interne', 'externe')),
  date_prescription text not null,
  od_sphere numeric,
  od_cylinder numeric,
  od_axe integer check (od_axe between 0 and 180),
  od_addition numeric,
  og_sphere numeric,
  og_cylinder numeric,
  og_axe integer check (og_axe between 0 and 180),
  og_addition numeric,
  correction_par text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.prescriptions to authenticated;
grant all on public.prescriptions to service_role;

alter table public.prescriptions enable row level security;

create policy "prescriptions_authenticated" on public.prescriptions
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 7. COMMANDES
-- ============================================================

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero_commande text,
  status text not null default 'commande_creee',
  type text not null,
  date_livraison text,
  montant numeric not null default 0,
  avance numeric not null default 0,
  reste numeric not null default 0,
  urgent boolean not null default false,
  eyes_ordered text default 'both',
  od_received_at timestamptz,
  og_received_at timestamptz,
  client_id uuid not null references public.clients(id),
  prescription_id uuid references public.prescriptions(id),
  fournisseur_id uuid references public.fournisseurs(id),
  caisse_id uuid,
  monture_source text,
  monture_marque text,
  monture_client_provided boolean,
  monture_client_called_at timestamptz,
  monture_client_called_by uuid references auth.users(id),
  monture_client_received_at timestamptz,
  monture_client_received_by uuid references auth.users(id),
  type_verres text,
  lentilles text,
  quantite integer not null default 1,
  notes text,
  based_on_id uuid,
  casse_eye text,
  casse_note text,
  casse_at timestamptz,
  casse_by uuid references auth.users(id),
  reception_client_called_at timestamptz,
  reception_client_called_by uuid references auth.users(id),
  od_sphere numeric,
  od_cylinder numeric,
  od_axe integer check (od_axe between 0 and 180),
  od_addition numeric,
  og_sphere numeric,
  og_cylinder numeric,
  og_axe integer check (og_axe between 0 and 180),
  og_addition numeric,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.commandes to authenticated;
grant all on public.commandes to service_role;

alter table public.commandes enable row level security;

create policy "commandes_authenticated" on public.commandes
  for all to authenticated using (true) with check (true);

-- Auto-generate numero_commande from id if not provided
create or replace function public.set_commande_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero_commande is null then
    new.numero_commande := 'CMD-' || substr(new.id::text, 1, 8);
  end if;
  return new;
end;
$$;

create trigger trg_set_commande_numero
  before insert on public.commandes
  for each row
  execute function public.set_commande_numero();

-- ============================================================
-- 8. PROGRESSIVE MEASUREMENTS
-- ============================================================

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

create policy "progressive_measurements_authenticated" on public.progressive_measurements
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 9. CAISSES
-- ============================================================

create table public.caisses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  opening_balance numeric not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz,
  opened_by uuid references auth.users(id),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  closing_balance numeric,
  auto_close_at timestamptz,
  auto_closed boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.caisses to authenticated;
grant all on public.caisses to service_role;

alter table public.caisses enable row level security;

create policy "caisses_authenticated" on public.caisses
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 10. TRANSACTIONS
-- ============================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  caisse_id uuid not null references public.caisses(id),
  type text not null check (type in ('entree', 'sortie')),
  amount numeric not null default 0,
  description text,
  created_by uuid references auth.users(id),
  is_manual boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;

alter table public.transactions enable row level security;

create policy "transactions_authenticated" on public.transactions
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 11. VERSEMENTS
-- ============================================================

create table public.versements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  commande_id uuid references public.commandes(id),
  caisse_id uuid references public.caisses(id),
  amount numeric not null default 0,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.versements to authenticated;
grant all on public.versements to service_role;

alter table public.versements enable row level security;

create policy "versements_authenticated" on public.versements
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 12. ORDER HISTORY
-- ============================================================

create table public.order_history (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id)
);

grant select, insert, update, delete on public.order_history to authenticated;
grant all on public.order_history to service_role;

alter table public.order_history enable row level security;

create policy "order_history_authenticated" on public.order_history
  for all to authenticated using (true) with check (true);
