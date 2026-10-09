create extension if not exists pgcrypto;
create table if not exists public.leads (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 name text not null,
 phone text not null,
 email text not null,
 zip text not null check (zip ~ '^[0-9]{5}$'),
 property_type text not null,
 service text not null,
 timing text not null,
 details text not null default '',
 consent boolean not null default false,
 status text not null default 'new'
);
alter table public.leads enable row level security;
-- Intentionally no public policies. Writes are made through the server API using
-- the server-only service role key; never expose that key in client-side code.
