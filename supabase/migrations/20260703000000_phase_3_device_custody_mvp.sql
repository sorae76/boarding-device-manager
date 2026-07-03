-- Phase 3 MVP: boarding student device custody and return control.
--
-- This migration is additive. It creates a small custody surface for manual
-- device registration and return confirmation without Wi-Fi, MDM, background
-- tracking, automatic device detection, or destructive changes to Phase 1
-- workflow tables.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'device_custody_status'
  ) then
    create type public.device_custody_status as enum (
      'checked_out',
      'returned',
      'inactive',
      'lost'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'device_custody_event_action'
  ) then
    create type public.device_custody_event_action as enum (
      'returned',
      'checked_out',
      'marked_missing',
      'exception'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'device_custody_event_method'
  ) then
    create type public.device_custody_event_method as enum (
      'qr_scan',
      'manual'
    );
  end if;
end
$$;

create table if not exists public.device_custody_devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  device_type public.device_type not null,
  manufacturer text not null,
  model text not null,
  color text not null,
  serial_number text,
  asset_tag text,
  qr_token uuid not null default gen_random_uuid(),
  status public.device_custody_status not null default 'checked_out',
  return_due_at timestamptz,
  notes text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, qr_token),
  unique (school_id, serial_number),
  unique (school_id, asset_tag),
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict
);

create table if not exists public.device_custody_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid,
  action public.device_custody_event_action not null,
  method public.device_custody_event_method not null,
  performed_by_user_id uuid not null references public.app_users(id) on delete restrict,
  performed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.device_custody_devices(school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict
);

create index if not exists device_custody_devices_school_status_idx
  on public.device_custody_devices (school_id, status, return_due_at);

create index if not exists device_custody_devices_school_student_idx
  on public.device_custody_devices (school_id, student_id);

create index if not exists device_custody_events_school_performed_idx
  on public.device_custody_events (school_id, performed_at desc);

create index if not exists device_custody_events_school_device_idx
  on public.device_custody_events (school_id, device_id, performed_at desc);

create or replace function public.apply_device_custody_event_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action = 'returned' then
    update public.device_custody_devices
    set status = 'returned',
        updated_by_user_id = new.performed_by_user_id
    where school_id = new.school_id
      and id = new.device_id;
  elsif new.action = 'checked_out' then
    update public.device_custody_devices
    set status = 'checked_out',
        updated_by_user_id = new.performed_by_user_id
    where school_id = new.school_id
      and id = new.device_id;
  elsif new.action = 'marked_missing' then
    update public.device_custody_devices
    set status = 'lost',
        updated_by_user_id = new.performed_by_user_id
    where school_id = new.school_id
      and id = new.device_id;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'device_custody_devices_touch_updated_at'
  ) then
    create trigger device_custody_devices_touch_updated_at
    before update on public.device_custody_devices
    for each row execute function public.touch_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'device_custody_events_apply_status'
  ) then
    create trigger device_custody_events_apply_status
    after insert on public.device_custody_events
    for each row execute function public.apply_device_custody_event_status();
  end if;
end
$$;

alter table public.device_custody_devices enable row level security;
alter table public.device_custody_events enable row level security;

revoke all privileges on table public.device_custody_devices from authenticated;
revoke all privileges on table public.device_custody_events from authenticated;
grant select, insert, update on table public.device_custody_devices to authenticated;
grant select, insert on table public.device_custody_events to authenticated;
grant select on table public.students to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_custody_devices'
      and policyname = 'authorized staff read custody devices'
  ) then
    create policy "authorized staff read custody devices"
    on public.device_custody_devices
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
      and tablename = 'device_custody_devices'
      and policyname = 'authorized staff create custody devices'
  ) then
    create policy "authorized staff create custody devices"
    on public.device_custody_devices
    for insert
    to authenticated
    with check (
      public.has_school_role(
        school_id,
        array['school_admin','dorm_staff']::public.school_role[]
      )
      and created_by_user_id = auth.uid()
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_custody_devices'
      and policyname = 'authorized staff update custody devices'
  ) then
    create policy "authorized staff update custody devices"
    on public.device_custody_devices
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
      and updated_by_user_id = auth.uid()
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_custody_events'
      and policyname = 'authorized staff read custody events'
  ) then
    create policy "authorized staff read custody events"
    on public.device_custody_events
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
      and tablename = 'device_custody_events'
      and policyname = 'authorized staff create custody events'
  ) then
    create policy "authorized staff create custody events"
    on public.device_custody_events
    for insert
    to authenticated
    with check (
      public.has_school_role(
        school_id,
        array['school_admin','dorm_staff']::public.school_role[]
      )
      and performed_by_user_id = auth.uid()
      and exists (
        select 1
        from public.device_custody_devices dcd
        where dcd.school_id = device_custody_events.school_id
          and dcd.id = device_custody_events.device_id
          and (
            device_custody_events.student_id is null
            or dcd.student_id = device_custody_events.student_id
          )
      )
    );
  end if;
end
$$;
