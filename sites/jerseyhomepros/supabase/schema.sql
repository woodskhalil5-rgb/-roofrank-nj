-- Jersey Home Pros — full database schema.
--
-- Generated from the live database on 2026-10-12. This file is the rebuild
-- path: running it on an empty Postgres must produce a database the app can
-- actually run against. The previous version of this file predated the
-- multi-trade work and had no `trade` column at all, so a rebuild from it
-- would have produced a schema the application could not use.
--
-- Access model: RLS is ON everywhere with NO policies, deliberately. Nothing
-- reaches these tables with the anon key. Every read and write goes through
-- the server using the service-role key, which is why none of this data can
-- be scraped from the browser.
--
-- One table is named `roofers` rather than `providers`: it predates the other
-- trades and renaming it would break live code for no functional gain. It
-- holds providers in every trade.

-- ---------------------------------------------------------------- extensions
-- Geo distance for ZIP-radius matching. Kept out of `public` so the schema
-- stays application-owned; match_lead pins them on its search_path.
create schema if not exists extensions;
create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

-- ------------------------------------------------------------------- lookups
-- Every New Jersey ZIP with a centroid. Matching is impossible without this:
-- a provider ZIP that is not here can never be placed on a map, which is why
-- the join form rejects unknown ZIPs rather than storing them.
create table if not exists public.nj_zips (
  zip    text primary key check (zip ~ '^[0-9]{5}$'),
  city   text not null default '',
  county text not null default '',
  lat    double precision not null,
  lng    double precision not null
);
alter table public.nj_zips enable row level security;

-- ----------------------------------------------------------------- providers
create table if not exists public.roofers (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  company       text not null,
  contact       text not null,
  email         text not null,
  phone         text not null,
  service_zips  text[] not null default '{}',
  radius_miles  integer not null default 25 check (radius_miles between 1 and 100),
  services      text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  notes         text not null default '',
  -- Adding a trade means widening this list and adding an entry to
  -- lib/trades.ts. Nothing else changes.
  trade         text not null default 'roofing'
                  check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning')),

  -- Proof the operator was told this application exists. Applications used to
  -- arrive with no email to anyone, so one was only found by opening /admin.
  operator_notified_at  timestamptz,
  operator_notify_error text
);
alter table public.roofers enable row level security;

create index if not exists roofers_status_idx on public.roofers (status);
create index if not exists roofers_trade_status_idx on public.roofers (trade, status);

-- --------------------------------------------------------------------- leads
-- consent_* columns are the evidence trail. TCPA and CAN-SPAM disputes turn
-- on what the person was actually shown and when, so the exact wording, the
-- version, the IP, the user agent and the timestamp are all stored verbatim
-- rather than reconstructed later from whatever the form says today.
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  name               text not null,
  -- Optional: required only when the homeowner consents to calls and texts.
  phone              text not null default '',
  email              text not null,
  zip                text not null check (zip ~ '^[0-9]{5}$'),
  property_type      text not null,
  service            text not null,
  timing             text not null,
  details            text not null default '',

  -- Sharing consent is the service itself and is always required.
  consent            boolean not null default false,
  -- Phone/text consent is separate and optional: TCPA forbids making it a
  -- condition of service. False here means the provider is told EMAIL ONLY.
  phone_consent      boolean not null default false,
  consent_text       text not null default '',
  consent_version    text not null default '',
  consent_ip         text not null default '',
  consent_user_agent text not null default '',
  consent_at         timestamptz,

  status             text not null default 'new',
  trade              text not null default 'roofing'
                       check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning')),

  -- Homeowner follow-up. The token is the unguessable key in the follow-up
  -- email, so feedback needs no login.
  feedback_token     uuid not null default gen_random_uuid(),
  followup_sent_at   timestamptz,
  feedback           text check (feedback is null or feedback in ('hired', 'deciding', 'no_contact')),
  feedback_at        timestamptz,
  feedback_roofer_id uuid references public.roofers(id) on delete set null,
  unsubscribed       boolean not null default false,

  -- Proof a human was told about this lead. match_lead is allowed to return 0,
  -- and when it does these two columns are the only record that the request
  -- reached anybody at all. Do not remove: an unmatched lead with no operator
  -- alert is a lead that silently disappeared.
  operator_notified_at  timestamptz,
  operator_notify_error text
);
alter table public.leads enable row level security;

create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_trade_idx on public.leads (trade);
create index if not exists leads_phone_consent_idx on public.leads (phone_consent);
create unique index if not exists leads_feedback_token_idx on public.leads (feedback_token);
create index if not exists leads_followup_due_idx on public.leads (created_at)
  where followup_sent_at is null;

-- Serves the 15-minute duplicate-submission check in /api/leads.
create index if not exists leads_dedupe_idx
  on public.leads (lower(email), trade, created_at desc);
-- Serves the per-IP hourly rate limit in /api/leads.
create index if not exists leads_ip_rate_idx on public.leads (consent_ip, created_at desc);
-- Finds leads the operator was never successfully alerted about.
create index if not exists leads_unalerted_idx on public.leads (created_at desc)
  where operator_notified_at is null;

-- ------------------------------------------------------------------- matches
-- One row per provider a lead was sent to. notified_at and notify_error make
-- a failed send visible and retryable instead of silently lost.
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
alter table public.lead_matches enable row level security;

create index if not exists matches_lead_idx on public.lead_matches (lead_id);
create index if not exists matches_roofer_idx on public.lead_matches (roofer_id);

-- -------------------------------------------------- missed-call waitlist
-- Contractor interest in the missed-call recovery product. Not leads: nothing
-- here is matched, routed or shared with anyone.
create table if not exists public.receptionist_waitlist (
  id              uuid primary key default gen_random_uuid(),
  company         text not null,
  contact         text not null,
  email           text not null,
  phone           text not null,
  trade           text,
  missed_estimate text,
  current_setup   text,
  notes           text not null default '',
  status          text not null default 'new'
                    check (status in ('new', 'contacted', 'committed', 'declined')),
  created_at      timestamptz not null default now()
);
alter table public.receptionist_waitlist enable row level security;

create index if not exists receptionist_waitlist_created_at_idx
  on public.receptionist_waitlist (created_at desc);

-- ------------------------------------------------------------------ matching
-- Matches a lead to approved providers IN THE SAME TRADE whose nearest
-- service ZIP falls inside their own radius. A roofing request can never
-- reach a pest company: the trade equality is in the WHERE clause, not in
-- application code that could be bypassed.
--
-- SECURITY DEFINER with a pinned search_path so it runs predictably and
-- cannot be hijacked by a caller's search_path.
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

-- --------------------------------------------------------------- performance
-- Per-provider scorecard for the admin dashboard. Spam leads are excluded so
-- a junk submission cannot drag a provider's numbers down.
create or replace view public.roofer_performance as
  select r.id as roofer_id,
         r.company,
         r.email,
         r.status,
         r.trade,
         count(m.id) as leads_received,
         count(*) filter (where l.feedback is not null) as feedback_received,
         count(*) filter (where l.feedback = 'hired' and l.feedback_roofer_id = r.id) as jobs_won,
         count(*) filter (where l.feedback = 'no_contact') as no_contact_reports,
         count(*) filter (where m.notified_at is null) as unsent_notifications
  from public.roofers r
  left join public.lead_matches m on m.roofer_id = r.id
  left join public.leads l on l.id = m.lead_id and l.status <> 'spam'
  group by r.id, r.company, r.email, r.status, r.trade;

-- NOTE: nj_zips must be populated after this runs. Without it, match_lead
-- returns 0 for every lead and no provider is ever notified.
