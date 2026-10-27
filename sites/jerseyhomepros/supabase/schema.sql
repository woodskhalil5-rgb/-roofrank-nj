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
  operator_notify_error text,
  -- Resend message ids, one per recipient. operator_notified_at only means
  -- Resend accepted the message; these are what /api/health/alerts uses to
  -- ask whether it was actually delivered or bounced afterwards.
  operator_notify_ids   text[],

  -- Proof the contractor was sent the contact rules. Approving them is what
  -- starts leads flowing, and the welcome email is the only place the calling
  -- rules are stated, so "approved but never welcomed" is a contractor
  -- phoning homeowners under rules nobody sent them. /admin shows this.
  approved_at   timestamptz,
  welcomed_at   timestamptz,
  welcome_error text,
  welcome_ids   text[]
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
  -- and when it does these columns are the only record that the request
  -- reached anybody at all. Do not remove: an unmatched lead with no operator
  -- alert is a lead that silently disappeared.
  --
  -- operator_notified_at means "Resend accepted the message", NOT "it arrived".
  -- Mail to a domain with no mailbox is accepted and then bounces. The ids
  -- below are how that difference is recovered: /api/health/alerts asks Resend
  -- for each message's delivery event. /admin shows a banner whenever a live
  -- lead has no confirmed alert, which is the one warning about lost leads
  -- that does not itself travel by email.
  operator_notified_at  timestamptz,
  operator_notify_error text,
  operator_notify_ids   text[]
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

-- ----------------------------------------------------------- mail delivery
-- Delivery truth, pushed by Resend rather than polled.
--
-- The Resend API key is restricted to sending, which is the right setting for
-- a key sitting in a web app but means nothing here can ask "was it
-- delivered?". Resend tells us instead, via a webhook at
-- /api/webhooks/resend, and this is where that lands. Without it the only
-- record of an alert is "Resend accepted it", which is not the same thing:
-- mail to a domain with no mailbox is accepted and then bounces.
create table if not exists public.email_events (
  id          bigserial primary key,
  received_at timestamptz not null default now(),
  message_id  text not null,
  event       text not null,
  recipient   text,
  subject     text,
  occurred_at timestamptz,
  payload     jsonb
);
alter table public.email_events enable row level security;

create index if not exists email_events_message_idx on public.email_events (message_id);
create index if not exists email_events_event_idx   on public.email_events (event, received_at desc);
-- Resend retries webhooks, so the same event can arrive twice.
create unique index if not exists email_events_unique_idx
  on public.email_events (message_id, event, coalesce(recipient, ''));

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

-- ===================================================== 2026-10-24
-- Directory, contractor accounts, profile stats, service requests.
-- Applied live as migration directory_and_accounts; copied here so a
-- rebuild produces the same database.

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

-- ===================================================== 2026-10-24 (b)
-- Unclaimed listings, registration checks, claims, paid lead access.
-- Applied live as migration unclaimed_and_claims. The match_lead and
-- directory_search definitions below supersede the earlier ones above.

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

-- ===================================================== 2026-10-26
-- Profile photos and company-provided details. Applied live as
-- migration profile_photos_and_details.
alter table public.roofers
  add column if not exists logo_path text not null default '',
  add column if not exists gallery_paths text[] not null default '{}',
  add column if not exists year_founded integer
    check (year_founded is null or year_founded between 1850 and 2100),
  add column if not exists hours text not null default '',
  add column if not exists towns text not null default '',
  add column if not exists service_list text[] not null default '{}',
  add column if not exists highlights text[] not null default '{}';

-- Public bucket: profile photos are meant to be seen. Writes only happen
-- server-side with the service-role key (no storage policies), so the
-- browser can read but never upload directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pro-photos', 'pro-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ===================================================== 2026-10-26 (b)
-- Landscaping and hardscaping added as trades (separate, per Khalil).
alter table public.roofers drop constraint if exists roofers_trade_check;
alter table public.roofers add constraint roofers_trade_check
  check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping'));
alter table public.leads drop constraint if exists leads_trade_check;
alter table public.leads add constraint leads_trade_check
  check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping'));

-- ===================================================== 2026-10-26 (c)
-- Windows & Doors added as a trade (Khalil: all home-service trades, eventually).
alter table public.roofers drop constraint if exists roofers_trade_check;
alter table public.roofers add constraint roofers_trade_check
  check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping', 'windows'));
alter table public.leads drop constraint if exists leads_trade_check;
alter table public.leads add constraint leads_trade_check
  check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping', 'windows'));

-- ===================================================== 2026-10-26 (d)
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

-- ===================================================== 2026-10-26 (e)
-- Homeowner accounts + Home Board. RLS on, no policies: server-only.
create table if not exists public.homeowners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  zip text,
  reminders boolean not null default false,
  reminders_consent_at timestamptz,
  unsub_token text not null default encode(gen_random_bytes(18), 'hex'),
  last_login_at timestamptz
);
alter table public.homeowners enable row level security;

create table if not exists public.homeowner_login_tokens (
  token_hash text primary key,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  ip text
);
create index if not exists homeowner_login_tokens_email_idx on public.homeowner_login_tokens (email, created_at);
alter table public.homeowner_login_tokens enable row level security;

create table if not exists public.homeowner_sessions (
  token_hash text primary key,
  homeowner_id uuid not null references public.homeowners(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.homeowner_sessions enable row level security;

-- trade is validated in code (isTradeSlug) so adding a trade stays one entry
-- in lib/trades.ts plus the two existing CHECK constraints.
create table if not exists public.home_todos (
  id uuid primary key default gen_random_uuid(),
  homeowner_id uuid not null references public.homeowners(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 160),
  trade text,
  due_date date,
  status text not null default 'open' check (status in ('open','hired','done')),
  source text not null default 'custom' check (source in ('custom','seasonal','request')),
  lead_id uuid references public.leads(id) on delete set null,
  done_at timestamptz,
  reminded_at timestamptz
);
create index if not exists home_todos_owner_idx on public.home_todos (homeowner_id, status);
create unique index if not exists home_todos_lead_uq on public.home_todos (homeowner_id, lead_id) where lead_id is not null;
alter table public.home_todos enable row level security;

alter table public.leads add column if not exists homeowner_id uuid references public.homeowners(id) on delete set null;
alter table public.leads add column if not exists email_verified boolean not null default false;
-- JHP estimator: price book, scoped jobs (estimates) and their photos.
-- Operator-only. RLS on, no policies: reached only through /api/estimator
-- with the service-role key, behind requireAdmin.

create table if not exists public.price_book (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trade text not null check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping', 'windows')),
  item text not null check (length(item) between 1 and 120),
  unit text not null default 'each' check (length(unit) between 1 and 30),
  low numeric(12,2) not null check (low >= 0),
  high numeric(12,2) not null check (high >= low),
  -- Where the number came from ("Adams' rate sheet, Oct 2026"). Prices
  -- without a source are how invented numbers creep in.
  source text not null default '',
  active boolean not null default true
);
alter table public.price_book enable row level security;

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null,
  trade text not null check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping', 'windows')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'lost')),
  -- A = contractor signs the homeowner and pays JHP a percentage.
  -- B = JHP signs the homeowner and subs the work (JHP is the contractor).
  lane text not null default 'A' check (lane in ('A', 'B')),
  homeowner_name text not null default '',
  homeowner_phone text not null default '',
  homeowner_email text not null default '',
  address text not null default '',
  zip text not null default '' check (zip = '' or zip ~ '^[0-9]{5}$'),
  problem text not null default '',
  notes text not null default '',
  -- [{item, unit, qty, low, high}] copied from the price book at the time, so
  -- later price changes never rewrite an estimate that was already given.
  items jsonb not null default '[]'::jsonb,
  range_low numeric(12,2),
  range_high numeric(12,2),
  -- The homeowner's permission to pass their details to ONE contractor, and
  -- how they agreed to be contacted. Sending is refused without it.
  share_consent_at timestamptz,
  contact_method text not null default 'email' check (contact_method in ('email', 'phone_email')),
  roofer_id uuid references public.roofers(id) on delete set null,
  sent_at timestamptz,
  send_error text,
  fee_pct numeric(5,2) check (fee_pct is null or (fee_pct >= 0 and fee_pct <= 100)),
  signed_price numeric(12,2) check (signed_price is null or signed_price >= 0),
  -- Lane B only: what JHP pays the contractor.
  sub_price numeric(12,2) check (sub_price is null or sub_price >= 0),
  signed_at timestamptz,
  fee_paid_at timestamptz,
  lead_id uuid references public.leads(id) on delete set null
);
create index if not exists estimates_created_idx on public.estimates (created_at desc);
alter table public.estimates enable row level security;

create table if not exists public.estimate_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  path text not null
);
create index if not exists estimate_photos_estimate_idx on public.estimate_photos (estimate_id);
alter table public.estimate_photos enable row level security;

-- PRIVATE bucket: these are photos of people's homes. Read only through
-- short-lived signed URLs made server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estimate-photos', 'estimate-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
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
