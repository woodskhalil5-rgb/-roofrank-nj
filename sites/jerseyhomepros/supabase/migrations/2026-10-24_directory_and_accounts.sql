-- Directory profiles, contractor accounts, profile stats, service requests.
-- Additive only: no existing column changes meaning, nothing is dropped.

-- ------------------------------------------------------ provider profiles
alter table public.roofers
  -- Public URL key for /pros/<slug>. Null until the provider is approved and
  -- given one; unique so two companies can never share a page.
  add column if not exists slug text unique
    check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Directory visibility. Off by default: a company that applied to receive
  -- leads did not thereby agree to a public page. The operator or the
  -- contractor turns it on.
  add column if not exists listed boolean not null default false,
  add column if not exists bio text not null default '',
  add column if not exists website text not null default '',
  -- Link to the Supabase auth user that may sign in to /account as this
  -- provider. One account per provider.
  add column if not exists auth_user_id uuid unique,
  -- Account setup / password reset, sent by our own mail rather than
  -- Supabase's, so it does not depend on the auth Site URL or its rate limit.
  -- Only a SHA-256 of the token is stored.
  add column if not exists setup_token_hash text,
  add column if not exists setup_token_expires timestamptz;

create index if not exists roofers_listed_idx on public.roofers (trade)
  where listed and status = 'approved';

-- ----------------------------------------------------------- profile stats
-- What a contractor's dashboard counts. `visitor` is a salted hash of the
-- IP and the day, so a repeat view the same day can be told apart without
-- storing anyone's address.
create table if not exists public.profile_events (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  roofer_id  uuid not null references public.roofers(id) on delete cascade,
  kind       text not null check (kind in ('view', 'request_click', 'website_click')),
  visitor    text not null default ''
);
alter table public.profile_events enable row level security;
create index if not exists profile_events_roofer_idx
  on public.profile_events (roofer_id, kind, created_at desc);

-- ---------------------------------------------------- lead attribution
-- Set when the homeowner started from a contractor's profile. Attribution
-- only: matching is unchanged, so a request still goes only to companies
-- that serve the homeowner's ZIP.
alter table public.leads
  add column if not exists requested_roofer_id uuid
    references public.roofers(id) on delete set null;

-- ------------------------------------------------------ service requests
-- A contractor asking Destiny Marketing Group for more: more leads, or
-- marketing work. Reaches the operator by alert email and /admin.
create table if not exists public.service_requests (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  roofer_id             uuid not null references public.roofers(id) on delete cascade,
  kind                  text not null check (kind in ('more_leads', 'marketing')),
  items                 text[] not null default '{}',
  details               text not null default '',
  status                text not null default 'new'
                          check (status in ('new', 'contacted', 'done')),
  operator_notified_at  timestamptz,
  operator_notify_error text
);
alter table public.service_requests enable row level security;
create index if not exists service_requests_created_idx
  on public.service_requests (created_at desc);

-- ------------------------------------------------------- directory search
-- Listed, approved providers in a trade whose nearest service ZIP is within
-- their own radius of the searched ZIP: the same test match_lead applies, so
-- the directory never shows a company a request from that ZIP would not reach.
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
    where r.status = 'approved'
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

-- Slugs for providers already approved, so the operator can list them
-- straight away. Ties get a numeric suffix.
with base as (
  select id,
         trim(both '-' from regexp_replace(lower(company), '[^a-z0-9]+', '-', 'g')) as s,
         row_number() over (
           partition by trim(both '-' from regexp_replace(lower(company), '[^a-z0-9]+', '-', 'g'))
           order by created_at
         ) as n
  from public.roofers
  where status = 'approved' and slug is null
)
update public.roofers r
set slug = case when b.n = 1 then b.s else b.s || '-' || b.n end
from base b
where r.id = b.id and b.s <> '';
