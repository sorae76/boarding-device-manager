-- Phase 1A: student-submitted device registration requests remain separate
-- from the operational custody registry until a future approval workflow.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'student_device_registration_status'
  ) then
    create type public.student_device_registration_status as enum (
      'pending', 'approved', 'rejected'
    );
  end if;
end
$$;

create table public.student_device_registration_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  device_type public.device_type not null,
  manufacturer text not null,
  model text not null,
  color text not null,
  serial_number text not null,
  student_note text,
  status public.student_device_registration_status not null default 'pending',
  submitted_by_user_id uuid not null references public.app_users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.app_users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  approved_device_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, student_id)
    references public.students(school_id, id) on delete restrict,
  foreign key (school_id, approved_device_id)
    references public.device_custody_devices(school_id, id) on delete restrict,
  constraint student_device_registration_manufacturer_valid
    check (manufacturer = btrim(manufacturer) and manufacturer <> '' and char_length(manufacturer) <= 100),
  constraint student_device_registration_model_valid
    check (model = btrim(model) and model <> '' and char_length(model) <= 100),
  constraint student_device_registration_color_valid
    check (color = btrim(color) and color <> '' and char_length(color) <= 50),
  constraint student_device_registration_serial_valid
    check (serial_number = btrim(serial_number) and serial_number <> '' and char_length(serial_number) <= 200),
  constraint student_device_registration_student_note_valid
    check (student_note is null or (student_note = btrim(student_note) and student_note <> '' and char_length(student_note) <= 1000)),
  constraint student_device_registration_review_note_valid
    check (review_note is null or (review_note = btrim(review_note) and review_note <> '' and char_length(review_note) <= 1000)),
  constraint student_device_registration_lifecycle_valid check (
    (status = 'pending' and reviewed_by_user_id is null and reviewed_at is null
      and review_note is null and approved_device_id is null)
    or
    (status = 'approved' and reviewed_by_user_id is not null and reviewed_at is not null
      and approved_device_id is not null)
    or
    (status = 'rejected' and reviewed_by_user_id is not null and reviewed_at is not null
      and approved_device_id is null)
  )
);

create index student_device_registration_school_status_submitted_idx
  on public.student_device_registration_requests (school_id, status, submitted_at desc);

create index student_device_registration_student_submitted_idx
  on public.student_device_registration_requests (student_id, submitted_at desc);

create unique index student_device_registration_pending_serial_unique
  on public.student_device_registration_requests (school_id, lower(btrim(serial_number)))
  where status = 'pending';

create trigger student_device_registration_requests_touch_updated_at
before update on public.student_device_registration_requests
for each row execute function public.touch_updated_at();

alter table public.student_device_registration_requests enable row level security;
revoke all privileges on table public.student_device_registration_requests from public;
revoke all privileges on table public.student_device_registration_requests from anon;
revoke all privileges on table public.student_device_registration_requests from authenticated;

create or replace function public.submit_current_student_device_registration(
  target_device_type public.device_type,
  target_manufacturer text,
  target_model text,
  target_color text,
  target_serial_number text,
  target_student_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_auth_id uuid := auth.uid();
  current_student public.students%rowtype;
  student_count integer;
  normalized_manufacturer text := btrim(target_manufacturer);
  normalized_model text := btrim(target_model);
  normalized_color text := btrim(target_color);
  normalized_serial text := btrim(target_serial_number);
  normalized_note text := nullif(btrim(target_student_note), '');
  new_request_id uuid;
begin
  if current_auth_id is null then
    raise exception 'student_registration_auth_required';
  end if;

  if target_device_type is null
    or normalized_manufacturer is null or normalized_manufacturer = ''
    or normalized_model is null or normalized_model = ''
    or normalized_color is null or normalized_color = ''
    or normalized_serial is null or normalized_serial = ''
  then
    raise exception 'student_registration_invalid_input';
  end if;

  if char_length(normalized_manufacturer) > 100
    or char_length(normalized_model) > 100
    or char_length(normalized_color) > 50
    or char_length(normalized_serial) > 200
    or char_length(coalesce(normalized_note, '')) > 1000
  then
    raise exception 'student_registration_invalid_input';
  end if;

  select count(*) into student_count
  from public.students s
  join public.schools sch on sch.id = s.school_id and sch.is_active = true
  join public.app_users au on au.id = current_auth_id and au.is_active = true
  join public.app_user_school_roles ausr
    on ausr.user_id = current_auth_id
   and ausr.school_id = s.school_id
   and ausr.role = 'student'::public.school_role
   and ausr.is_active = true
  where s.auth_user_id = current_auth_id
    and s.status = 'active';

  if student_count <> 1 then
    raise exception 'student_registration_identity_invalid';
  end if;

  select s.* into current_student
  from public.students s
  join public.schools sch on sch.id = s.school_id and sch.is_active = true
  join public.app_users au on au.id = current_auth_id and au.is_active = true
  join public.app_user_school_roles ausr
    on ausr.user_id = current_auth_id
   and ausr.school_id = s.school_id
   and ausr.role = 'student'::public.school_role
   and ausr.is_active = true
  where s.auth_user_id = current_auth_id
    and s.status = 'active';

  perform pg_advisory_xact_lock(
    hashtextextended(current_student.school_id::text || ':' || lower(normalized_serial), 0)
  );

  if exists (
    select 1 from public.student_device_registration_requests r
    where r.school_id = current_student.school_id
      and r.status = 'pending'
      and lower(btrim(r.serial_number)) = lower(normalized_serial)
  ) or exists (
    select 1 from public.device_custody_devices d
    where d.school_id = current_student.school_id
      and d.serial_number is not null
      and lower(btrim(d.serial_number)) = lower(normalized_serial)
  ) then
    raise exception 'student_registration_duplicate';
  end if;

  insert into public.student_device_registration_requests (
    school_id, student_id, device_type, manufacturer, model, color,
    serial_number, student_note, status, submitted_by_user_id
  ) values (
    current_student.school_id, current_student.id, target_device_type,
    normalized_manufacturer, normalized_model, normalized_color,
    normalized_serial, normalized_note, 'pending', current_auth_id
  ) returning id into new_request_id;

  return new_request_id;
end;
$$;

revoke all on function public.submit_current_student_device_registration(
  public.device_type, text, text, text, text, text
) from public;
revoke all on function public.submit_current_student_device_registration(
  public.device_type, text, text, text, text, text
) from anon;
grant execute on function public.submit_current_student_device_registration(
  public.device_type, text, text, text, text, text
) to authenticated;

create or replace function public.list_current_student_device_registration_requests()
returns table (
  request_id uuid,
  device_type public.device_type,
  manufacturer text,
  model text,
  color text,
  serial_number text,
  student_note text,
  status public.student_device_registration_status,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.device_type, r.manufacturer, r.model, r.color,
    r.serial_number, r.student_note, r.status, r.submitted_at,
    r.reviewed_at, r.review_note
  from public.student_device_registration_requests r
  join public.students s
    on s.id = r.student_id and s.school_id = r.school_id
   and s.auth_user_id = auth.uid() and s.status = 'active'
  join public.schools sch on sch.id = r.school_id and sch.is_active = true
  join public.app_users au on au.id = auth.uid() and au.is_active = true
  join public.app_user_school_roles ausr
    on ausr.user_id = auth.uid() and ausr.school_id = r.school_id
   and ausr.role = 'student'::public.school_role and ausr.is_active = true
  order by r.submitted_at desc, r.id;
$$;

revoke all on function public.list_current_student_device_registration_requests() from public;
revoke all on function public.list_current_student_device_registration_requests() from anon;
grant execute on function public.list_current_student_device_registration_requests() to authenticated;

create or replace function public.list_student_device_registration_requests_for_staff(
  target_school_id uuid
)
returns table (
  request_id uuid,
  student_name text,
  student_number text,
  residence_name text,
  device_type public.device_type,
  manufacturer text,
  model text,
  color text,
  serial_number text,
  submitted_at timestamptz,
  status public.student_device_registration_status
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, concat_ws(' ', s.first_name, s.last_name), s.student_number,
    d.name, r.device_type, r.manufacturer, r.model, r.color,
    r.serial_number, r.submitted_at, r.status
  from public.student_device_registration_requests r
  join public.students s on s.id = r.student_id and s.school_id = r.school_id
  left join public.dorms d on d.id = s.dorm_id and d.school_id = s.school_id
  where r.school_id = target_school_id
    and r.status = 'pending'
    and exists (select 1 from public.app_users au where au.id = auth.uid() and au.is_active = true)
    and exists (
      select 1
      from public.schools active_school
      where active_school.id = target_school_id
        and active_school.is_active = true
    )
    and (
      exists (
        select 1 from public.app_user_school_roles ausr
        where ausr.user_id = auth.uid() and ausr.school_id = target_school_id
          and ausr.role = 'school_admin'::public.school_role and ausr.is_active = true
      )
      or (
        public.is_super_admin()
        and public.has_active_school_membership(target_school_id)
      )
      or (
        exists (
          select 1 from public.app_user_school_roles ausr
          where ausr.user_id = auth.uid() and ausr.school_id = target_school_id
            and ausr.role = 'dorm_staff'::public.school_role and ausr.is_active = true
        )
        and s.status = 'active'
        and s.dorm_id is not null
        and exists (
          select 1
          from public.dorms active_dorm
          where active_dorm.id = s.dorm_id
            and active_dorm.school_id = target_school_id
            and active_dorm.is_active = true
            and public.has_dorm_access(target_school_id, active_dorm.id)
        )
      )
    )
  order by r.submitted_at desc, r.id;
$$;

revoke all on function public.list_student_device_registration_requests_for_staff(uuid) from public;
revoke all on function public.list_student_device_registration_requests_for_staff(uuid) from anon;
grant execute on function public.list_student_device_registration_requests_for_staff(uuid) to authenticated;
