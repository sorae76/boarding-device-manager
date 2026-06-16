-- Phase 2 auth shell session lookup hardening.
--
-- This migration is intentionally additive. It does not change schema shape,
-- weaken write permissions, or bypass RLS. It grants authenticated users the
-- base table SELECT privilege needed for RLS policies to be evaluated during
-- session/profile loading.

grant select on table public.app_users to authenticated;
grant select on table public.app_user_school_roles to authenticated;
grant select on table public.schools to authenticated;

revoke insert, update, delete on table public.app_users from authenticated;
revoke insert, update, delete on table public.app_user_school_roles from authenticated;
revoke insert, update, delete on table public.schools from authenticated;

-- Existing RLS policy intent to verify before manual execution:
-- - public.app_users allows users to read their own profile where id = auth.uid().
-- - public.app_user_school_roles allows active school members to read school role mappings.
-- - public.schools allows active school members to read their school.
