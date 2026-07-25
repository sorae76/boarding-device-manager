-- Phase 3C-1: student identity linkage and read-only portal access.

alter table public.students
  add column if not exists school_email text,
  add column if not exists auth_user_id uuid references public.app_users(id) on delete set null;

alter table public.students
  drop constraint if exists students_school_email_not_blank,
  add constraint students_school_email_not_blank
    check (school_email is null or btrim(school_email) <> ''),
  drop constraint if exists students_school_email_normalized,
  add constraint students_school_email_normalized
    check (
      school_email is null
      or school_email = lower(btrim(school_email))
    );

create unique index if not exists students_auth_user_id_unique
  on public.students (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists students_active_school_email_unique
  on public.students (lower(btrim(school_email)))
  where school_email is not null and status = 'active';

create or replace function public.set_student_school_email(
  target_student_id uuid,
  target_school_email text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text;
  target_school_id uuid;
  linked_auth_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  normalized_email := nullif(lower(btrim(target_school_email)), '');

  if normalized_email is not null
    and normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Enter a valid school email.';
  end if;

  select school_id, auth_user_id
  into target_school_id, linked_auth_user_id
  from public.students
  where id = target_student_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Student was not found.';
  end if;

  if not (
    exists (
      select 1
      from public.app_user_school_roles ausr
      join public.app_users au on au.id = ausr.user_id
      where ausr.user_id = auth.uid()
        and ausr.school_id = target_school_id
        and ausr.role = 'school_admin'::public.school_role
        and ausr.is_active = true
        and au.is_active = true
    )
    or (
      public.is_super_admin()
      and public.has_active_school_membership(target_school_id)
    )
  ) then
    raise exception 'You are not allowed to manage student accounts.';
  end if;

  if linked_auth_user_id is not null then
    raise exception 'This student account is already linked.';
  end if;

  if normalized_email is not null and exists (
    select 1
    from public.students
    where status = 'active'
      and school_email is not null
      and lower(btrim(school_email)) = normalized_email
      and id <> target_student_id
  ) then
    raise exception 'This email is already assigned to another student.';
  end if;

  update public.students
  set school_email = normalized_email
  where id = target_student_id;

  return case when normalized_email is null then 'cleared' else 'updated' end;
end;
$$;

revoke all on function public.set_student_school_email(uuid, text) from public;
revoke all on function public.set_student_school_email(uuid, text) from anon;
grant execute on function public.set_student_school_email(uuid, text) to authenticated;

create or replace function public.claim_current_student_account()
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_auth_id uuid := auth.uid();
  normalized_email text;
  matching_student public.students%rowtype;
  match_count integer;
begin
  if current_auth_id is null then
    raise exception 'Authentication is required.';
  end if;

  select lower(btrim(email))
  into normalized_email
  from auth.users
  where id = current_auth_id
    and email is not null
    and email_confirmed_at is not null;

  if normalized_email is null or normalized_email = '' then
    raise exception 'A verified email is required.';
  end if;

  select count(*)
  into match_count
  from public.students s
  join public.schools sch on sch.id = s.school_id
  where s.status = 'active'
    and sch.is_active = true
    and s.school_email is not null
    and lower(btrim(s.school_email)) = normalized_email;

  if match_count = 0 then
    return 'no_student_match';
  end if;

  if match_count <> 1 then
    raise exception 'Student identity is ambiguous.';
  end if;

  select s.*
  into matching_student
  from public.students s
  join public.schools sch on sch.id = s.school_id
  where s.status = 'active'
    and sch.is_active = true
    and s.school_email is not null
    and lower(btrim(s.school_email)) = normalized_email
  for update of s;

  if matching_student.auth_user_id is not null
    and matching_student.auth_user_id <> current_auth_id
  then
    raise exception 'Student account is linked to another user.';
  end if;

  if exists (
    select 1
    from public.app_user_school_roles
    where user_id = current_auth_id
      and is_active = true
      and (
        school_id <> matching_student.school_id
        or role <> 'student'::public.school_role
      )
  ) then
    raise exception 'Conflicting school membership exists.';
  end if;

  insert into public.app_users (id, email, is_active)
  values (current_auth_id, normalized_email, true)
  on conflict (id) do nothing;

  if exists (
    select 1 from public.app_users
    where id = current_auth_id and is_active = false
  ) then
    raise exception 'Student account is inactive.';
  end if;

  insert into public.app_user_school_roles (school_id, user_id, role, is_active)
  values (
    matching_student.school_id,
    current_auth_id,
    'student'::public.school_role,
    true
  )
  on conflict (school_id, user_id) do nothing;

  if exists (
    select 1
    from public.app_user_school_roles
    where school_id = matching_student.school_id
      and user_id = current_auth_id
      and (role <> 'student'::public.school_role or is_active = false)
  ) then
    raise exception 'Conflicting school membership exists.';
  end if;

  update public.students
  set auth_user_id = current_auth_id
  where id = matching_student.id
    and (auth_user_id is null or auth_user_id = current_auth_id);

  if matching_student.auth_user_id = current_auth_id then
    return 'already_linked';
  end if;

  return 'claimed';
end;
$$;

revoke all on function public.claim_current_student_account() from public;
revoke all on function public.claim_current_student_account() from anon;
grant execute on function public.claim_current_student_account() to authenticated;

drop policy if exists "school members read their schools" on public.schools;

create policy "school members read their schools"
on public.schools
for select
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.app_user_school_roles ausr
    where ausr.school_id = schools.id
      and ausr.user_id = auth.uid()
      and ausr.is_active = true
      and (
        ausr.role <> 'student'::public.school_role
        or (
          schools.is_active = true
          and exists (
            select 1
            from public.app_users au
            where au.id = auth.uid()
              and au.is_active = true
          )
        )
      )
  )
);

drop policy if exists "students read own student record" on public.students;

drop policy if exists "students read own primary residence" on public.dorms;

drop policy if exists "students read own custody devices" on public.device_custody_devices;

create or replace function public.get_current_student_portal_profile()
returns table (
  student_id uuid,
  school_name text,
  student_number text,
  first_name text,
  last_name text,
  grade_level text,
  primary_residence_name text,
  primary_residence_code text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    sch.name,
    s.student_number,
    s.first_name,
    s.last_name,
    s.grade_level,
    d.name,
    d.code
  from public.app_users au
  join public.app_user_school_roles ausr
    on ausr.user_id = au.id
   and ausr.role = 'student'::public.school_role
   and ausr.is_active = true
  join public.schools sch
    on sch.id = ausr.school_id
   and sch.is_active = true
  join public.students s
    on s.auth_user_id = au.id
   and s.school_id = ausr.school_id
   and s.status = 'active'
  left join public.dorms d
    on d.id = s.dorm_id
   and d.school_id = s.school_id
   and d.is_active = true
  where au.id = auth.uid()
    and au.is_active = true
  limit 1;
$$;

revoke all on function public.get_current_student_portal_profile() from public;
revoke all on function public.get_current_student_portal_profile() from anon;
grant execute on function public.get_current_student_portal_profile() to authenticated;

create or replace function public.list_current_student_portal_devices()
returns table (
  device_id uuid,
  device_type public.device_type,
  manufacturer text,
  model text,
  color text,
  asset_tag text,
  serial_number text,
  custody_status public.device_custody_status
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    dcd.id,
    dcd.device_type,
    dcd.manufacturer,
    dcd.model,
    dcd.color,
    dcd.asset_tag,
    dcd.serial_number,
    dcd.status
  from public.app_users au
  join public.app_user_school_roles ausr
    on ausr.user_id = au.id
   and ausr.role = 'student'::public.school_role
   and ausr.is_active = true
  join public.schools sch
    on sch.id = ausr.school_id
   and sch.is_active = true
  join public.students s
    on s.auth_user_id = au.id
   and s.school_id = ausr.school_id
   and s.status = 'active'
  join public.device_custody_devices dcd
    on dcd.student_id = s.id
   and dcd.school_id = s.school_id
  where au.id = auth.uid()
    and au.is_active = true
  order by dcd.created_at, dcd.id;
$$;

revoke all on function public.list_current_student_portal_devices() from public;
revoke all on function public.list_current_student_portal_devices() from anon;
grant execute on function public.list_current_student_portal_devices() to authenticated;

-- Existing authenticated grants are retained for staff workflows. Student
-- memberships match none of the existing direct-table policies, so student
-- portal reads are available only through the minimized RPCs above.
