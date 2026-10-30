-- Insurance certificates / HIC documents uploaded by contractors. PRIVATE:
-- read only through short-lived signed links in the admin dashboard.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pro-docs', 'pro-docs', false, 6291456, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 6291456,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
-- One-time token so a brand-new applicant can attach a document right after
-- applying (no account yet). Hash only; 2-hour expiry.
alter table public.roofers
  add column if not exists doc_token_hash text,
  add column if not exists doc_token_expires timestamptz,
  add column if not exists insurance_uploaded_at timestamptz;
