-- Phase 3B-2: allow authenticated users to access residences
-- through the existing school- and role-scoped RLS policies.

revoke all privileges on table public.dorms from anon;
revoke all privileges on table public.dorms from authenticated;

grant select, insert, update
on table public.dorms
to authenticated;
