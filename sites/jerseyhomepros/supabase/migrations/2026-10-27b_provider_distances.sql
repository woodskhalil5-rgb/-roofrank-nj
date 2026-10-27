-- For the estimator's contractor picker: how far each approved company in a
-- trade is from a ZIP (nearest of its service ZIPs) and whether that is inside
-- its own radius. Same distance test as match_lead / available_providers.
create or replace function public.provider_distances(p_zip text, p_trade text)
returns table (roofer_id uuid, miles double precision, covers boolean)
language plpgsql stable security definer
set search_path to 'public', 'extensions'
as $$
declare v_lat double precision; v_lng double precision;
begin
  select z.lat, z.lng into v_lat, v_lng from public.nj_zips z where z.zip = p_zip;
  if v_lat is null then return; end if;
  return query
    select r.id, min(point(v_lng, v_lat) <@> point(rz.lng, rz.lat))::double precision,
           min(point(v_lng, v_lat) <@> point(rz.lng, rz.lat)) <= r.radius_miles
    from public.roofers r
    join lateral unnest(r.service_zips) as sz(zip) on true
    join public.nj_zips rz on rz.zip = sz.zip
    where r.status = 'approved' and r.trade = p_trade
    group by r.id, r.radius_miles;
end;
$$;
revoke all on function public.provider_distances(text, text) from public, anon, authenticated;
