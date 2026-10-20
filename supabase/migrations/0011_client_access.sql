-- Access for the people who buy advertising: an agent or a brokerage signing
-- in to see their own numbers and nobody else's. These are not staff. A new
-- account defaults to the 'readonly' role, which is_staff() excludes, so a
-- client cannot reach the internal dashboard even by typing its address.

create table if not exists public.client_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.agent(id) on delete cascade,
  brokerage_id uuid references public.brokerage(id) on delete cascade,
  granted_by uuid references public.app_user(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note text,
  constraint client_access_subject
    check (agent_id is not null or brokerage_id is not null)
);

create index if not exists client_access_user_idx on public.client_access (user_id)
  where revoked_at is null;
create index if not exists client_access_agent_idx on public.client_access (agent_id);
create index if not exists client_access_brokerage_idx on public.client_access (brokerage_id);

alter table public.client_access enable row level security;

drop policy if exists client_access_select_own on public.client_access;
create policy client_access_select_own on public.client_access
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists client_access_write_admin on public.client_access;
create policy client_access_write_admin on public.client_access
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Every agent this signed-in client may see, directly or via a brokerage.
create or replace function public.current_client_agent_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct a.id), '{}'::uuid[])
  from public.agent a
  where exists (
    select 1
    from public.client_access ca
    where ca.user_id = auth.uid()
      and ca.revoked_at is null
      and (
        ca.agent_id = a.id
        or (ca.brokerage_id is not null and ca.brokerage_id = a.brokerage_id)
      )
  )
$$;

create or replace function public.is_client()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_access ca
    where ca.user_id = auth.uid() and ca.revoked_at is null
  )
$$;

grant execute on function public.current_client_agent_ids() to authenticated;
grant execute on function public.is_client() to authenticated;

-- A client reads the tallies for their own listings only. Staff keep the lot.
drop policy if exists analytics_daily_select_staff on public.analytics_daily;
drop policy if exists analytics_daily_select_scoped on public.analytics_daily;
create policy analytics_daily_select_scoped on public.analytics_daily
  for select to authenticated
  using (
    public.is_staff()
    or (
      agent_id is not null
      and agent_id = any (public.current_client_agent_ids())
    )
  );

-- And their own campaigns, so they can see what they bought and until when.
drop policy if exists sponsored_placement_select_client on public.sponsored_placement;
create policy sponsored_placement_select_client on public.sponsored_placement
  for select to authenticated
  using (
    public.is_staff()
    or (
      agent_id is not null
      and agent_id = any (public.current_client_agent_ids())
    )
  );

-- KNOWN ISSUE, not fixed here because it changes what the public sees:
-- sponsored_placement_select_public reads
--   (CURRENT_DATE >= starts_on AND CURRENT_DATE <= ends_on)
-- which is NULL-blind. A campaign with no end date is stored happily and then
-- shown to nobody. The application requires an end date on every sale so the
-- two agree. If open-ended campaigns are ever wanted, that policy needs:
--   using (current_date >= starts_on and (ends_on is null or current_date <= ends_on))
