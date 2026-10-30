-- Oct 30 (Khalil): verified badge, 3-company cap on website requests,
-- free visits across all of South Jersey.

-- Verification: a pro is "Verified" only once Khalil has checked an uploaded
-- HIC registration or insurance certificate (or vouched manually, recorded).
alter table public.roofers
  add column if not exists insurance_path text not null default '',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_method text not null default '';

-- Website requests go to at most 3 companies: verified first, then closest.
-- (Road Pro estimate jobs are separate: one contractor, chosen by JHP.)
create or replace function public.match_lead(p_lead_id uuid)
returns integer language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_zip text; v_trade text; v_lat double precision; v_lng double precision; v_count integer := 0;
begin
  select l.zip, l.trade into v_zip, v_trade from public.leads l where l.id = p_lead_id;
  if v_zip is null then return 0; end if;
  select z.lat, z.lng into v_lat, v_lng from public.nj_zips z where z.zip = v_zip;
  if v_lat is null then return 0; end if;

  with candidate as (
    select r.id as roofer_id, r.radius_miles, r.verified_at,
           min(point(v_lng, v_lat) <@> point(rz.lng, rz.lat)) as dist
    from public.roofers r
    join lateral unnest(r.service_zips) as sz(zip) on true
    join public.nj_zips rz on rz.zip = sz.zip
    where r.status = 'approved' and r.leads_enabled and r.trade = v_trade
    group by r.id, r.radius_miles, r.verified_at
  ), picked as (
    select roofer_id, dist from candidate
    where dist <= radius_miles
    order by (verified_at is null), dist
    limit 3
  )
  insert into public.lead_matches (lead_id, roofer_id, distance_miles)
  select p_lead_id, roofer_id, round(dist::numeric, 2) from picked
  on conflict (lead_id, roofer_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- True only while every pro currently receiving requests is verified, and
-- there is at least one. The homepage line shows only when this is true.
create or replace function public.all_pros_verified()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.roofers where status = 'approved' and leads_enabled)
     and not exists (select 1 from public.roofers where status = 'approved' and leads_enabled and verified_at is null);
$$;

-- Free-visit area = South Jersey by ZIP prefix (Camden, Gloucester,
-- Burlington, Salem, Cumberland, Atlantic, Cape May, Ocean) plus Burlington
-- towns that use 085xx/086xx ZIPs.
alter table public.estimator_settings
  add column if not exists visit_zip_prefixes text[] not null default array['080','081','082','083','084','087'],
  add column if not exists visit_extra_zips text[] not null default array['08505','08511','08515','08518','08554','08562','08640','08641'];

create or replace function public.visit_area(p_zip text)
returns boolean language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select coalesce((
    select (left(p_zip, 3) = any(s.visit_zip_prefixes) or p_zip = any(s.visit_extra_zips))
           and exists (select 1 from public.nj_zips z where z.zip = p_zip)
    from public.estimator_settings s where s.id = 1
  ), false);
$$;

-- The offer shows only where a cleared Road Pro actually lives within range,
-- so nobody in Cape May books a visit no one can drive to.
create or replace function public.visit_offered(p_zip text, p_trade text)
returns boolean language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select coalesce((
    select s.visits_on and p_trade = any(s.visit_trades) and public.visit_area(p_zip)
       and public.nearest_rep(p_zip) is not null
    from public.estimator_settings s where s.id = 1
  ), false);
$$;
revoke all on function public.all_pros_verified() from public, anon, authenticated;
