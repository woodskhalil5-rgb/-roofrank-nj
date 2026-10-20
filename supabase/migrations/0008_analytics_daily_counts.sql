-- Applied to the live project on 2026-10-19 (see supabase migration
-- 0008_analytics_daily_counts). Kept here as the record of the schema.
-- Aggregate, per-day event counts. No cookies, no IP addresses, no per-visitor
-- identifiers: a row is a tally, not a record of a person.

create type public.analytics_event_type as enum (
  'placement_impression','placement_click','zip_search','profile_view','contact_click'
);

create table public.analytics_daily (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  event_type public.analytics_event_type not null,
  agent_id uuid references public.agent(id) on delete cascade,
  zip text,
  is_paid boolean not null default false,
  count bigint not null default 0,
  created_at timestamptz not null default now()
);

create unique index analytics_daily_key on public.analytics_daily (
  day, event_type,
  coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(zip, ''), is_paid
);
create index analytics_daily_agent_day on public.analytics_daily (agent_id, day desc);
create index analytics_daily_type_day on public.analytics_daily (event_type, day desc);

alter table public.analytics_daily enable row level security;

-- Superseded by analytics_daily_select_scoped in 0011_client_access.sql.
create policy analytics_daily_select_staff on public.analytics_daily
  for select to authenticated using (public.is_staff());

create or replace function public.record_event(
  p_event text, p_agent uuid default null,
  p_zip text default null, p_paid boolean default false
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_zip text := p_zip;
begin
  if p_event is null or p_event not in (
    'placement_impression','placement_click','zip_search','profile_view','contact_click'
  ) then
    raise exception 'unknown event type';
  end if;
  if v_zip is not null and v_zip !~ '^[0-9]{5}$' then v_zip := null; end if;
  insert into public.analytics_daily (day, event_type, agent_id, zip, is_paid, count)
  values (current_date, p_event::public.analytics_event_type, p_agent, v_zip,
          coalesce(p_paid,false), 1)
  on conflict (day, event_type,
    coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(zip, ''), is_paid)
  do update set count = public.analytics_daily.count + 1;
end;
$$;

revoke all on function public.record_event(text, uuid, text, boolean) from public;
grant execute on function public.record_event(text, uuid, text, boolean) to anon, authenticated;
