-- Applied to the live project on 2026-10-19.
-- A statewide placement is one of the three homepage positions and belongs to
-- no town, so it carries no ZIP. The column was NOT NULL, which made those
-- three positions impossible to sell: nothing could be stored for them.
alter table public.sponsored_placement alter column zip drop not null;

alter table public.sponsored_placement
  add constraint sponsored_placement_zip_format
  check (zip is null or zip ~ '^[0-9]{5}$');

create index if not exists sponsored_placement_window_idx
  on public.sponsored_placement (starts_on, ends_on);

comment on column public.sponsored_placement.zip is
  'The town this placement runs in. NULL means a statewide homepage position.';
comment on column public.sponsored_placement.label is
  'The promotional category purchased, shown on the card. Advertising copy only: never a performance claim, a rating or a ranking.';
