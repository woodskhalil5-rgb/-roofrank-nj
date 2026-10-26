-- Profile photos and company-provided details. Applied live as
-- migration profile_photos_and_details.
alter table public.roofers
  add column if not exists logo_path text not null default '',
  add column if not exists gallery_paths text[] not null default '{}',
  add column if not exists year_founded integer
    check (year_founded is null or year_founded between 1850 and 2100),
  add column if not exists hours text not null default '',
  add column if not exists towns text not null default '',
  add column if not exists service_list text[] not null default '{}',
  add column if not exists highlights text[] not null default '{}';

-- Public bucket: profile photos are meant to be seen. Writes only happen
-- server-side with the service-role key (no storage policies), so the
-- browser can read but never upload directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pro-photos', 'pro-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
