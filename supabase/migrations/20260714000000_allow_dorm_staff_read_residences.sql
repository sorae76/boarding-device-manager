-- Phase 3B-2: let dorm staff view the full current-school residence list.
-- Management remains limited by the existing public.dorms mutation policy.

drop policy if exists "school members read dorms" on public.dorms;

create policy "school members read dorms" on public.dorms
for select using (
  public.has_school_role(
    school_id,
    array['school_admin','dorm_supervisor','dorm_staff','viewer']::public.school_role[]
  )
);
