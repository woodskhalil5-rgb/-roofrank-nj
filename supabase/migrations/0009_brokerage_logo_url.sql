-- Applied to the live project on 2026-10-19.
-- A sponsored card must put the brokerage ahead of the agent to satisfy
-- N.J.A.C. 11:5-6.1(b)(1); a logo carries that prominence without oversized type.
alter table public.brokerage add column if not exists logo_url text;
comment on column public.brokerage.logo_url is
  'Brokerage logo, supplied by the brokerage for use on paid placements.';
