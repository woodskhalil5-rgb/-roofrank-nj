-- Unclaimed directory listings, state registration checks, claims, and
-- paid lead access. Additive except for widening one CHECK and adding one
-- condition to match_lead.

-- 'unclaimed' = a real company listed from public records that has not
-- joined. It can never be matched: match_lead requires status = 'approved'.
alter table public.roofers drop constraint if exists roofers_status_check;
alter table public.roofers add constraint roofers_status_check
  check (status in ('pending', 'approved', 'rejected', 'unclaimed'));

alter table public.roofers
  -- Paid lead access. A claimed company is approved (dashboard, profile) but
  -- receives no requests until this is on. Existing providers keep the
  -- access they already had, hence the default.
  add column if not exists leads_enabled boolean not null default true,
  -- Where the row came from: their own application, or public records.
  add column if not exists source text not null default 'application'
    check (source in ('application', 'public_records')),
  add column if not exists city text not null default '',
  -- The state registration check. Shown on the profile only when
  -- license_checked_at is set, and always with its date: it is a record of
  -- what the state register said that day, not a guarantee.
  add column if not exists license_label text not null default '',
  add column if not exists license_number text not null default '',
  add column if not exists license_status text not null default '',
  add column if not exists license_checked_at timestamptz;

-- A company asking to take over its unclaimed listing. Verified by the
-- operator before anything is handed over.
create table if not exists public.claims (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  roofer_id             uuid not null references public.roofers(id) on delete cascade,
  contact               text not null,
  email                 text not null,
  phone                 text not null,
  role                  text not null default '',
  status                text not null default 'new'
                          check (status in ('new', 'approved', 'rejected')),
  ip                    text not null default '',
  operator_notified_at  timestamptz,
  operator_notify_error text
);
alter table public.claims enable row level security;
create index if not exists claims_created_idx on public.claims (created_at desc);

-- Matching now also requires paid lead access.
create or replace function public.match_lead(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_zip   text;
  v_trade text;
  v_lat   double precision;
  v_lng   double precision;
  v_count integer := 0;
begin
  select l.zip, l.trade into v_zip, v_trade from public.leads l where l.id = p_lead_id;
  if v_zip is null then return 0; end if;

  select z.lat, z.lng into v_lat, v_lng from public.nj_zips z where z.zip = v_zip;
  if v_lat is null then return 0; end if;

  with candidate as (
    select r.id as roofer_id,
           min(point(v_lng, v_lat) <@> point(rz.lng, rz.lat)) as dist
    from public.roofers r
    join lateral unnest(r.service_zips) as sz(zip) on true
    join public.nj_zips rz on rz.zip = sz.zip
    where r.status = 'approved'
      and r.leads_enabled
      and r.trade = v_trade
    group by r.id
  )
  insert into public.lead_matches (lead_id, roofer_id, distance_miles)
  select p_lead_id, c.roofer_id, round(c.dist::numeric, 2)
  from candidate c
  join public.roofers r on r.id = c.roofer_id
  where c.dist <= r.radius_miles
  on conflict (lead_id, roofer_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- The directory shows approved and unclaimed listings.
create or replace function public.directory_search(p_zip text, p_trade text)
returns table (id uuid, distance_miles numeric)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_lat double precision;
  v_lng double precision;
begin
  select z.lat, z.lng into v_lat, v_lng from public.nj_zips z where z.zip = p_zip;
  if v_lat is null then return; end if;

  return query
  with candidate as (
    select r.id as rid,
           min(point(v_lng, v_lat) <@> point(rz.lng, rz.lat)) as dist
    from public.roofers r
    join lateral unnest(r.service_zips) as sz(zip) on true
    join public.nj_zips rz on rz.zip = sz.zip
    where r.status in ('approved', 'unclaimed')
      and r.listed
      and r.slug is not null
      and (p_trade is null or r.trade = p_trade)
    group by r.id
  )
  select c.rid, round(c.dist::numeric, 1)
  from candidate c
  join public.roofers r on r.id = c.rid
  where c.dist <= r.radius_miles
  order by c.dist;
end;
$function$;

-- Real homeowner requests in a provider's trade and area over the last
-- p_days days. Spam excluded. This is the number a claim pitch may quote.
create or replace function public.area_demand(p_roofer_id uuid, p_days integer)
returns integer
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select count(distinct l.id)::integer
  from public.roofers r
  join lateral unnest(r.service_zips) as sz(zip) on true
  join public.nj_zips rz on rz.zip = sz.zip
  join public.leads l on l.trade = r.trade
                     and l.status <> 'spam'
                     and l.created_at >= now() - make_interval(days => p_days)
  join public.nj_zips lz on lz.zip = l.zip
  where r.id = p_roofer_id
    and (point(lz.lng, lz.lat) <@> point(rz.lng, rz.lat)) <= r.radius_miles;
$function$;
