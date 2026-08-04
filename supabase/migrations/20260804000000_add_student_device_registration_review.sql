-- Phase 1B: atomic staff review of student device registration requests.

create unique index device_custody_devices_school_normalized_serial_unique
  on public.device_custody_devices (school_id, lower(btrim(serial_number)))
  where serial_number is not null and btrim(serial_number) <> '';

create or replace function public.can_review_student_device_registration(
  target_school_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.is_active = true
    )
    and exists (
      select 1 from public.schools sch
      where sch.id = target_school_id and sch.is_active = true
    )
    and exists (
      select 1
      from public.students s
      where s.id = target_student_id
        and s.school_id = target_school_id
        and s.status = 'active'
        and (
          exists (
            select 1 from public.app_user_school_roles role_membership
            where role_membership.user_id = auth.uid()
              and role_membership.school_id = target_school_id
              and role_membership.role = 'school_admin'::public.school_role
              and role_membership.is_active = true
          )
          or (
            public.is_super_admin()
            and public.has_active_school_membership(target_school_id)
          )
          or (
            exists (
              select 1 from public.app_user_school_roles dorm_staff_membership
              where dorm_staff_membership.user_id = auth.uid()
                and dorm_staff_membership.school_id = target_school_id
                and dorm_staff_membership.role = 'dorm_staff'::public.school_role
                and dorm_staff_membership.is_active = true
            )
            and s.dorm_id is not null
            and exists (
              select 1 from public.dorms residence
              where residence.id = s.dorm_id
                and residence.school_id = target_school_id
                and residence.is_active = true
                and public.has_dorm_access(target_school_id, residence.id)
            )
          )
        )
    );
$$;

revoke all on function public.can_review_student_device_registration(uuid, uuid) from public;
revoke all on function public.can_review_student_device_registration(uuid, uuid) from anon;
revoke all on function public.can_review_student_device_registration(uuid, uuid) from authenticated;

create or replace function public.get_student_device_registration_request_for_staff(
  target_school_id uuid,
  target_request_id uuid
)
returns table (
  request_id uuid,
  school_id uuid,
  student_id uuid,
  student_name text,
  student_number text,
  residence_name text,
  device_type public.device_type,
  manufacturer text,
  model text,
  color text,
  serial_number text,
  student_note text,
  status public.student_device_registration_status,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  approved_device_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.school_id, r.student_id,
    concat_ws(' ', s.first_name, s.last_name), s.student_number,
    residence.name, r.device_type, r.manufacturer, r.model, r.color,
    r.serial_number, r.student_note, r.status, r.submitted_at,
    r.reviewed_at, r.review_note, r.approved_device_id
  from public.student_device_registration_requests r
  join public.students s on s.id = r.student_id and s.school_id = r.school_id
  left join public.dorms residence
    on residence.id = s.dorm_id
   and residence.school_id = s.school_id
   and residence.is_active = true
  where r.id = target_request_id
    and r.school_id = target_school_id
    and public.can_review_student_device_registration(r.school_id, r.student_id)
  limit 1;
$$;

revoke all on function public.get_student_device_registration_request_for_staff(uuid, uuid) from public;
revoke all on function public.get_student_device_registration_request_for_staff(uuid, uuid) from anon;
grant execute on function public.get_student_device_registration_request_for_staff(uuid, uuid) to authenticated;

create or replace function public.approve_student_device_registration_request(
  target_school_id uuid,
  target_request_id uuid,
  target_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  registration public.student_device_registration_requests%rowtype;
  normalized_note text := nullif(btrim(target_review_note), '');
  normalized_serial text;
  new_device_id uuid;
begin
  if char_length(coalesce(normalized_note, '')) > 1000 then
    raise exception 'registration_review_invalid_note';
  end if;

  select * into registration
  from public.student_device_registration_requests r
  where r.id = target_request_id and r.school_id = target_school_id
  for update;

  if not found or not public.can_review_student_device_registration(
    target_school_id, registration.student_id
  ) then
    raise exception 'registration_review_not_available';
  end if;

  if registration.status = 'rejected' then
    raise exception 'registration_review_already_rejected';
  end if;

  if registration.status = 'approved' then
    if registration.approved_device_id is null then
      raise exception 'registration_review_conflict';
    end if;
    return registration.approved_device_id;
  end if;

  normalized_serial := btrim(registration.serial_number);
  perform pg_advisory_xact_lock(
    hashtextextended(target_school_id::text || ':' || lower(normalized_serial), 0)
  );

  if exists (
    select 1 from public.device_custody_devices d
    where d.school_id = target_school_id
      and d.serial_number is not null
      and lower(btrim(d.serial_number)) = lower(normalized_serial)
  ) then
    raise exception 'registration_review_duplicate_serial';
  end if;

  insert into public.device_custody_devices (
    school_id, student_id, device_type, manufacturer, model, color,
    serial_number, status, created_by_user_id, updated_by_user_id
  ) values (
    registration.school_id, registration.student_id, registration.device_type,
    registration.manufacturer, registration.model, registration.color,
    normalized_serial, 'checked_out', auth.uid(), auth.uid()
  ) returning id into new_device_id;

  update public.student_device_registration_requests
  set status = 'approved', reviewed_by_user_id = auth.uid(), reviewed_at = now(),
      review_note = normalized_note, approved_device_id = new_device_id
  where id = registration.id and school_id = registration.school_id;

  return new_device_id;
exception
  when unique_violation then
    raise exception 'registration_review_duplicate_serial';
end;
$$;

revoke all on function public.approve_student_device_registration_request(uuid, uuid, text) from public;
revoke all on function public.approve_student_device_registration_request(uuid, uuid, text) from anon;
grant execute on function public.approve_student_device_registration_request(uuid, uuid, text) to authenticated;

create or replace function public.reject_student_device_registration_request(
  target_school_id uuid,
  target_request_id uuid,
  target_review_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  registration public.student_device_registration_requests%rowtype;
  normalized_note text := nullif(btrim(target_review_note), '');
begin
  if normalized_note is null or char_length(normalized_note) > 1000 then
    raise exception 'registration_review_invalid_note';
  end if;

  select * into registration
  from public.student_device_registration_requests r
  where r.id = target_request_id and r.school_id = target_school_id
  for update;

  if not found or not public.can_review_student_device_registration(
    target_school_id, registration.student_id
  ) then
    raise exception 'registration_review_not_available';
  end if;

  if registration.status = 'approved' then
    raise exception 'registration_review_already_approved';
  end if;

  if registration.status = 'rejected' then
    return;
  end if;

  update public.student_device_registration_requests
  set status = 'rejected', reviewed_by_user_id = auth.uid(), reviewed_at = now(),
      review_note = normalized_note, approved_device_id = null
  where id = registration.id and school_id = registration.school_id;
end;
$$;

revoke all on function public.reject_student_device_registration_request(uuid, uuid, text) from public;
revoke all on function public.reject_student_device_registration_request(uuid, uuid, text) from anon;
grant execute on function public.reject_student_device_registration_request(uuid, uuid, text) to authenticated;
