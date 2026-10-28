-- Hands-off automations: auto-assign, contractor chasers, Road Pro applicants.

alter table public.road_pros
  add column if not exists home_zip text not null default '' check (home_zip = '' or home_zip ~ '^[0-9]{5}$');

alter table public.estimator_settings
  add column if not exists auto_assign boolean not null default true,
  add column if not exists max_assign_miles int not null default 40 check (max_assign_miles between 1 and 150);

alter table public.estimates
  add column if not exists chase_count int not null default 0,
  add column if not exists last_chase_at timestamptz,
  add column if not exists fee_notice_count int not null default 0,
  add column if not exists last_fee_notice_at timestamptz;

-- Nearest active, background-cleared Road Pro to a ZIP (from their home ZIP),
-- within the settings' max distance; fewest open visits first, then closest.
create or replace function public.nearest_rep(p_zip text)
returns uuid language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select r.id
  from public.road_pros r
  join public.nj_zips h on h.zip = r.home_zip
  join public.nj_zips z on z.zip = p_zip
  cross join public.estimator_settings s
  where s.id = 1 and r.active and r.bg_status = 'clear'
    and (point(h.lng, h.lat) <@> point(z.lng, z.lat)) <= s.max_assign_miles
  order by (select count(*) from public.estimates e
            where e.rep_id = r.id and e.status in ('requested', 'draft') and e.visited_at is null),
           (point(h.lng, h.lat) <@> point(z.lng, z.lat))
  limit 1;
$$;
revoke all on function public.nearest_rep(text) from public, anon, authenticated;

create table if not exists public.road_pro_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 120),
  email text not null,
  phone text not null default '',
  home_zip text not null default '' check (home_zip = '' or home_zip ~ '^[0-9]{5}$'),
  has_car boolean not null default false,
  availability text not null default '',
  experience text not null default '',
  consent_text text not null default '',
  status text not null default 'new' check (status in ('new', 'added', 'declined')),
  road_pro_id uuid references public.road_pros(id) on delete set null
);
create index if not exists road_pro_applications_created_idx on public.road_pro_applications (created_at desc);
alter table public.road_pro_applications enable row level security;

-- Morning briefing call list rotation
alter table public.roofers add column if not exists call_suggested_at timestamptz;
