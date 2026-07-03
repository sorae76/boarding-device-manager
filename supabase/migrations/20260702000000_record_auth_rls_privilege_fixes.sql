-- Record manual production auth/RLS privilege fixes before Phase 3.
--
-- This migration is intentionally additive and idempotent. It preserves RLS,
-- keeps authenticated access SELECT-only on the session lookup tables, and
-- avoids destructive schema or data changes.

alter table public.app_users enable row level security;
alter table public.app_user_school_roles enable row level security;
alter table public.schools enable row level security;

revoke all privileges on table public.app_users from authenticated;
revoke all privileges on table public.app_user_school_roles from authenticated;
revoke all privileges on table public.schools from authenticated;

grant select on table public.app_users to authenticated;
grant select on table public.app_user_school_roles to authenticated;
grant select on table public.schools to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_user_school_roles'
      and policyname = 'users read own school memberships'
  ) then
    create policy "users read own school memberships"
    on public.app_user_school_roles
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;
end
$$;
