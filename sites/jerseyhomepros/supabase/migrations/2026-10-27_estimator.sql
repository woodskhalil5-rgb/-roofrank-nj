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
