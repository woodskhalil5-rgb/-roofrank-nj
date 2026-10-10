-- Destiny Marketing Group LLC — RoofRank/HVACRank/PestRank shared schema
-- Reusable across every vertical. Internal table names stay generic ("roofers")
-- so one schema serves all trades; the public wording comes from lib/site.ts.
--
-- Access model: RLS is enabled on every table with ZERO policies. Nothing is
-- readable or writable with the anon key. All access goes through server routes
-- holding the service-role key. Do not add policies without re-reading this.

create extension if not exists cube with schema public;
create extension if not exists earthdistance with schema public;

-- ---------------------------------------------------------------- providers
create table if not exists public.roofers (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  company       text not null,
  contact       text not null,
  email         text not null,
  phone         text not null,
  service_zips  text[] not null default '{}'::text[],
  radius_miles  integer not null default 25 check (radius_miles >= 1 and radius_miles <= 100),
  services      text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes         text not null default ''
);
create index if not exists roofers_status_idx on public.roofers (status);

-- -------------------------------------------------------------------- zips
create table if not exists public.nj_zips (
  zip    text primary key check (zip ~ '^[0-9]{5}$'),
  city   text not null default '',
  county text not null default '',
  lat    double precision not null,
  lng    double precision not null
);

-- ------------------------------------------------------------------- leads
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null,
  phone         text not null,
  email         text not null,
  zip           text not null check (zip ~ '^[0-9]{5}$'),
  property_type text not null,
  service       text not null,
  timing        text not null,
  details       text not null default '',

  -- Sharing consent: required to submit at all.
  consent       boolean not null default false,
  status        text not null default 'new',

  -- Call/text consent: separate, optional, never a condition of use (TCPA).
  phone_consent boolean not null default false,

  -- Consent evidence. Kept 5 years: TCPA claims run 4 years.
  consent_text       text not null default '',
  consent_version    text not null default '',
  consent_ip         text not null default '',
  consent_user_agent text not null default '',
  consent_at         timestamptz,

  -- Homeowner feedback loop. The token is the only auth on /api/feedback,
  -- so it must stay unguessable and must never appear anywhere public.
  feedback_token     uuid not null default gen_random_uuid(),
  followup_sent_at   timestamptz,
  feedback           text check (feedback is null or feedback in ('hired','deciding','no_contact')),
  feedback_at        timestamptz,
  feedback_roofer_id uuid references public.roofers(id) on delete set null,
  unsubscribed       boolean not null default false
);
create index if not exists leads_created_idx on public.leads (created_at desc);
create unique index if not exists leads_feedback_token_idx on public.leads (feedback_token);
create index if not exists leads_followup_due_idx on public.leads (created_at) where followup_sent_at is null;
create index if not exists leads_phone_consent_idx on public.leads (phone_consent);

-- ----------------------------------------------------------------- matches
create table if not exists public.lead_matches (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  roofer_id      uuid not null references public.roofers(id) on delete cascade,
  distance_miles numeric,
  notified_at    timestamptz,
  notify_error   text,
  unique (lead_id, roofer_id)
);
create index if not exists matches_lead_idx on public.lead_matches (lead_id);
create index if not exists matches_roofer_idx on public.lead_matches (roofer_id);

-- --------------------------------------------------------------------- RLS
alter table public.roofers      enable row level security;
alter table public.nj_zips      enable row level security;
alter table public.leads        enable row level security;
alter table public.lead_matches enable row level security;

-- ---------------------------------------------------------------- matching
-- Nearest serviced ZIP per provider, in miles, against that provider's radius.
create or replace function public.match_lead(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_zip text;
  v_lat double precision;
  v_lng double precision;
  v_count integer := 0;
begin
  select l.zip into v_zip from public.leads l where l.id = p_lead_id;
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

-- SECURITY DEFINER means this bypasses RLS, so it must not be callable over
-- the public REST API. Server routes use the service-role key and are unaffected.
revoke execute on function public.match_lead(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------- performance
-- security_invoker: the view runs with the caller's rights, not the owner's,
-- so it cannot become a side door around RLS.
create or replace view public.roofer_performance with (security_invoker = true) as
select r.id as roofer_id,
       r.company,
       r.email,
       r.status,
       count(m.id) as leads_received,
       count(*) filter (where l.feedback is not null) as feedback_received,
       count(*) filter (where l.feedback = 'hired' and l.feedback_roofer_id = r.id) as jobs_won,
       count(*) filter (where l.feedback = 'no_contact') as no_contact_reports,
       count(*) filter (where m.notified_at is null) as unsent_notifications
from public.roofers r
left join public.lead_matches m on m.roofer_id = r.id
left join public.leads l on l.id = m.lead_id and l.status <> 'spam'
group by r.id, r.company, r.email, r.status;
