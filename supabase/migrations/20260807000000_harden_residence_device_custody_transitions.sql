-- Phase 2A-0: residence-scoped custody access and atomic return/release transitions.

create or replace function public.can_access_custody_student(
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
      select 1
      from public.app_users au
      where au.id = auth.uid()
        and au.is_active = true
    )
    and exists (
      select 1
      from public.schools school
      where school.id = target_school_id
        and school.is_active = true
    )
    and (
      exists (
        select 1
        from public.app_users au
        join public.app_user_school_roles membership
          on membership.user_id = au.id
         and membership.school_id = target_school_id
         and membership.is_active = true
        where au.id = auth.uid()
          and au.is_active = true
          and (
            au.global_role = 'super_admin'::public.app_global_role
            or membership.role = 'school_admin'::public.school_role
          )
      )
      or exists (
        select 1
        from public.app_user_school_roles membership
        join public.students student
          on student.id = target_student_id
         and student.school_id = target_school_id
        join public.dorms residence
          on residence.id = student.dorm_id
         and residence.school_id = target_school_id
         and residence.is_active = true
        join public.dorm_staff_assignments assignment
          on assignment.school_id = target_school_id
         and assignment.dorm_id = residence.id
         and assignment.user_id = membership.user_id
         and assignment.is_active = true
         and assignment.starts_at <= now()
         and (assignment.ends_at is null or assignment.ends_at > now())
        where membership.user_id = auth.uid()
          and membership.school_id = target_school_id
          and membership.role = 'dorm_staff'::public.school_role
          and membership.is_active = true
      )
    );
$$;

revoke all on function public.can_access_custody_student(uuid, uuid) from public;
revoke all on function public.can_access_custody_student(uuid, uuid) from anon;
grant execute on function public.can_access_custody_student(uuid, uuid) to authenticated;

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
    au.global_role = 'super_admin'::public.app_global_role
  into caller_role, caller_is_super_admin
  from public.app_users au
  join public.app_user_school_roles membership
    on membership.user_id = au.id
   and membership.school_id = target_school_id
   and membership.is_active = true
  join public.schools school
    on school.id = membership.school_id
   and school.is_active = true
  where au.id = caller_id
    and au.is_active = true
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

  if target_device.status <> required_status then
    return query select 'stale_status'::text, null::uuid, target_device.id,
      target_device.status, target_device.status, null::timestamptz;
    return;
  end if;

  insert into public.device_custody_events (
    school_id,
    device_id,
    student_id,
    action,
    method,
    performed_by_user_id,
    performed_at,
    notes
  ) values (
    target_device.school_id,
    target_device.id,
    target_device.student_id,
    next_action,
    target_method,
    caller_id,
    event_time,
    normalized_notes
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

drop policy if exists "authorized staff read custody devices" on public.device_custody_devices;
drop policy if exists "authorized staff create custody devices" on public.device_custody_devices;
drop policy if exists "authorized staff update custody devices" on public.device_custody_devices;

create policy "authorized staff read custody devices"
on public.device_custody_devices
for select
to authenticated
using (public.can_access_custody_student(school_id, student_id));

create policy "authorized staff create custody devices"
on public.device_custody_devices
for insert
to authenticated
with check (
  public.can_access_custody_student(school_id, student_id)
  and created_by_user_id = auth.uid()
);

create policy "authorized staff update custody devices"
on public.device_custody_devices
for update
to authenticated
using (public.can_access_custody_student(school_id, student_id))
with check (
  public.can_access_custody_student(school_id, student_id)
  and updated_by_user_id = auth.uid()
);

drop policy if exists "authorized staff read custody events" on public.device_custody_events;
drop policy if exists "authorized staff create custody events" on public.device_custody_events;

create policy "authorized staff read custody events"
on public.device_custody_events
for select
to authenticated
using (
  exists (
    select 1
    from public.device_custody_devices device
    where device.school_id = device_custody_events.school_id
      and device.id = device_custody_events.device_id
      and (
        (
          device_custody_events.student_id is null
          and public.can_access_custody_student(device_custody_events.school_id, null)
        )
        or (
          device.student_id = device_custody_events.student_id
          and public.can_access_custody_student(
            device_custody_events.school_id,
            device_custody_events.student_id
          )
        )
      )
  )
);

create policy "authorized staff create custody events"
on public.device_custody_events
for insert
to authenticated
with check (
  performed_by_user_id = auth.uid()
  and exists (
    select 1
    from public.device_custody_devices device
    where device.school_id = device_custody_events.school_id
      and device.id = device_custody_events.device_id
      and (
        (
          device_custody_events.student_id is null
          and public.can_access_custody_student(device_custody_events.school_id, null)
        )
        or (
          device.student_id = device_custody_events.student_id
          and public.can_access_custody_student(
            device_custody_events.school_id,
            device_custody_events.student_id
          )
          and (
            device_custody_events.action in ('marked_missing', 'exception')
            or (
              device_custody_events.action = 'returned'
              and device.status = 'lost'
            )
          )
        )
      )
  )
);
