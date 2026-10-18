-- 0001_foundation_roles_audit.sql
-- Destiny Marketing Group — Real Estate Intelligence Platform
-- Foundation: extensions, roles, users, audit log, shared triggers.
-- This database is independent of Jersey Home Pros.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('owner', 'admin', 'employee', 'readonly');
exception when duplicate_object then null; end $$;

create table if not exists public.app_user (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       citext not null unique,
  full_name   text,
  role        app_role not null default 'readonly',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.app_user is
  'Application users mirrored from auth.users. Role drives every server-side authorization check. New sign-ups default to readonly and must be elevated explicitly.';

-- Bootstrap allowlist: which email addresses receive an elevated role on first
-- sign-up. Nothing else grants a role automatically.
create table if not exists public.role_bootstrap (
  email       citext primary key,
  role        app_role not null,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.role_bootstrap is
  'Allowlist consulted when an auth user first appears. Prevents arbitrary sign-ups from gaining staff access.';

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_user_set_updated_at
  before update on public.app_user
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mirror auth.users -> app_user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bootstrap_role app_role;
begin
  select rb.role into bootstrap_role
    from public.role_bootstrap rb
   where rb.email = new.email;

  insert into public.app_user (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(bootstrap_role, 'readonly'::app_role)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Authorization helpers (used by every RLS policy)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select u.role
    from public.app_user u
   where u.id = auth.uid()
     and u.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('owner', 'admin'), false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('owner', 'admin', 'employee'), false)
$$;

comment on function public.is_admin() is
  'True only for owner/admin. Required for approving or publishing agent profiles.';

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id            bigserial primary key,
  actor_user_id uuid references public.app_user (id) on delete set null,
  actor_email   citext,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  before_state  jsonb,
  after_state   jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_entity_idx  on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_actor_idx   on public.audit_log (actor_user_id, created_at desc);
create index if not exists audit_log_action_idx  on public.audit_log (action, created_at desc);

comment on table public.audit_log is
  'Append-only record of consequential actions. Written server-side only; no client role may update or delete rows.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_user       enable row level security;
alter table public.role_bootstrap enable row level security;
alter table public.audit_log      enable row level security;

-- app_user: a user can read their own row; admins read all; only admins change roles.
create policy app_user_select_self on public.app_user
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy app_user_update_admin on public.app_user
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- role_bootstrap: admin-only, never exposed publicly.
create policy role_bootstrap_admin_all on public.role_bootstrap
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- audit_log: staff may read; nobody may write through the API (service role only).
create policy audit_log_select_staff on public.audit_log
  for select to authenticated
  using (public.is_staff());
