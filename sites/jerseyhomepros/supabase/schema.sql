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
