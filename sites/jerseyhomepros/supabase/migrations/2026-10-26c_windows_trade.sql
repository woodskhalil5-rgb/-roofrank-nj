-- Windows & Doors added as a trade (Khalil: all home-service trades, eventually).
alter table public.roofers drop constraint if exists roofers_trade_check;
alter table public.roofers add constraint roofers_trade_check
  check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping', 'windows'));
alter table public.leads drop constraint if exists leads_trade_check;
alter table public.leads add constraint leads_trade_check
  check (trade in ('roofing', 'hvac', 'pest', 'moving', 'cleaning', 'landscaping', 'hardscaping', 'windows'));
