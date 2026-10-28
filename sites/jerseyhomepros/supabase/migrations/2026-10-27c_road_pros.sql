-- Road Pros (commission field reps), free site-visit bookings, settings.

create table if not exists public.estimator_settings (
  id int primary key default 1 check (id = 1),
  updated_at timestamptz not null default now(),
  -- The "free estimate from a JHP Road Pro" offer only shows when this is on,
  -- the ZIP is inside the area, the trade is listed, AND at least one active,
  -- background-cleared Road Pro exists. Off until Khalil turns it on.
  visits_on boolean not null default false,
  base_zip text not null default '08034' check (base_zip ~ '^[0-9]{5}$'),
  radius_miles int not null default 25 check (radius_miles between 1 and 150),
  visit_trades text[] not null default array['roofing', 'hvac', 'hardscaping', 'windows', 'landscaping'],
  -- Default Road Pro cut, as a % of what JHP earns on the job (not of the job).
  rep_commission_pct numeric(5,2) check (rep_commission_pct is null or rep_commission_pct between 0 and 100)
);
insert into public.estimator_settings (id) values (1) on conflict do nothing;
alter table public.estimator_settings enable row level security;

create table if not exists public.road_pros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 120),
  email text not null unique,
  phone text not null default '',
  active boolean not null default true,
  -- Visits can only be assigned to a Road Pro whose check is 'clear'.
  bg_status text not null default 'pending' check (bg_status in ('pending', 'clear', 'not_clear')),
  bg_checked_at timestamptz,
  bg_provider text not null default '',
  commission_pct numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  auth_user_id uuid unique,
  setup_token_hash text,
  setup_token_expires timestamptz
);
alter table public.road_pros enable row level security;

alter table public.estimates drop constraint if exists estimates_status_check;
alter table public.estimates add constraint estimates_status_check
  check (status in ('requested', 'draft', 'sent', 'signed', 'lost'));
alter table public.estimates
  add column if not exists source text not null default 'estimator' check (source in ('estimator', 'booking')),
  add column if not exists visit_times text not null default '',
  add column if not exists consent_text text not null default '',
  add column if not exists rep_id uuid references public.road_pros(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists visited_at timestamptz,
  add column if not exists help_requested_at timestamptz,
  add column if not exists checklist jsonb not null default '{}'::jsonb,
  -- Copied when assigned, so later changes to the default never rewrite a deal.
  add column if not exists rep_commission_pct numeric(5,2),
  add column if not exists rep_paid_at timestamptz;
create index if not exists estimates_rep_idx on public.estimates (rep_id);

-- Is this ZIP inside the Road Pro area (distance from the base ZIP)?
create or replace function public.visit_area(p_zip text)
returns boolean language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select coalesce((
    select (point(b.lng, b.lat) <@> point(z.lng, z.lat)) <= s.radius_miles
    from public.estimator_settings s
    join public.nj_zips b on b.zip = s.base_zip
    join public.nj_zips z on z.zip = p_zip
    where s.id = 1
  ), false);
$$;
revoke all on function public.visit_area(text) from public, anon, authenticated;

-- Should the free-visit offer show for this ZIP + trade right now?
create or replace function public.visit_offered(p_zip text, p_trade text)
returns boolean language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select coalesce((
    select s.visits_on and p_trade = any(s.visit_trades) and public.visit_area(p_zip)
       and exists (select 1 from public.road_pros r where r.active and r.bg_status = 'clear')
    from public.estimator_settings s where s.id = 1
  ), false);
$$;
revoke all on function public.visit_offered(text, text) from public, anon, authenticated;
