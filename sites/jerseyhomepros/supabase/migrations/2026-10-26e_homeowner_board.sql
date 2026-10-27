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
