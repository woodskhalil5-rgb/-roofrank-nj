-- 0004_crm_proposals_revenue.sql
-- Brokerage acquisition CRM, proposals, contracts, recurring revenue,
-- and marketing packages for agents and brokerages.

do $$ begin
  create type crm_stage as enum (
    'researching', 'contacted', 'meeting_set', 'proposal_sent',
    'negotiating', 'won', 'lost', 'dormant'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_type as enum ('call', 'email', 'meeting', 'note', 'proposal', 'contract');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_status as enum ('draft', 'approved_to_send', 'sent', 'accepted', 'declined', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_status as enum ('active', 'cancelled', 'expired', 'pending_signature');
exception when duplicate_object then null; end $$;

do $$ begin
  create type revenue_kind as enum ('subscription', 'setup_fee', 'one_time', 'ad_spend_passthrough');
exception when duplicate_object then null; end $$;

do $$ begin
  create type package_audience as enum ('agent', 'brokerage');
exception when duplicate_object then null; end $$;

-- Marketing packages ---------------------------------------------------------
create table if not exists public.marketing_package (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  audience           package_audience not null,
  monthly_price_low  numeric(10,2),
  monthly_price_high numeric(10,2),
  setup_fee          numeric(10,2),
  deliverables       jsonb not null default '[]'::jsonb,
  excludes_ad_spend  boolean not null default true,
  term_months        integer,
  cancellation_terms text,
  is_active          boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now()
);
comment on column public.marketing_package.monthly_price_low is
  'Test pricing, not a guaranteed market rate. Advertising spend is contracted separately (excludes_ad_spend).';

-- CRM ----------------------------------------------------------------------
create table if not exists public.crm_account (
  id                 uuid primary key default gen_random_uuid(),
  brokerage_id       uuid references public.brokerage (id) on delete set null,
  name               text not null,
  stage              crm_stage not null default 'researching',
  owner_user_id      uuid references public.app_user (id) on delete set null,
  acquisition_source text,
  research_summary   text,
  next_follow_up_at  date,
  last_contact_at    timestamptz,
  notes              text,
  created_by         uuid references public.app_user (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists crm_account_stage_idx on public.crm_account (stage, next_follow_up_at);

create table if not exists public.crm_contact (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.crm_account (id) on delete cascade,
  full_name         text not null,
  title             text,
  email             citext,
  phone             text,
  is_decision_maker boolean not null default false,
  source_url        text,
  contact_basis     text,
  do_not_contact    boolean not null default false,
  created_at        timestamptz not null default now()
);
comment on column public.crm_contact.contact_basis is
  'Where this contact detail came from and why contacting it is permitted. Required before outreach.';

create table if not exists public.crm_activity (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.crm_account (id) on delete cascade,
  contact_id   uuid references public.crm_contact (id) on delete set null,
  type         activity_type not null,
  occurred_at  timestamptz not null default now(),
  summary      text not null,
  outcome      text,
  created_by   uuid references public.app_user (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists crm_activity_account_idx on public.crm_activity (account_id, occurred_at desc);

-- Proposals ----------------------------------------------------------------
create table if not exists public.proposal (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.crm_account (id) on delete cascade,
  package_id     uuid references public.marketing_package (id) on delete set null,
  title          text not null,
  monthly_value  numeric(10,2),
  setup_fee      numeric(10,2),
  term_months    integer,
  ad_spend_note  text,
  body_markdown  text,
  status         proposal_status not null default 'draft',
  approved_by    uuid references public.app_user (id) on delete set null,
  approved_at    timestamptz,
  sent_at        timestamptz,
  decided_at     timestamptz,
  created_by     uuid references public.app_user (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint proposal_send_requires_approval
    check (status not in ('sent', 'accepted') or (approved_by is not null and approved_at is not null))
);
comment on constraint proposal_send_requires_approval on public.proposal is
  'A proposal cannot be marked sent without a recorded human approval.';

-- Contracts and revenue -------------------------------------------------------
create table if not exists public.contract (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.crm_account (id) on delete cascade,
  proposal_id        uuid references public.proposal (id) on delete set null,
  package_name       text not null,
  mrr                numeric(10,2) not null default 0,
  setup_fee          numeric(10,2),
  start_date         date not null,
  renewal_date       date,
  cancellation_terms text,
  status             contract_status not null default 'pending_signature',
  signed_at          timestamptz,
  created_by         uuid references public.app_user (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists contract_status_idx on public.contract (status, renewal_date);

create table if not exists public.revenue_event (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contract (id) on delete set null,
  account_id  uuid references public.crm_account (id) on delete set null,
  agent_id    uuid references public.agent (id) on delete set null,
  kind        revenue_kind not null,
  amount      numeric(10,2) not null,
  occurred_on date not null,
  channel     text,
  notes       text,
  created_by  uuid references public.app_user (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists revenue_event_date_idx on public.revenue_event (occurred_on desc);
comment on table public.revenue_event is
  'Recorded revenue only. Nothing here is projected or estimated; ad spend passed through to a client is a separate kind.';

create table if not exists public.agent_subscription (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.agent (id) on delete cascade,
  package_id   uuid references public.marketing_package (id) on delete set null,
  mrr          numeric(10,2) not null default 0,
  status       contract_status not null default 'pending_signature',
  start_date   date,
  renewal_date date,
  sponsored_by_brokerage_id uuid references public.brokerage (id) on delete set null,
  created_by   uuid references public.app_user (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger crm_account_set_updated_at before update on public.crm_account
  for each row execute function public.set_updated_at();
create trigger proposal_set_updated_at before update on public.proposal
  for each row execute function public.set_updated_at();
create trigger contract_set_updated_at before update on public.contract
  for each row execute function public.set_updated_at();
create trigger agent_subscription_set_updated_at before update on public.agent_subscription
  for each row execute function public.set_updated_at();

-- RLS: CRM data is internal. No public read of any kind.
alter table public.marketing_package  enable row level security;
alter table public.crm_account        enable row level security;
alter table public.crm_contact        enable row level security;
alter table public.crm_activity       enable row level security;
alter table public.proposal           enable row level security;
alter table public.contract           enable row level security;
alter table public.revenue_event      enable row level security;
alter table public.agent_subscription enable row level security;

create policy marketing_package_select_public on public.marketing_package
  for select to anon, authenticated using (is_active);
create policy marketing_package_write_admin on public.marketing_package
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy crm_account_staff on public.crm_account
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy crm_contact_staff on public.crm_contact
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy crm_activity_staff on public.crm_activity
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy proposal_staff on public.proposal
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Contracts and revenue are admin-only.
create policy contract_admin on public.contract
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy revenue_event_admin on public.revenue_event
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy agent_subscription_admin on public.agent_subscription
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
