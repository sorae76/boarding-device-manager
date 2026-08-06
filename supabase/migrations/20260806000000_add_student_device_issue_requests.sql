-- Phase 1: student lost, broken, and disposal issue request contract.

create type public.student_device_issue_type as enum ('lost', 'broken', 'disposal');
create type public.student_device_issue_status as enum ('pending', 'approved', 'rejected');
create type public.student_device_issue_resolution as enum (
  'lost_marked_missing', 'broken_exception', 'disposal_inactivated'
);

alter table public.device_custody_devices
  add column qr_revoked_at timestamptz,
  add column qr_revoked_by_user_id uuid references public.app_users(id) on delete set null,
  add column qr_revocation_reason text,
  add constraint device_custody_devices_school_device_student_unique
    unique (school_id, id, student_id),
  add constraint device_custody_devices_qr_revocation_complete check (
    (qr_revoked_at is null and qr_revoked_by_user_id is null and qr_revocation_reason is null)
    or (qr_revoked_at is not null and qr_revoked_by_user_id is not null
        and nullif(btrim(qr_revocation_reason), '') is not null)
  );

create table public.student_device_issue_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  device_id uuid not null,
  request_type public.student_device_issue_type not null,
  student_reason text not null check (nullif(btrim(student_reason), '') is not null and char_length(student_reason) <= 1000),
  device_status_at_submission public.device_custody_status not null,
  status public.student_device_issue_status not null default 'pending',
  submitted_by_user_id uuid not null references public.app_users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.app_users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or (nullif(btrim(review_note), '') is not null and char_length(review_note) <= 1000)),
  resolution public.student_device_issue_resolution,
  device_status_before public.device_custody_status,
  device_status_after public.device_custody_status,
  applied_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict,
  foreign key (school_id, device_id, student_id)
    references public.device_custody_devices(school_id, id, student_id) on delete restrict,
  foreign key (school_id, applied_event_id) references public.device_custody_events(school_id, id) on delete restrict,
  check (
    (status = 'pending' and reviewed_by_user_id is null and reviewed_at is null and review_note is null
      and resolution is null and device_status_before is null and device_status_after is null and applied_event_id is null)
    or (status = 'rejected' and reviewed_by_user_id is not null and reviewed_at is not null and review_note is not null
      and resolution is null and device_status_before is null and device_status_after is null and applied_event_id is null)
    or (status = 'approved' and reviewed_by_user_id is not null and reviewed_at is not null
      and resolution is not null and device_status_before is not null and device_status_after is not null and applied_event_id is not null)
  ),
  check (
    resolution is null
    or (request_type = 'lost' and resolution = 'lost_marked_missing')
    or (request_type = 'broken' and resolution = 'broken_exception')
    or (request_type = 'disposal' and resolution = 'disposal_inactivated')
  ),
  constraint student_device_issue_approved_note_required check (
    status <> 'approved' or request_type = 'lost' or review_note is not null
  )
);

create unique index student_device_issue_one_pending_type_idx
  on public.student_device_issue_requests (school_id, device_id, request_type)
  where status = 'pending';
create index student_device_issue_school_status_idx
  on public.student_device_issue_requests (school_id, status, submitted_at desc);
create unique index student_device_issue_applied_event_unique_idx
  on public.student_device_issue_requests (school_id, applied_event_id)
  where applied_event_id is not null;

create trigger student_device_issue_requests_touch_updated_at
before update on public.student_device_issue_requests
for each row execute function public.touch_updated_at();

alter table public.student_device_issue_requests enable row level security;
revoke all privileges on table public.student_device_issue_requests from public;
revoke all privileges on table public.student_device_issue_requests from anon;
revoke all privileges on table public.student_device_issue_requests from authenticated;

create or replace function public.submit_current_student_device_issue(
  target_device_id uuid,
  target_request_type public.student_device_issue_type,
  target_student_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student record;
  target_device public.device_custody_devices%rowtype;
  normalized_reason text := nullif(btrim(target_student_reason), '');
  new_request_id uuid;
begin
  if auth.uid() is null or normalized_reason is null or char_length(normalized_reason) > 1000 then
    raise exception 'device_issue_invalid_submission';
  end if;

  select s.id, s.school_id into current_student
  from public.app_users au
  join public.app_user_school_roles membership on membership.user_id = au.id
    and membership.role = 'student'::public.school_role and membership.is_active = true
  join public.schools school on school.id = membership.school_id and school.is_active = true
  join public.students s on s.auth_user_id = au.id and s.school_id = membership.school_id and s.status = 'active'
  where au.id = auth.uid() and au.is_active = true
  limit 1;

  if not found then raise exception 'device_issue_student_not_available'; end if;

  select * into target_device from public.device_custody_devices d
  where d.id = target_device_id and d.school_id = current_student.school_id
    and d.student_id = current_student.id and d.status in ('checked_out', 'returned')
  for update;
  if not found then raise exception 'device_issue_device_not_available'; end if;

  insert into public.student_device_issue_requests (
    school_id, student_id, device_id, request_type, student_reason,
    device_status_at_submission, submitted_by_user_id
  ) values (
    current_student.school_id, current_student.id, target_device.id, target_request_type,
    normalized_reason, target_device.status, auth.uid()
  ) returning id into new_request_id;
  return new_request_id;
exception when unique_violation then
  raise exception 'device_issue_duplicate_pending';
end;
$$;

create or replace function public.list_current_student_device_issue_requests()
returns table (
  request_id uuid,
  device_id uuid,
  device_type public.device_type,
  manufacturer text,
  model text,
  color text,
  serial_number text,
  asset_tag text,
  request_type public.student_device_issue_type,
  student_reason text,
  status public.student_device_issue_status,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  resolution public.student_device_issue_resolution
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.id, d.id, d.device_type, d.manufacturer, d.model, d.color,
    d.serial_number, d.asset_tag, r.request_type, r.student_reason, r.status,
    r.submitted_at, r.reviewed_at, r.review_note, r.resolution
  from public.student_device_issue_requests r
  join public.students s on s.id = r.student_id and s.school_id = r.school_id
  join public.app_users au on au.id = s.auth_user_id and au.is_active = true
  join public.app_user_school_roles membership on membership.user_id = au.id
    and membership.school_id = r.school_id and membership.role = 'student'::public.school_role and membership.is_active = true
  join public.schools school on school.id = r.school_id and school.is_active = true
  join public.device_custody_devices d on d.id = r.device_id
    and d.school_id = r.school_id and d.student_id = r.student_id
  where au.id = auth.uid() and r.submitted_by_user_id = auth.uid()
  order by r.submitted_at desc, r.id;
$$;

create or replace function public.can_review_student_device_issue(
  target_school_id uuid, target_student_id uuid, target_request_type public.student_device_issue_type
)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from public.app_users au where au.id = auth.uid() and au.is_active = true)
    and exists (select 1 from public.schools school where school.id = target_school_id and school.is_active = true)
    and exists (
      select 1 from public.students s
      where s.id = target_student_id and s.school_id = target_school_id and s.status = 'active'
        and (
          exists (select 1 from public.app_user_school_roles admin_membership
            where admin_membership.user_id = auth.uid() and admin_membership.school_id = target_school_id
              and admin_membership.role = 'school_admin'::public.school_role and admin_membership.is_active = true)
          or (public.is_super_admin() and public.has_active_school_membership(target_school_id))
          or (target_request_type in ('lost', 'broken') and exists (
            select 1 from public.app_user_school_roles dorm_staff_membership
            where dorm_staff_membership.user_id = auth.uid() and dorm_staff_membership.school_id = target_school_id
              and dorm_staff_membership.role = 'dorm_staff'::public.school_role and dorm_staff_membership.is_active = true
          ) and s.dorm_id is not null and exists (
            select 1 from public.dorms residence where residence.id = s.dorm_id
              and residence.school_id = target_school_id and residence.is_active = true
              and public.has_dorm_access(target_school_id, residence.id)
          ))
        )
    );
$$;

create or replace function public.list_student_device_issue_requests_for_staff(
  target_school_id uuid, target_status public.student_device_issue_status default null
)
returns table (
  request_id uuid,
  student_id uuid,
  student_name text,
  student_number text,
  residence_name text,
  device_id uuid,
  device_type public.device_type,
  manufacturer text,
  model text,
  color text,
  serial_number text,
  asset_tag text,
  current_custody_status public.device_custody_status,
  device_status_at_submission public.device_custody_status,
  request_type public.student_device_issue_type,
  student_reason text,
  status public.student_device_issue_status,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  resolution public.student_device_issue_resolution
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.id, r.student_id, concat_ws(' ', s.first_name, s.last_name),
    s.student_number, residence.name, d.id, d.device_type, d.manufacturer,
    d.model, d.color, d.serial_number, d.asset_tag, d.status,
    r.device_status_at_submission, r.request_type, r.student_reason, r.status,
    r.submitted_at, r.reviewed_at, r.review_note, r.resolution
  from public.student_device_issue_requests r
  join public.students s on s.id = r.student_id and s.school_id = r.school_id
  left join public.dorms residence on residence.id = s.dorm_id
    and residence.school_id = s.school_id and residence.is_active = true
  join public.device_custody_devices d on d.id = r.device_id
    and d.school_id = r.school_id and d.student_id = r.student_id
  where r.school_id = target_school_id and (target_status is null or r.status = target_status)
    and public.can_review_student_device_issue(r.school_id, r.student_id, r.request_type)
  order by r.submitted_at desc, r.id;
$$;

create or replace function public.get_student_device_issue_request_for_staff(
  target_school_id uuid, target_request_id uuid
)
returns table (
  request_id uuid,
  student_id uuid,
  student_name text,
  student_number text,
  residence_name text,
  device_id uuid,
  device_type public.device_type,
  manufacturer text,
  model text,
  color text,
  serial_number text,
  asset_tag text,
  current_custody_status public.device_custody_status,
  device_status_at_submission public.device_custody_status,
  request_type public.student_device_issue_type,
  student_reason text,
  status public.student_device_issue_status,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  resolution public.student_device_issue_resolution
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.id, r.student_id, concat_ws(' ', s.first_name, s.last_name),
    s.student_number, residence.name, d.id, d.device_type, d.manufacturer,
    d.model, d.color, d.serial_number, d.asset_tag, d.status,
    r.device_status_at_submission, r.request_type, r.student_reason, r.status,
    r.submitted_at, r.reviewed_at, r.review_note, r.resolution
  from public.student_device_issue_requests r
  join public.students s on s.id = r.student_id and s.school_id = r.school_id
  left join public.dorms residence on residence.id = s.dorm_id
    and residence.school_id = s.school_id and residence.is_active = true
  join public.device_custody_devices d on d.id = r.device_id
    and d.school_id = r.school_id and d.student_id = r.student_id
  where r.school_id = target_school_id and r.id = target_request_id
    and public.can_review_student_device_issue(r.school_id, r.student_id, r.request_type)
  limit 1;
$$;

create or replace function public.approve_student_device_issue_request(
  target_school_id uuid, target_request_id uuid, target_review_note text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  issue public.student_device_issue_requests%rowtype;
  device public.device_custody_devices%rowtype;
  normalized_note text := nullif(btrim(target_review_note), '');
  new_event_id uuid;
  new_status public.device_custody_status;
  new_resolution public.student_device_issue_resolution;
begin
  if char_length(coalesce(normalized_note, '')) > 1000 then raise exception 'device_issue_review_invalid_note'; end if;

  select * into issue from public.student_device_issue_requests r
  where r.id = target_request_id and r.school_id = target_school_id for update;
  if not found or not public.can_review_student_device_issue(target_school_id, issue.student_id, issue.request_type) then
    raise exception 'device_issue_review_not_available';
  end if;
  if issue.status = 'rejected' then raise exception 'device_issue_review_already_rejected'; end if;
  if issue.status = 'approved' then return issue.applied_event_id; end if;
  if issue.request_type in ('broken', 'disposal') and normalized_note is null then
    raise exception 'device_issue_review_note_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_school_id::text || ':' || issue.device_id::text, 0));
  select * into device from public.device_custody_devices d
  where d.school_id = target_school_id and d.id = issue.device_id and d.student_id = issue.student_id for update;
  if not found then raise exception 'device_issue_device_not_available'; end if;

  if issue.request_type = 'lost' then
    if device.status not in ('checked_out', 'returned') then raise exception 'device_issue_lost_invalid_status'; end if;
    new_status := 'lost'; new_resolution := 'lost_marked_missing';
    insert into public.device_custody_events (school_id, device_id, student_id, action, method, performed_by_user_id, notes)
    values (issue.school_id, issue.device_id, issue.student_id, 'marked_missing', 'manual', auth.uid(), normalized_note)
    returning id into new_event_id;
  elsif issue.request_type = 'broken' then
    new_status := device.status; new_resolution := 'broken_exception';
    insert into public.device_custody_events (school_id, device_id, student_id, action, method, performed_by_user_id, notes)
    values (issue.school_id, issue.device_id, issue.student_id, 'exception', 'manual', auth.uid(), normalized_note)
    returning id into new_event_id;
  else
    if device.status <> 'returned' then raise exception 'device_issue_disposal_requires_returned'; end if;
    new_status := 'inactive'; new_resolution := 'disposal_inactivated';
    insert into public.device_custody_events (school_id, device_id, student_id, action, method, performed_by_user_id, notes)
    values (issue.school_id, issue.device_id, issue.student_id, 'exception', 'manual', auth.uid(), normalized_note)
    returning id into new_event_id;
    update public.device_custody_devices set status = 'inactive', updated_by_user_id = auth.uid(),
      qr_revoked_at = now(), qr_revoked_by_user_id = auth.uid(), qr_revocation_reason = normalized_note
    where school_id = issue.school_id and id = issue.device_id;
  end if;

  update public.student_device_issue_requests set status = 'approved', reviewed_by_user_id = auth.uid(),
    reviewed_at = now(), review_note = normalized_note, resolution = new_resolution,
    device_status_before = device.status, device_status_after = new_status, applied_event_id = new_event_id
  where school_id = issue.school_id and id = issue.id;
  return new_event_id;
end;
$$;

create or replace function public.reject_student_device_issue_request(
  target_school_id uuid, target_request_id uuid, target_review_note text
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare issue public.student_device_issue_requests%rowtype;
  normalized_note text := nullif(btrim(target_review_note), '');
begin
  if normalized_note is null or char_length(normalized_note) > 1000 then raise exception 'device_issue_review_note_required'; end if;
  select * into issue from public.student_device_issue_requests r
  where r.id = target_request_id and r.school_id = target_school_id for update;
  if not found or not public.can_review_student_device_issue(target_school_id, issue.student_id, issue.request_type) then
    raise exception 'device_issue_review_not_available';
  end if;
  if issue.status = 'approved' then raise exception 'device_issue_review_already_approved'; end if;
  if issue.status = 'rejected' then return; end if;
  update public.student_device_issue_requests set status = 'rejected', reviewed_by_user_id = auth.uid(),
    reviewed_at = now(), review_note = normalized_note
  where school_id = issue.school_id and id = issue.id;
end;
$$;

-- Replace the public pass lookup so disposal revocation hides the pass without deleting its token.
create or replace function public.get_device_pass_by_qr_token(target_qr_token uuid)
returns table (student_first_name text, student_last_name text, device_type public.device_type,
  manufacturer text, model text, status public.device_custody_status, return_due_at timestamptz, qr_token uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.first_name, s.last_name, d.device_type, d.manufacturer, d.model, d.status, d.return_due_at, d.qr_token
  from public.device_custody_devices d
  join public.students s on s.school_id = d.school_id and s.id = d.student_id
  where d.qr_token = target_qr_token and d.qr_revoked_at is null
  limit 1;
$$;

revoke all on function public.submit_current_student_device_issue(uuid, public.student_device_issue_type, text) from public, anon;
grant execute on function public.submit_current_student_device_issue(uuid, public.student_device_issue_type, text) to authenticated;
revoke all on function public.list_current_student_device_issue_requests() from public, anon;
grant execute on function public.list_current_student_device_issue_requests() to authenticated;
revoke all on function public.can_review_student_device_issue(uuid, uuid, public.student_device_issue_type) from public, anon, authenticated;
revoke all on function public.list_student_device_issue_requests_for_staff(uuid, public.student_device_issue_status) from public, anon;
grant execute on function public.list_student_device_issue_requests_for_staff(uuid, public.student_device_issue_status) to authenticated;
revoke all on function public.get_student_device_issue_request_for_staff(uuid, uuid) from public, anon;
grant execute on function public.get_student_device_issue_request_for_staff(uuid, uuid) to authenticated;
revoke all on function public.approve_student_device_issue_request(uuid, uuid, text) from public, anon;
grant execute on function public.approve_student_device_issue_request(uuid, uuid, text) to authenticated;
revoke all on function public.reject_student_device_issue_request(uuid, uuid, text) from public, anon;
grant execute on function public.reject_student_device_issue_request(uuid, uuid, text) to authenticated;
revoke all on function public.get_device_pass_by_qr_token(uuid) from public, anon;
grant execute on function public.get_device_pass_by_qr_token(uuid) to anon, authenticated;
