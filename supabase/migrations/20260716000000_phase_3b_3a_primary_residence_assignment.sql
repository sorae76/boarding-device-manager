-- Phase 3B-3A: primary residence assignment through students.dorm_id only.

drop policy if exists "staff manage students" on public.students;

create or replace function public.has_active_school_membership(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_user_school_roles ausr
    join public.app_users au on au.id = ausr.user_id
    where ausr.user_id = auth.uid()
      and ausr.school_id = target_school_id
      and ausr.is_active = true
      and au.is_active = true
  );
$$;

revoke all on function public.has_active_school_membership(uuid) from public;
revoke all on function public.has_active_school_membership(uuid) from anon;
grant execute on function public.has_active_school_membership(uuid) to authenticated;

create policy "admins and supervisors update student primary residence"
on public.students
for update
using (
  (
    not public.is_super_admin()
    and public.has_school_role(
      school_id,
      array['school_admin','dorm_supervisor']::public.school_role[]
    )
  )
  or (
    public.is_super_admin()
    and public.has_active_school_membership(school_id)
  )
)
with check (
  (
    (
      not public.is_super_admin()
      and public.has_school_role(
        school_id,
        array['school_admin','dorm_supervisor']::public.school_role[]
      )
    )
    or (
      public.is_super_admin()
      and public.has_active_school_membership(school_id)
    )
  )
  and (
    dorm_id is null
    or exists (
      select 1
      from public.dorms d
      where d.school_id = students.school_id
        and d.id = students.dorm_id
        and d.is_active = true
    )
  )
);

revoke all privileges on table public.students from authenticated;
grant select on table public.students to authenticated;
grant update (dorm_id) on table public.students to authenticated;

create or replace function public.set_student_primary_residence(
  target_student_id uuid,
  target_dorm_id uuid
)
returns table (student_id uuid, dorm_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  student_school_id uuid;
begin
  if target_student_id is null then
    raise exception 'Student is required.';
  end if;

  select s.school_id
  into student_school_id
  from public.students s
  where s.id = target_student_id;

  if not found then
    raise exception 'Student was not found.';
  end if;

  if not (
    (
      not public.is_super_admin()
      and public.has_school_role(
        student_school_id,
        array['school_admin','dorm_supervisor']::public.school_role[]
      )
    )
    or (
      public.is_super_admin()
      and public.has_active_school_membership(student_school_id)
    )
  ) then
    raise exception 'You are not allowed to update this student.';
  end if;

  if target_dorm_id is not null and not exists (
    select 1
    from public.dorms d
    where d.school_id = student_school_id
      and d.id = target_dorm_id
      and d.is_active = true
  ) then
    raise exception 'Residence was not found or is inactive.';
  end if;

  return query
  update public.students s
  set dorm_id = target_dorm_id
  where s.id = target_student_id
    and s.school_id = student_school_id
  returning s.id, s.dorm_id;

  if not found then
    raise exception 'Student was not found or could not be updated.';
  end if;
end;
$$;

revoke all on function public.set_student_primary_residence(uuid, uuid) from public;
revoke all on function public.set_student_primary_residence(uuid, uuid) from anon;
grant execute on function public.set_student_primary_residence(uuid, uuid) to authenticated;
