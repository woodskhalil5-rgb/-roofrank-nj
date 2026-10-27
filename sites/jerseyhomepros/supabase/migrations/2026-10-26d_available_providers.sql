-- How many companies would actually receive a request for this trade + ZIP
-- right now. Same predicate as match_lead. NULL when the ZIP isn't a NJ ZIP.
create or replace function public.available_providers(p_zip text, p_trade text)
returns integer
language plpgsql stable security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_count integer;
begin
  select z.lat, z.lng into v_lat, v_lng from public.nj_zips z where z.zip = p_zip;
  if v_lat is null then return null; end if;

  select count(*) into v_count from (
    select r.id
    from public.roofers r
    join lateral unnest(r.service_zips) as sz(zip) on true
    join public.nj_zips rz on rz.zip = sz.zip
    where r.status = 'approved' and r.leads_enabled and r.trade = p_trade
    group by r.id, r.radius_miles
    having min(point(v_lng, v_lat) <@> point(rz.lng, rz.lat)) <= r.radius_miles
  ) c;
  return v_count;
end;
$$;
revoke all on function public.available_providers(text, text) from public, anon, authenticated;
