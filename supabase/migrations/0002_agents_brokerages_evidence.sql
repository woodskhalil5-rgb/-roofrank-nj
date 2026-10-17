-- 0002_agents_brokerages_evidence.sql
-- Agents, brokerages, geography, permitted sources, per-field evidence,
-- and the database-level publication gate.

do $$ begin
  create type agent_status as enum (
    'draft', 'pending_review', 'changes_requested', 'rejected',
    'approved', 'published', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum (
    'verified', 'self_reported', 'third_party', 'ai_generated', 'unverified'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type evidence_method as enum ('manual', 'api', 'document', 'llm_extraction');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subject_type as enum ('agent', 'brokerage');
exception when duplicate_object then null; end $$;

-- Geography -----------------------------------------------------------------
create table if not exists public.zip_area (
  zip           text primary key check (zip ~ '^[0-9]{5}$'),
  primary_city  text not null,
  county        text,
  state         char(2) not null default 'NJ',
  is_target     boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now()
);
comment on column public.zip_area.is_target is
  'Only target ZIPs get public discovery pages. Prevents mass-publishing thin pages.';

-- Permitted data sources ----------------------------------------------------
create table if not exists public.research_source (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  base_url                text,
  source_type             text not null,
  terms_url               text,
  commercial_use_allowed  boolean,
  republication_allowed   boolean,
  terms_reviewed_at       date,
  terms_reviewed_by       text,
  is_enabled              boolean not null default false,
  restrictions            text,
  created_at              timestamptz not null default now()
);
comment on table public.research_source is
  'Registry of data sources. is_enabled stays false until terms of use have been reviewed and recorded. The research pipeline refuses disabled sources.';

-- Brokerages ----------------------------------------------------------------
create table if not exists public.brokerage (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  legal_name          text,
  street_address      text,
  city                text,
  state               char(2) default 'NJ',
  zip                 text,
  phone               text,
  website             text,
  license_number      text,
  agent_count         integer,
  agent_count_source  text,
  service_zips        text[] not null default '{}',
  notes               text,
  created_by          uuid references public.app_user (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists brokerage_zip_idx on public.brokerage (zip);
comment on column public.brokerage.agent_count is
  'Null unless a source reliably reports it. Never estimated.';

-- Agents --------------------------------------------------------------------
create table if not exists public.agent (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null,
  slug                  text not null unique,
  brokerage_id          uuid references public.brokerage (id) on delete set null,
  brokerage_name_raw    text,
  public_email          citext,
  public_phone          text,
  website               text,
  profile_url           text,
  license_number        text,
  license_state         char(2) default 'NJ',
  license_status        text,
  license_verified_at   timestamptz,
  license_source_id     uuid references public.research_source (id) on delete set null,
  headline              text,
  bio                   text,
  headshot_url          text,
  service_zips          text[] not null default '{}',
  specialties           text[] not null default '{}',
  status                agent_status not null default 'draft',
  status_reason         text,
  approved_by           uuid references public.app_user (id) on delete set null,
  approved_at           timestamptz,
  published_at          timestamptz,
  claimed_by_user_id    uuid references public.app_user (id) on delete set null,
  claim_verified_at     timestamptz,
  research_run_id       uuid,
  created_by            uuid references public.app_user (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint agent_published_requires_approval
    check (status <> 'published' or (approved_by is not null and approved_at is not null))
);

create index if not exists agent_status_idx     on public.agent (status, updated_at desc);
create index if not exists agent_brokerage_idx  on public.agent (brokerage_id);
create index if not exists agent_zips_idx       on public.agent using gin (service_zips);

comment on constraint agent_published_requires_approval on public.agent is
  'A published profile must carry a recorded approver and approval time. Enforced by the database, not only the application.';

-- Per-field evidence --------------------------------------------------------
create table if not exists public.evidence (
  id                  uuid primary key default gen_random_uuid(),
  subject             subject_type not null,
  subject_id          uuid not null,
  field_name          text not null,
  field_value         text,
  source_id           uuid references public.research_source (id) on delete set null,
  source_url          text,
  retrieved_at        timestamptz not null default now(),
  method              evidence_method not null,
  verification        verification_status not null default 'unverified',
  confidence          numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  notes               text,
  recorded_by         uuid references public.app_user (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists evidence_subject_idx on public.evidence (subject, subject_id, field_name);

comment on table public.evidence is
  'One row per researched field, with its source and retrieval time. verification distinguishes verified facts, self-reported claims, third-party claims and AI-generated assessments. Absence of a row means the field is unsourced.';

-- Publication gate ----------------------------------------------------------
create or replace function public.enforce_agent_publication_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  acting_as_end_user boolean := jwt_role in ('authenticated', 'anon');
begin
  -- Nothing may be created already published or approved.
  if tg_op = 'INSERT' and new.status in ('approved', 'published') then
    raise exception 'Agent profiles cannot be created in % status; they must pass admin review', new.status
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    -- Publishing requires a prior approval state.
    if new.status = 'published' and old.status not in ('approved', 'published') then
      raise exception 'Cannot publish agent % from status % — admin approval is required first', new.id, old.status
        using errcode = 'check_violation';
    end if;

    -- Approving or publishing is an admin-only action for signed-in users.
    if new.status is distinct from old.status
       and new.status in ('approved', 'published')
       and acting_as_end_user
       and not public.is_admin() then
      raise exception 'Only an administrator may approve or publish agent profiles'
        using errcode = 'insufficient_privilege';
    end if;

    -- Approval must be attributed.
    if new.status = 'approved' and old.status is distinct from 'approved' and new.approved_by is null then
      raise exception 'Approval must record approved_by' using errcode = 'check_violation';
    end if;

    -- Losing approval un-publishes.
    if new.status in ('draft', 'pending_review', 'changes_requested', 'rejected') then
      new.published_at := null;
    end if;
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end;
$$;

create trigger agent_publication_gate
  before insert or update on public.agent
  for each row execute function public.enforce_agent_publication_gate();

create trigger agent_set_updated_at
  before update on public.agent
  for each row execute function public.set_updated_at();

create trigger brokerage_set_updated_at
  before update on public.brokerage
  for each row execute function public.set_updated_at();

-- RLS -----------------------------------------------------------------------
alter table public.zip_area        enable row level security;
alter table public.research_source enable row level security;
alter table public.brokerage       enable row level security;
alter table public.agent           enable row level security;
alter table public.evidence        enable row level security;

-- Public site reads published agents only.
create policy agent_select_published on public.agent
  for select to anon, authenticated
  using (status = 'published');

create policy agent_select_staff on public.agent
  for select to authenticated
  using (public.is_staff());

create policy agent_insert_staff on public.agent
  for insert to authenticated
  with check (public.is_staff());

create policy agent_update_staff on public.agent
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Brokerages: published-agent affiliations are public; staff see everything.
create policy brokerage_select_public on public.brokerage
  for select to anon, authenticated
  using (exists (
    select 1 from public.agent a
     where a.brokerage_id = brokerage.id
       and a.status = 'published'
  ));

create policy brokerage_select_staff on public.brokerage
  for select to authenticated using (public.is_staff());

create policy brokerage_write_staff on public.brokerage
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Target ZIPs are public (they drive public pages).
create policy zip_area_select_public on public.zip_area
  for select to anon, authenticated using (is_target);

create policy zip_area_staff_all on public.zip_area
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Sources are public-readable so methodology pages can cite them.
create policy research_source_select_public on public.research_source
  for select to anon, authenticated using (true);

create policy research_source_write_admin on public.research_source
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Evidence: staff only. It may contain notes not intended for publication.
create policy evidence_select_staff on public.evidence
  for select to authenticated using (public.is_staff());

create policy evidence_write_staff on public.evidence
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
