-- =========================================================
-- ENUMS
-- =========================================================
create type public.app_role as enum ('admin', 'agent_vente', 'agent_montage');
create type public.caisse_status as enum ('open', 'closed');
create type public.tx_type as enum ('entree', 'sortie');
create type public.prescription_type as enum ('interne', 'externe');
create type public.commande_type as enum ('vision_loin','vision_pres','double_foyer','progressif','lentilles');
create type public.commande_status as enum (
  'commande_creee','verre_commande','verre_recu','en_montage',
  'casse_montage','finalise','en_reception','livree'
);
create type public.monture_source as enum ('boutique','donnee');
create type public.personnel_status as enum ('active','suspended');
create type public.casse_eye as enum ('od','og','both');

-- =========================================================
-- updated_at helper
-- =========================================================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- USER ROLES + has_role
-- =========================================================
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
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role(_user_id, 'admin'::public.app_role); $$;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

create policy "Users read own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "Admins manage roles"
  on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =========================================================
-- PERSONNEL
-- =========================================================
create table public.personnel (
  id uuid primary key,
  name text not null,
  email text not null unique,
  role public.app_role not null,
  status public.personnel_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.personnel to authenticated;
grant all on public.personnel to service_role;

alter table public.personnel enable row level security;

create policy "Authenticated read personnel"
  on public.personnel for select to authenticated using (true);

create policy "Admins manage personnel"
  on public.personnel for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create trigger trg_personnel_updated_at
before update on public.personnel
for each row execute function public.update_updated_at_column();

-- =========================================================
-- CLIENTS
-- =========================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  date_naissance date not null,
  email text not null,
  telephone text not null,
  adresse text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;

alter table public.clients enable row level security;

create policy "Vente or admin read clients"
  on public.clients for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));

create policy "Vente or admin write clients"
  on public.clients for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Vente or admin update clients"
  on public.clients for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Vente or admin delete clients"
  on public.clients for delete to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.update_updated_at_column();

-- =========================================================
-- FOURNISSEURS
-- =========================================================
create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text not null,
  telephone text not null,
  whatsapp text,
  adresse text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.fournisseurs to authenticated;
grant all on public.fournisseurs to service_role;

alter table public.fournisseurs enable row level security;

create policy "Auth read fournisseurs"
  on public.fournisseurs for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Admins manage fournisseurs"
  on public.fournisseurs for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create trigger trg_fournisseurs_updated_at
before update on public.fournisseurs
for each row execute function public.update_updated_at_column();

-- =========================================================
-- PRESCRIPTIONS
-- =========================================================
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
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.prescriptions(client_id);

grant select, insert, update, delete on public.prescriptions to authenticated;
grant all on public.prescriptions to service_role;

alter table public.prescriptions enable row level security;

create policy "Roles read prescriptions"
  on public.prescriptions for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );

create policy "Vente or admin insert prescriptions"
  on public.prescriptions for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Vente or admin update prescriptions"
  on public.prescriptions for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Vente or admin delete prescriptions"
  on public.prescriptions for delete to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create trigger trg_prescriptions_updated_at
before update on public.prescriptions
for each row execute function public.update_updated_at_column();

-- =========================================================
-- CAISSES
-- =========================================================
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index caisses_only_one_open
  on public.caisses (status) where status = 'open';

grant select, insert, update, delete on public.caisses to authenticated;
grant all on public.caisses to service_role;

alter table public.caisses enable row level security;

create policy "Caisse roles read"
  on public.caisses for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente') or public.has_role(auth.uid(),'agent_montage'));

create policy "Caisse roles write"
  on public.caisses for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Caisse roles update"
  on public.caisses for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Admin delete caisses"
  on public.caisses for delete to authenticated
  using (public.is_admin(auth.uid()));

create trigger trg_caisses_updated_at
before update on public.caisses
for each row execute function public.update_updated_at_column();

-- =========================================================
-- TRANSACTIONS
-- =========================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  caisse_id uuid not null references public.caisses(id) on delete cascade,
  type public.tx_type not null,
  amount numeric not null,
  description text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index on public.transactions(caisse_id);

grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;

alter table public.transactions enable row level security;

create policy "Tx roles read"
  on public.transactions for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Tx roles write"
  on public.transactions for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Tx admin update"
  on public.transactions for update to authenticated
  using (public.is_admin(auth.uid()));

create policy "Tx admin delete"
  on public.transactions for delete to authenticated
  using (public.is_admin(auth.uid()));

-- =========================================================
-- COMMANDES
-- =========================================================
create sequence public.commandes_numero_seq;

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero_commande text unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  fournisseur_id uuid references public.fournisseurs(id) on delete set null,
  caisse_id uuid references public.caisses(id) on delete set null,
  type public.commande_type,
  date_livraison date,
  montant numeric not null default 0,
  avance numeric not null default 0,
  reste numeric generated always as (montant - avance) stored,
  monture_source public.monture_source,
  monture_marque text,
  monture_client_provided boolean,
  monture_client_called_at timestamptz,
  monture_client_received_at timestamptz,
  reception_client_called_at timestamptz,
  reception_client_called_by uuid,
  type_verres text,
  lentilles text,
  quantite integer not null default 1,
  notes text,
  urgent boolean not null default false,
  od_sphere numeric, od_cylinder numeric, od_axe integer, od_addition numeric,
  og_sphere numeric, og_cylinder numeric, og_axe integer, og_addition numeric,
  status public.commande_status not null default 'commande_creee',
  casse_eye public.casse_eye,
  casse_note text,
  casse_at timestamptz,
  casse_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.commandes(client_id);
create index on public.commandes(status);
create index on public.commandes(caisse_id);

create or replace function public.set_commande_numero()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.numero_commande is null then
    new.numero_commande := 'CMD-' || lpad(nextval('public.commandes_numero_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_commande_numero
before insert on public.commandes
for each row execute function public.set_commande_numero();

create trigger trg_commandes_updated_at
before update on public.commandes
for each row execute function public.update_updated_at_column();

grant select, insert, update, delete on public.commandes to authenticated;
grant all on public.commandes to service_role;

alter table public.commandes enable row level security;

create policy "Cmd roles read"
  on public.commandes for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );

create policy "Cmd vente insert"
  on public.commandes for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Cmd roles update"
  on public.commandes for update to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );

create policy "Cmd admin delete"
  on public.commandes for delete to authenticated
  using (public.is_admin(auth.uid()));

-- =========================================================
-- ORDER HISTORY
-- =========================================================
create table public.order_history (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index on public.order_history(commande_id);

grant select, insert on public.order_history to authenticated;
grant all on public.order_history to service_role;

alter table public.order_history enable row level security;

create policy "Order history read"
  on public.order_history for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );

create policy "Order history insert"
  on public.order_history for insert to authenticated
  with check (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );

-- =========================================================
-- PROGRESSIVE MEASUREMENTS
-- =========================================================
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.progressive_measurements to authenticated;
grant all on public.progressive_measurements to service_role;

alter table public.progressive_measurements enable row level security;

create policy "Progressive read"
  on public.progressive_measurements for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );

create policy "Progressive write"
  on public.progressive_measurements for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Progressive update"
  on public.progressive_measurements for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create trigger trg_progressive_updated_at
before update on public.progressive_measurements
for each row execute function public.update_updated_at_column();

-- =========================================================
-- VERSEMENTS (partial payments toward an order / debt settlements)
-- =========================================================
create table public.versements (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  caisse_id uuid references public.caisses(id) on delete set null,
  amount numeric not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index on public.versements(commande_id);

grant select, insert, update, delete on public.versements to authenticated;
grant all on public.versements to service_role;

alter table public.versements enable row level security;

create policy "Versements read"
  on public.versements for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'agent_vente')
    or public.has_role(auth.uid(),'agent_montage')
  );

create policy "Versements insert"
  on public.versements for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent_vente'));

create policy "Versements update"
  on public.versements for update to authenticated
  using (public.is_admin(auth.uid()));

create policy "Versements delete"
  on public.versements for delete to authenticated
  using (public.is_admin(auth.uid()));

-- =========================================================
-- SEED DEMO ACCOUNTS (password: "password")
-- =========================================================
do $seed$
declare
  accounts jsonb := '[
    {"email":"admin@demo.local","role":"admin","name":"Admin Demo"},
    {"email":"vente@demo.local","role":"agent_vente","name":"Vente Demo"},
    {"email":"montage@demo.local","role":"agent_montage","name":"Montage Demo"}
  ]'::jsonb;
  acc jsonb;
  uid uuid;
begin
  for acc in select * from jsonb_array_elements(accounts) loop
    select id into uid from auth.users where email = acc->>'email' limit 1;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
        recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        acc->>'email', crypt('password', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, '', '', '', ''
      );
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
      values (gen_random_uuid(), uid,
        jsonb_build_object('sub', uid::text, 'email', acc->>'email'),
        'email', uid::text, now(), now(), now());
    end if;
    insert into public.user_roles (user_id, role)
    values (uid, (acc->>'role')::public.app_role)
    on conflict (user_id, role) do nothing;
    insert into public.personnel (id, name, email, role, status)
    values (uid, acc->>'name', acc->>'email', (acc->>'role')::public.app_role, 'active')
    on conflict (id) do update set role = excluded.role, status = 'active';
  end loop;
end $seed$;