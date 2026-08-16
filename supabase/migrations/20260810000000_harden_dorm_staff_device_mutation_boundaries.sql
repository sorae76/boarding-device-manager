-- Phase 2A-1: remove broad Dorm Staff mutation privileges from the active
-- residence device custody subsystem and expose explicit business operations.

create or replace function public.can_administer_custody_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.app_users app_user
      join public.app_user_school_roles membership
        on membership.user_id = app_user.id
       and membership.school_id = target_school_id
       and membership.is_active = true
      join public.schools school
        on school.id = membership.school_id
       and school.is_active = true
      where app_user.id = auth.uid()
        and app_user.is_active = true
        and (
          app_user.global_role = 'super_admin'::public.app_global_role
          or membership.role = 'school_admin'::public.school_role
        )
    );
$$;

revoke all on function public.can_administer_custody_school(uuid) from public;
revoke all on function public.can_administer_custody_school(uuid) from anon;
grant execute on function public.can_administer_custody_school(uuid) to authenticated;

create or replace function public.transition_residence_device_custody(
  target_school_id uuid,
  target_device_id uuid,
  target_operation text,
  target_method public.device_custody_event_method default 'manual',
  target_notes text default null
)
returns table (
  outcome text,
  event_id uuid,
  device_id uuid,
  previous_status public.device_custody_status,
  current_status public.device_custody_status,
  performed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.school_role;
  caller_is_super_admin boolean := false;
  target_device public.device_custody_devices%rowtype;
  required_status public.device_custody_status;
  next_action public.device_custody_event_action;
  next_status public.device_custody_status;
  normalized_notes text := nullif(btrim(target_notes), '');
  new_event_id uuid;
  event_time timestamptz := now();
begin
  if caller_id is null then
    return query select 'not_authorized'::text, null::uuid, null::uuid,
      null::public.device_custody_status, null::public.device_custody_status, null::timestamptz;
    return;
  end if;

  if target_school_id is null or target_device_id is null then
    raise exception 'custody_transition_invalid_target';
  end if;

  if target_operation = 'return' then
    required_status := 'checked_out';
    next_action := 'returned';
    next_status := 'returned';
  elsif target_operation = 'release' then
    required_status := 'returned';
    next_action := 'checked_out';
    next_status := 'checked_out';
  elsif target_operation = 'mark_missing' then
    required_status := null;
    next_action := 'marked_missing';
    next_status := 'lost';
  elsif target_operation = 'recover_missing' then
    required_status := 'lost';
    next_action := 'returned';
    next_status := 'returned';
  else
    raise exception 'custody_transition_invalid_operation';
  end if;

  if target_method is null or target_method not in ('qr_scan', 'manual') then
    raise exception 'custody_transition_invalid_method';
  end if;

  if char_length(coalesce(normalized_notes, '')) > 1000 then
    raise exception 'custody_transition_notes_too_long';
  end if;

  select membership.role,
    app_user.global_role = 'super_admin'::public.app_global_role
  into caller_role, caller_is_super_admin
  from public.app_users app_user
  join public.app_user_school_roles membership
    on membership.user_id = app_user.id
   and membership.school_id = target_school_id
   and membership.is_active = true
  join public.schools school
    on school.id = membership.school_id
   and school.is_active = true
  where app_user.id = caller_id
    and app_user.is_active = true
  limit 1;

  if not found
    or not (caller_is_super_admin or caller_role in ('school_admin', 'dorm_staff'))
  then
    return query select 'not_authorized'::text, null::uuid, null::uuid,
      null::public.device_custody_status, null::public.device_custody_status, null::timestamptz;
    return;
  end if;

  select device.*
  into target_device
  from public.device_custody_devices device
  where device.school_id = target_school_id
    and device.id = target_device_id
  for update;

  if not found then
    return query select 'not_available'::text, null::uuid, null::uuid,
      null::public.device_custody_status, null::public.device_custody_status, null::timestamptz;
    return;
  end if;

  if caller_role = 'dorm_staff'::public.school_role
    and not public.can_access_custody_student(target_school_id, target_device.student_id)
  then
    return query select 'not_available'::text, null::uuid, null::uuid,
      null::public.device_custody_status, null::public.device_custody_status, null::timestamptz;
    return;
  end if;

  if (
    target_operation = 'mark_missing'
    and target_device.status not in ('checked_out', 'returned')
  ) or (
    target_operation <> 'mark_missing'
    and target_device.status <> required_status
  ) then
    return query select 'stale_status'::text, null::uuid, target_device.id,
      target_device.status, target_device.status, null::timestamptz;
    return;
  end if;

  insert into public.device_custody_events (
    school_id, device_id, student_id, action, method,
    performed_by_user_id, performed_at, notes
  ) values (
    target_device.school_id, target_device.id, target_device.student_id,
    next_action, target_method, caller_id, event_time, normalized_notes
  )
  returning id into new_event_id;

  return query select 'applied'::text, new_event_id, target_device.id,
    target_device.status, next_status, event_time;
end;
$$;

revoke all on function public.transition_residence_device_custody(
  uuid, uuid, text, public.device_custody_event_method, text
) from public;
revoke all on function public.transition_residence_device_custody(
  uuid, uuid, text, public.device_custody_event_method, text
) from anon;
grant execute on function public.transition_residence_device_custody(
  uuid, uuid, text, public.device_custody_event_method, text
) to authenticated;

create or replace function public.register_residence_device(
  target_student_id uuid,
  target_device_type public.device_type,
  target_manufacturer text,
  target_model text,
  target_color text,
  target_serial_number text default null,
  target_asset_tag text default null,
  target_return_due_at timestamptz default null,
  target_notes text default null,
  target_initial_status public.device_custody_status default 'checked_out'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  target_student public.students%rowtype;
  normalized_manufacturer text := btrim(target_manufacturer);
  normalized_model text := btrim(target_model);
  normalized_color text := btrim(target_color);
  normalized_serial text := nullif(btrim(target_serial_number), '');
  normalized_asset_tag text := nullif(btrim(target_asset_tag), '');
  normalized_notes text := nullif(btrim(target_notes), '');
  new_device_id uuid;
begin
  if caller_id is null or target_student_id is null or target_device_type is null
    or normalized_manufacturer is null or normalized_manufacturer = ''
    or normalized_model is null or normalized_model = ''
    or normalized_color is null or normalized_color = ''
    or target_initial_status is null
  then
    raise exception 'custody_device_registration_invalid_input';
  end if;

  select student.* into target_student
  from public.students student
  join public.schools school
    on school.id = student.school_id
   and school.is_active = true
  where student.id = target_student_id;

  if not found
    or not public.can_access_custody_student(target_student.school_id, target_student.id)
  then
    raise exception 'custody_device_registration_not_available';
  end if;

  if not public.can_administer_custody_school(target_student.school_id)
    and target_initial_status not in ('checked_out', 'returned')
  then
    raise exception 'custody_device_registration_invalid_initial_status';
  end if;

  insert into public.device_custody_devices (
    school_id, student_id, device_type, manufacturer, model, color,
    serial_number, asset_tag, status, return_due_at, notes,
    created_by_user_id, updated_by_user_id
  ) values (
    target_student.school_id, target_student.id, target_device_type,
    normalized_manufacturer, normalized_model, normalized_color,
    normalized_serial, normalized_asset_tag, target_initial_status,
    target_return_due_at, normalized_notes, caller_id, caller_id
  ) returning id into new_device_id;

  return new_device_id;
exception
  when unique_violation then
    raise exception 'custody_device_registration_duplicate_identifier';
end;
$$;

create or replace function public.correct_residence_device_identity(
  target_device_id uuid,
  target_device_type public.device_type,
  target_manufacturer text,
  target_model text,
  target_color text,
  target_serial_number text default null,
  target_asset_tag text default null,
  target_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_device public.device_custody_devices%rowtype;
  normalized_manufacturer text := btrim(target_manufacturer);
  normalized_model text := btrim(target_model);
  normalized_color text := btrim(target_color);
begin
  if auth.uid() is null or target_device_id is null or target_device_type is null
    or normalized_manufacturer is null or normalized_manufacturer = ''
    or normalized_model is null or normalized_model = ''
    or normalized_color is null or normalized_color = ''
  then
    raise exception 'custody_device_identity_invalid_input';
  end if;

  select device.* into target_device
  from public.device_custody_devices device
  where device.id = target_device_id
  for update;

  if not found
    or not public.can_access_custody_student(target_device.school_id, target_device.student_id)
  then
    raise exception 'custody_device_identity_not_available';
  end if;

  update public.device_custody_devices
  set device_type = target_device_type,
      manufacturer = normalized_manufacturer,
      model = normalized_model,
      color = normalized_color,
      serial_number = nullif(btrim(target_serial_number), ''),
      asset_tag = nullif(btrim(target_asset_tag), ''),
      notes = nullif(btrim(target_notes), ''),
      updated_by_user_id = auth.uid()
  where id = target_device.id and school_id = target_device.school_id;
exception
  when unique_violation then
    raise exception 'custody_device_identity_duplicate_identifier';
end;
$$;

create or replace function public.set_residence_device_return_deadline(
  target_device_id uuid,
  target_return_due_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_device public.device_custody_devices%rowtype;
begin
  if auth.uid() is null or target_device_id is null then
    raise exception 'custody_device_deadline_invalid_input';
  end if;

  select device.* into target_device
  from public.device_custody_devices device
  where device.id = target_device_id
  for update;

  if not found
    or not public.can_access_custody_student(target_device.school_id, target_device.student_id)
  then
    raise exception 'custody_device_deadline_not_available';
  end if;

  update public.device_custody_devices
  set return_due_at = target_return_due_at
  where id = target_device.id and school_id = target_device.school_id;
end;
$$;

create or replace function public.review_residence_device_notice(
  target_notice_id uuid,
  target_status public.device_custody_notice_status,
  target_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_notice public.device_custody_notices%rowtype;
  target_device public.device_custody_devices%rowtype;
  normalized_notes text := nullif(btrim(target_review_notes), '');
begin
  if auth.uid() is null or target_notice_id is null or target_status is null
    or target_status not in ('reviewed', 'excused', 'violation_foundation')
    or char_length(coalesce(normalized_notes, '')) > 1000
  then
    raise exception 'custody_notice_review_invalid_input';
  end if;

  select notice.* into target_notice
  from public.device_custody_notices notice
  where notice.id = target_notice_id
  for update;

  if not found then
    raise exception 'custody_notice_review_not_available';
  end if;

  select device.* into target_device
  from public.device_custody_devices device
  where device.school_id = target_notice.school_id
    and device.id = target_notice.device_id;

  if not found or (
    not public.can_administer_custody_school(target_notice.school_id)
    and (
      target_notice.student_id is null
      or target_device.student_id <> target_notice.student_id
      or not public.can_access_custody_student(target_notice.school_id, target_notice.student_id)
    )
  ) then
    raise exception 'custody_notice_review_not_available';
  end if;

  update public.device_custody_notices
  set status = target_status,
      reviewed_by_user_id = auth.uid(),
      reviewed_at = now(),
      review_notes = normalized_notes
  where school_id = target_notice.school_id and id = target_notice.id;
end;
$$;

revoke all on function public.register_residence_device(
  uuid, public.device_type, text, text, text, text, text, timestamptz, text,
  public.device_custody_status
) from public, anon;
grant execute on function public.register_residence_device(
  uuid, public.device_type, text, text, text, text, text, timestamptz, text,
  public.device_custody_status
) to authenticated;

revoke all on function public.correct_residence_device_identity(
  uuid, public.device_type, text, text, text, text, text, text
) from public, anon;
grant execute on function public.correct_residence_device_identity(
  uuid, public.device_type, text, text, text, text, text, text
) to authenticated;

revoke all on function public.set_residence_device_return_deadline(uuid, timestamptz)
from public, anon;
grant execute on function public.set_residence_device_return_deadline(uuid, timestamptz)
to authenticated;

revoke all on function public.review_residence_device_notice(
  uuid, public.device_custody_notice_status, text
) from public, anon;
grant execute on function public.review_residence_device_notice(
  uuid, public.device_custody_notice_status, text
) to authenticated;

drop policy if exists "authorized staff create custody devices" on public.device_custody_devices;
drop policy if exists "authorized staff update custody devices" on public.device_custody_devices;

create policy "custody admins create custody devices"
on public.device_custody_devices
for insert
to authenticated
with check (
  public.can_administer_custody_school(school_id)
  and created_by_user_id = auth.uid()
);

create policy "custody admins update custody devices"
on public.device_custody_devices
for update
to authenticated
using (public.can_administer_custody_school(school_id))
with check (
  public.can_administer_custody_school(school_id)
  and updated_by_user_id = auth.uid()
);

drop policy if exists "authorized staff create custody events" on public.device_custody_events;

create policy "custody admins create custody events"
on public.device_custody_events
for insert
to authenticated
with check (
  public.can_administer_custody_school(school_id)
  and performed_by_user_id = auth.uid()
  and exists (
    select 1
    from public.device_custody_devices device
    where device.school_id = device_custody_events.school_id
      and device.id = device_custody_events.device_id
      and (
        device_custody_events.student_id is null
        or device.student_id = device_custody_events.student_id
      )
  )
);

drop policy if exists "authorized staff update custody notices" on public.device_custody_notices;

create policy "custody admins update custody notices"
on public.device_custody_notices
for update
to authenticated
using (public.can_administer_custody_school(school_id))
with check (
  public.can_administer_custody_school(school_id)
  and reviewed_by_user_id = auth.uid()
);
