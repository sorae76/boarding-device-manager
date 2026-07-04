-- Phase 3B: student device pass, staff QR scan, and post-return app activity notices.
--
-- This migration is additive. It does not weaken existing RLS and does not add
-- Wi-Fi, MDM, background tracking, or automatic device detection.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'device_custody_notice_status'
  ) then
    create type public.device_custody_notice_status as enum (
      'pending',
      'reviewed',
      'excused',
      'violation_foundation'
    );
  end if;
end
$$;

create table if not exists public.device_custody_notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid,
  notice_type text not null,
  status public.device_custody_notice_status not null default 'pending',
  reason text not null,
  occurred_at timestamptz not null default now(),
  reviewed_by_user_id uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.device_custody_devices(school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict,
  check (notice_type in ('post_return_app_activity'))
);

create index if not exists device_custody_notices_school_status_idx
  on public.device_custody_notices (school_id, status, occurred_at desc);

create index if not exists device_custody_notices_school_device_idx
  on public.device_custody_notices (school_id, device_id, occurred_at desc);

create unique index if not exists device_custody_notices_one_pending_post_return_idx
  on public.device_custody_notices (school_id, device_id)
  where notice_type = 'post_return_app_activity'
    and status = 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'device_custody_notices_touch_updated_at'
  ) then
    create trigger device_custody_notices_touch_updated_at
    before update on public.device_custody_notices
    for each row execute function public.touch_updated_at();
  end if;
end
$$;

alter table public.device_custody_notices enable row level security;

revoke all privileges on table public.device_custody_notices from anon;
revoke all privileges on table public.device_custody_notices from public;

revoke all privileges on table public.device_custody_notices from authenticated;
grant select, update on table public.device_custody_notices to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_custody_notices'
      and policyname = 'authorized staff read custody notices'
  ) then
    create policy "authorized staff read custody notices"
    on public.device_custody_notices
    for select
    to authenticated
    using (
      public.has_school_role(
        school_id,
        array['school_admin','dorm_staff']::public.school_role[]
      )
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_custody_notices'
      and policyname = 'authorized staff update custody notices'
  ) then
    create policy "authorized staff update custody notices"
    on public.device_custody_notices
    for update
    to authenticated
    using (
      public.has_school_role(
        school_id,
        array['school_admin','dorm_staff']::public.school_role[]
      )
    )
    with check (
      public.has_school_role(
        school_id,
        array['school_admin','dorm_staff']::public.school_role[]
      )
      and reviewed_by_user_id = auth.uid()
    );
  end if;
end
$$;

drop function if exists public.get_device_pass_by_qr_token(uuid);

create or replace function public.get_device_pass_by_qr_token(target_qr_token uuid)
returns table (
  student_first_name text,
  student_last_name text,
  device_type public.device_type,
  manufacturer text,
  model text,
  status public.device_custody_status,
  return_due_at timestamptz,
  qr_token uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.first_name,
    s.last_name,
    dcd.device_type,
    dcd.manufacturer,
    dcd.model,
    dcd.status,
    dcd.return_due_at,
    dcd.qr_token
  from public.device_custody_devices dcd
  join public.students s
    on s.school_id = dcd.school_id
   and s.id = dcd.student_id
  where dcd.qr_token = target_qr_token
  limit 1;
$$;

create or replace function public.record_device_pass_open(target_qr_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_device record;
begin
  select
    dcd.id,
    dcd.school_id,
    dcd.student_id,
    dcd.status
  into target_device
  from public.device_custody_devices dcd
  where dcd.qr_token = target_qr_token
  limit 1;

  if not found or target_device.status <> 'returned' then
    return;
  end if;

  if exists (
    select 1
    from public.device_custody_notices dcn
    where dcn.school_id = target_device.school_id
      and dcn.device_id = target_device.id
      and dcn.notice_type = 'post_return_app_activity'
      and dcn.status = 'pending'
  ) then
    return;
  end if;

  begin
    insert into public.device_custody_notices (
      school_id,
      device_id,
      student_id,
      notice_type,
      reason
    )
    values (
      target_device.school_id,
      target_device.id,
      target_device.student_id,
      'post_return_app_activity',
      'Device pass opened after returned status'
    );
  exception
    when unique_violation then
      return;
  end;
end;
$$;

grant execute on function public.get_device_pass_by_qr_token(uuid) to anon, authenticated;
grant execute on function public.record_device_pass_open(uuid) to anon, authenticated;
