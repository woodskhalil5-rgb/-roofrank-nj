-- 0005_consent_service_requests_analytics.sql
-- Consent records, consent-gated home-service requests destined for Jersey
-- Home Pros (a separate system), delivery attempt log, and real-event analytics.

do $$ begin
  create type service_request_status as enum (
    'received', 'validated', 'queued', 'delivered', 'failed', 'rejected', 'cancelled'
  );
exception when duplicate_object then null; end $$;

-- Consent -------------------------------------------------------------------
create table if not exists public.consent_record (
  id             uuid primary key default gen_random_uuid(),
  subject_email  citext,
  subject_phone  text,
  purpose        text not null,
  disclosure_text text not null,
  text_version   text not null,
  granted        boolean not null,
  granted_at     timestamptz not null default now(),
  ip_address     inet,
  user_agent     text,
  source_page    text,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists consent_record_email_idx on public.consent_record (subject_email, granted_at desc);

comment on table public.consent_record is
  'Immutable record of what the visitor was shown and agreed to, including the exact disclosure text and its version. Retained independently of the resulting request.';

-- Home-service requests -------------------------------------------------------
create table if not exists public.service_request (
  id                  uuid primary key default gen_random_uuid(),
  idempotency_key     text not null unique,
  requester_name      text not null,
  requester_email     citext not null,
  requester_phone     text,
  street_address      text,
  city                text,
  state               char(2) default 'NJ',
  zip                 text not null,
  service_category    text not null,
  details             text,
  preferred_timing    text,
  consent_record_id   uuid not null references public.consent_record (id) on delete restrict,
  source_page         text,
  status              service_request_status not null default 'received',
  validation_errors   jsonb,
  attempts            integer not null default 0,
  max_attempts        integer not null default 5,
  next_attempt_at     timestamptz,
  last_error          text,
  jhp_reference       text,
  jhp_status          text,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists service_request_status_idx on public.service_request (status, next_attempt_at);
create index if not exists service_request_created_idx on public.service_request (created_at desc);

comment on table public.service_request is
  'Home-service requests a visitor explicitly asked for. Only the minimum fields are transmitted to Jersey Home Pros; JHP owns contractor matching and follow-up. No row may exist without a consent_record.';

create table if not exists public.service_request_attempt (
  id                 uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_request (id) on delete cascade,
  attempt_no         integer not null,
  endpoint           text,
  request_payload    jsonb,
  response_status    integer,
  response_body      text,
  error              text,
  duration_ms        integer,
  created_at         timestamptz not null default now()
);
create index if not exists service_request_attempt_idx
  on public.service_request_attempt (service_request_id, attempt_no);

comment on column public.service_request_attempt.request_payload is
  'Exactly what was sent to JHP, for dispute resolution and data-minimisation review.';

-- Consent gate --------------------------------------------------------------
create or replace function public.enforce_service_request_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_consent boolean;
begin
  select c.granted and c.revoked_at is null
    into has_consent
    from public.consent_record c
   where c.id = new.consent_record_id;

  if not coalesce(has_consent, false) then
    raise exception 'Service request % has no granted, unrevoked consent record', new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger service_request_consent_gate
  before insert or update on public.service_request
  for each row execute function public.enforce_service_request_consent();

create trigger service_request_set_updated_at before update on public.service_request
  for each row execute function public.set_updated_at();

-- Analytics: real events only --------------------------------------------------
create table if not exists public.site_event (
  id          bigserial primary key,
  event_name  text not null,
  path        text,
  zip         text,
  agent_id    uuid references public.agent (id) on delete set null,
  session_id  text,
  referrer    text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists site_event_name_idx on public.site_event (event_name, created_at desc);
create index if not exists site_event_zip_idx  on public.site_event (zip, created_at desc);

comment on table public.site_event is
  'Observed events only (page views, inquiries, form submissions). The dashboard derives every published metric from this table or from domain tables - never from placeholder values.';

-- AI assistant activity ---------------------------------------------------
create table if not exists public.assistant_action (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.app_user (id) on delete set null,
  question      text,
  tool_name     text,
  tool_input    jsonb,
  result_summary text,
  was_confirmed boolean not null default false,
  is_consequential boolean not null default false,
  created_at    timestamptz not null default now()
);
comment on table public.assistant_action is
  'Every assistant tool call, with whether it was a consequential action and whether a human confirmed it.';

-- RLS ------------------------------------------------------------------------
alter table public.consent_record          enable row level security;
alter table public.service_request         enable row level security;
alter table public.service_request_attempt enable row level security;
alter table public.site_event              enable row level security;
alter table public.assistant_action        enable row level security;

-- Consent records and service requests are written server-side only. The public
-- form posts to a server route; it does not write these tables directly.
create policy consent_record_select_staff on public.consent_record
  for select to authenticated using (public.is_staff());

create policy service_request_select_staff on public.service_request
  for select to authenticated using (public.is_staff());

create policy service_request_update_admin on public.service_request
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy service_request_attempt_select_staff on public.service_request_attempt
  for select to authenticated using (public.is_staff());

create policy site_event_select_staff on public.site_event
  for select to authenticated using (public.is_staff());

create policy assistant_action_select_own on public.assistant_action
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
