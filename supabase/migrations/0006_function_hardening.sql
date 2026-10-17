-- 0006_function_hardening.sql
-- Addresses Supabase security advisories.
--
-- Trigger functions never need EXECUTE for the calling role: triggers run as
-- the table owner. Revoking EXECUTE removes them from the public RPC surface.
--
-- current_app_role/is_admin/is_staff ARE referenced by RLS policies evaluated
-- as the `authenticated` role, so that role must keep EXECUTE. They are
-- revoked from `anon`, which no public policy calls. Each returns only the
-- caller's own role, so an authenticated caller learns nothing it cannot
-- already see in its own app_user row.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from anon, authenticated;
revoke execute on function public.handle_new_auth_user() from anon, authenticated;
revoke execute on function public.enforce_agent_publication_gate() from anon, authenticated;
revoke execute on function public.enforce_service_request_consent() from anon, authenticated;

revoke execute on function public.current_app_role() from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_staff() from anon;
