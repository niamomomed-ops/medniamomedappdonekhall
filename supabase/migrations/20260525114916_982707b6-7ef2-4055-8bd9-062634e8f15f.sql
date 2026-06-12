
alter table public.commandes
  add column if not exists urgent boolean not null default false,
  add column if not exists od_sphere numeric(6,2),
  add column if not exists od_cylinder numeric(6,2),
  add column if not exists od_axe integer,
  add column if not exists od_addition numeric(6,2),
  add column if not exists og_sphere numeric(6,2),
  add column if not exists og_cylinder numeric(6,2),
  add column if not exists og_axe integer,
  add column if not exists og_addition numeric(6,2);

create index if not exists commandes_urgent_idx on public.commandes (urgent) where urgent = true;
