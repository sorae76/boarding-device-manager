-- School-admin student creation and basic editing. No schema columns are required.

-- Reassert the direct-table boundary: authenticated callers may read students and
-- may update only dorm_id through the existing residence-only RLS policy.
revoke all privileges on table public.students from authenticated;
grant select on table public.students to authenticated;
grant update (dorm_id) on table public.students to authenticated;

create or replace function public.create_student_admin(
  target_school_id uuid,
  target_first_name text,
  target_last_name text,
  target_student_number text,
  target_grade_level text,
  target_dorm_id uuid,
  target_school_email text,
  target_status public.student_status
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_student_id uuid;
  normalized_email text := nullif(lower(btrim(target_school_email)), '');
  violated_constraint text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if not (
    (
      not public.is_super_admin()
      and exists (
        select 1
        from public.app_user_school_roles ausr
        join public.app_users au on au.id = ausr.user_id
        join public.schools sch on sch.id = ausr.school_id
        where ausr.user_id = auth.uid()
          and ausr.school_id = target_school_id
          and ausr.role = 'school_admin'::public.school_role
          and ausr.is_active and au.is_active and sch.is_active
      )
    )
    or (public.is_super_admin() and public.has_active_school_membership(target_school_id))
  ) then
    raise exception using errcode = 'P0001', message = 'STUDENT_FORBIDDEN';
  end if;
  if nullif(btrim(target_first_name), '') is null or nullif(btrim(target_last_name), '') is null then
    raise exception 'First and last name are required.';
  end if;
  if target_dorm_id is not null and not exists (
    select 1 from public.dorms where id = target_dorm_id and school_id = target_school_id and is_active
  ) then raise exception using errcode = 'P0001', message = 'STUDENT_INVALID_RESIDENCE'; end if;
  if normalized_email is not null and normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid school email.';
  end if;

  insert into public.students (
    school_id, first_name, last_name, student_number, grade_level, dorm_id, school_email, status
  ) values (
    target_school_id, btrim(target_first_name), btrim(target_last_name),
    nullif(btrim(target_student_number), ''), nullif(btrim(target_grade_level), ''),
    target_dorm_id, normalized_email, target_status
  ) returning id into new_student_id;
  return new_student_id;
exception
  when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'students_active_school_email_unique' then
      raise exception using errcode = 'ZS001', message = 'STUDENT_DUPLICATE_EMAIL';
    elsif violated_constraint = 'students_school_id_student_number_key' then
      raise exception using errcode = 'ZS002', message = 'STUDENT_DUPLICATE_NUMBER';
    end if;
    raise exception using errcode = 'P0001', message = 'STUDENT_CONFLICT';
end;
$$;

create or replace function public.update_student_admin(
  target_student_id uuid,
  target_first_name text,
  target_last_name text,
  target_student_number text,
  target_grade_level text,
  target_dorm_id uuid,
  target_school_email text,
  target_status public.student_status
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_school_id uuid;
  linked_auth_user_id uuid;
  current_school_email text;
  normalized_email text := nullif(lower(btrim(target_school_email)), '');
  violated_constraint text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select school_id, auth_user_id, school_email
    into target_school_id, linked_auth_user_id, current_school_email
    from public.students where id = target_student_id for update;
  if not found then raise exception 'Student was not found.'; end if;
  if not (
    (
      not public.is_super_admin()
      and exists (
        select 1
        from public.app_user_school_roles ausr
        join public.app_users au on au.id = ausr.user_id
        join public.schools sch on sch.id = ausr.school_id
        where ausr.user_id = auth.uid()
          and ausr.school_id = target_school_id
          and ausr.role = 'school_admin'::public.school_role
          and ausr.is_active and au.is_active and sch.is_active
      )
    )
    or (public.is_super_admin() and public.has_active_school_membership(target_school_id))
  ) then
    raise exception using errcode = 'P0001', message = 'STUDENT_FORBIDDEN';
  end if;
  if nullif(btrim(target_first_name), '') is null or nullif(btrim(target_last_name), '') is null then
    raise exception 'First and last name are required.';
  end if;
  if linked_auth_user_id is not null and normalized_email is distinct from current_school_email then
    raise exception using errcode = 'P0001', message = 'STUDENT_LINKED_EMAIL_LOCKED';
  end if;
  if target_dorm_id is not null and not exists (
    select 1 from public.dorms where id = target_dorm_id and school_id = target_school_id and is_active
  ) then raise exception using errcode = 'P0001', message = 'STUDENT_INVALID_RESIDENCE'; end if;
  if normalized_email is not null and normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid school email.';
  end if;

  update public.students set
    first_name = btrim(target_first_name), last_name = btrim(target_last_name),
    student_number = nullif(btrim(target_student_number), ''),
    grade_level = nullif(btrim(target_grade_level), ''), dorm_id = target_dorm_id,
    school_email = normalized_email, status = target_status
  where id = target_student_id and school_id = target_school_id;
  return target_student_id;
exception
  when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'students_active_school_email_unique' then
      raise exception using errcode = 'ZS001', message = 'STUDENT_DUPLICATE_EMAIL';
    elsif violated_constraint = 'students_school_id_student_number_key' then
      raise exception using errcode = 'ZS002', message = 'STUDENT_DUPLICATE_NUMBER';
    end if;
    raise exception using errcode = 'P0001', message = 'STUDENT_CONFLICT';
end;
$$;

revoke all on function public.create_student_admin(uuid,text,text,text,text,uuid,text,public.student_status) from public, anon;
revoke all on function public.update_student_admin(uuid,text,text,text,text,uuid,text,public.student_status) from public, anon;
grant execute on function public.create_student_admin(uuid,text,text,text,text,uuid,text,public.student_status) to authenticated;
grant execute on function public.update_student_admin(uuid,text,text,text,text,uuid,text,public.student_status) to authenticated;
