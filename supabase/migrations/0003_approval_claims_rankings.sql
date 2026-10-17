-- 0003_approval_claims_rankings.sql
-- Admin approval queue, durable notification outbox, profile claiming,
-- transparent ranking methodology and sponsored placement.

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected', 'changes_requested');
exception when duplicate_object then null; end $$;

do $$ begin
  create type claim_status as enum ('pending', 'verified', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_status as enum ('queued', 'sent', 'failed', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type research_run_status as enum ('running', 'completed', 'failed', 'partial');
exception when duplicate_object then null; end $$;

-- Research runs -------------------------------------------------------------
create table if not exists public.research_run (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null,
  target_zip        text,
  target_query      text,
  requested_by      uuid references public.app_user (id) on delete set null,
  status            research_run_status not null default 'running',
  candidates_found  integer not null default 0,
  drafts_created    integer not null default 0,
  sources_used      jsonb not null default '[]'::jsonb,
  source_errors     jsonb not null default '[]'::jsonb,
  error_message     text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz
);
comment on table public.research_run is
  'One row per research execution, including source errors. The dashboard reports failures rather than hiding them.';

-- Approval queue --------------------------------------------------------------
create table if not exists public.approval_request (
  id                      uuid primary key default gen_random_uuid(),
  subject                 subject_type not null default 'agent',
  subject_id              uuid not null,
  status                  approval_status not null default 'pending',
  requested_by            uuid references public.app_user (id) on delete set null,
  requested_at            timestamptz not null default now(),
  decided_by              uuid references public.app_user (id) on delete set null,
  decided_at              timestamptz,
  decision_notes          text,
  flagged_for_verification boolean not null default false,
  review_token            uuid not null default gen_random_uuid(),
  created_at              timestamptz not null default now()
);
create index if not exists approval_request_status_idx on public.approval_request (status, requested_at desc);
create index if not exists approval_request_subject_idx on public.approval_request (subject, subject_id);

comment on column public.approval_request.review_token is
  'Identifies the review page in a notification link. It is NOT an authorization token - the review page still requires an authenticated admin session.';

-- Durable notification outbox --------------------------------------------------
create table if not exists public.notification_outbox (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,
  recipient           citext not null,
  subject             text not null,
  body_text           text not null,
  related_type        text,
  related_id          uuid,
  status              notification_status not null default 'queued',
  attempts            integer not null default 0,
  max_attempts        integer not null default 6,
  next_attempt_at     timestamptz not null default now(),
  last_error          text,
  provider            text,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, next_attempt_at)
  where status in ('queued', 'failed');

comment on table public.notification_outbox is
  'Email delivery queue with retry. A pending approval is never lost because an email failed - it stays visible in the dashboard regardless of delivery status.';

-- Profile claiming ---------------------------------------------------------
create table if not exists public.profile_claim (
  id                   uuid primary key default gen_random_uuid(),
  agent_id             uuid not null references public.agent (id) on delete cascade,
  claimant_user_id     uuid references public.app_user (id) on delete set null,
  claimant_name        text not null,
  claimant_email       citext not null,
  claimant_phone       text,
  stated_license_number text,
  stated_brokerage     text,
  evidence_url         text,
  verification_method  text,
  status               claim_status not null default 'pending',
  reviewed_by          uuid references public.app_user (id) on delete set null,
  reviewed_at          timestamptz,
  review_notes         text,
  requested_changes    jsonb,
  ip_address           inet,
  user_agent           text,
  created_at           timestamptz not null default now()
);
create index if not exists profile_claim_agent_idx  on public.profile_claim (agent_id, created_at desc);
create index if not exists profile_claim_status_idx on public.profile_claim (status, created_at desc);

comment on table public.profile_claim is
  'Ownership claims. A claim never auto-grants control of a profile; an administrator verifies identity and brokerage affiliation first.';

-- Ranking methodology ------------------------------------------------------
create table if not exists public.ranking_methodology (
  version       text primary key,
  summary       text not null,
  criteria      jsonb not null,
  is_active     boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);
comment on table public.ranking_methodology is
  'Versioned, publicly documented ranking criteria. Public pages cite the active version.';

create table if not exists public.agent_zip_score (
  agent_id              uuid not null references public.agent (id) on delete cascade,
  zip                   text not null,
  methodology_version   text not null references public.ranking_methodology (version) on delete restrict,
  score                 numeric(6,3) not null,
  components            jsonb not null default '{}'::jsonb,
  evidence_completeness numeric(3,2),
  computed_at           timestamptz not null default now(),
  primary key (agent_id, zip, methodology_version)
);
create index if not exists agent_zip_score_zip_idx on public.agent_zip_score (zip, score desc);

comment on column public.agent_zip_score.components is
  'Per-criterion contribution, so the published ranking rationale can be shown and audited.';

-- Sponsored placement (never alters editorial score) -------------------------
create table if not exists public.sponsored_placement (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references public.agent (id) on delete cascade,
  brokerage_id  uuid references public.brokerage (id) on delete cascade,
  zip           text not null,
  label         text not null default 'Sponsored',
  starts_on     date not null,
  ends_on       date not null,
  monthly_value numeric(10,2),
  contract_id   uuid,
  created_by    uuid references public.app_user (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (agent_id is not null or brokerage_id is not null),
  check (ends_on >= starts_on)
);
create index if not exists sponsored_placement_zip_idx on public.sponsored_placement (zip, starts_on, ends_on);

comment on table public.sponsored_placement is
  'Paid placement is stored separately from agent_zip_score so payment cannot change an editorial ranking. Public pages must render these with a visible sponsored label.';

-- RLS -----------------------------------------------------------------------
alter table public.research_run         enable row level security;
alter table public.approval_request     enable row level security;
alter table public.notification_outbox  enable row level security;
alter table public.profile_claim        enable row level security;
alter table public.ranking_methodology  enable row level security;
alter table public.agent_zip_score      enable row level security;
alter table public.sponsored_placement  enable row level security;

create policy research_run_staff on public.research_run
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy approval_request_select_staff on public.approval_request
  for select to authenticated using (public.is_staff());

create policy approval_request_insert_staff on public.approval_request
  for insert to authenticated with check (public.is_staff());

-- Only admins may record a decision.
create policy approval_request_update_admin on public.approval_request
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- The outbox is written and drained server-side only; staff may read it.
create policy notification_outbox_select_staff on public.notification_outbox
  for select to authenticated using (public.is_staff());

-- Anyone may submit a claim; only staff may read or decide on claims.
create policy profile_claim_insert_public on public.profile_claim
  for insert to anon, authenticated with check (true);

create policy profile_claim_select_staff on public.profile_claim
  for select to authenticated using (public.is_staff());

create policy profile_claim_update_admin on public.profile_claim
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Methodology and scores are public so rankings are explainable.
create policy ranking_methodology_select_public on public.ranking_methodology
  for select to anon, authenticated using (true);

create policy ranking_methodology_write_admin on public.ranking_methodology
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy agent_zip_score_select_public on public.agent_zip_score
  for select to anon, authenticated
  using (exists (select 1 from public.agent a where a.id = agent_zip_score.agent_id and a.status = 'published'));

create policy agent_zip_score_staff on public.agent_zip_score
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy sponsored_placement_select_public on public.sponsored_placement
  for select to anon, authenticated
  using (current_date between starts_on and ends_on);

create policy sponsored_placement_write_admin on public.sponsored_placement
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
