-- OAc Device Management - Phase 1 initial Supabase schema draft
-- Scope: database schema, RLS helpers, and policy skeletons only.

create extension if not exists pgcrypto;

create type public.app_global_role as enum ('super_admin', 'user');
create type public.school_role as enum ('school_admin', 'dorm_supervisor', 'dorm_staff', 'viewer', 'parent');
create type public.student_status as enum ('active', 'graduated', 'withdrawn', 'inactive');
create type public.device_type as enum ('phone', 'tablet', 'laptop', 'watch', 'other');
create type public.device_status as enum (
  'checked_in',
  'checked_out',
  'school_use_released',
  'overdue',
  'missing',
  'confiscated',
  'returned_to_family',
  'inactive'
);
create type public.checkout_status as enum ('open', 'returned', 'overdue', 'missing', 'cancelled');
create type public.school_use_status as enum ('released', 'returned', 'overdue', 'missing', 'cancelled');
create type public.notice_level as enum ('first', 'second', 'missing');
create type public.notice_status as enum ('pending', 'sent', 'acknowledged', 'cancelled', 'failed');
create type public.log_event_type as enum (
  'device_created',
  'device_updated',
  'device_status_changed',
  'regular_checkout',
  'regular_checkin',
  'checkout_override',
  'school_use_release',
  'school_use_return',
  'notice_created',
  'notice_sent',
  'overdue_marked',
  'missing_marked',
  'violation_created',
  'confiscation_created',
  'confiscation_released',
  'parent_notification_recorded',
  'graduation_return',
  'withdrawal_return',
  'manual_note'
);
create type public.violation_status as enum ('open', 'resolved', 'voided');
create type public.confiscation_status as enum ('active', 'released', 'voided');
create type public.notification_channel as enum ('email', 'sms', 'phone', 'in_person', 'app', 'other');
create type public.notification_status as enum ('draft', 'sent', 'failed', 'record_only');
create type public.template_type as enum ('overdue_first', 'overdue_second', 'missing', 'violation', 'confiscation', 'general');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/New_York',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  global_role public.app_global_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table public.app_user_school_roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role public.school_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, user_id)
);

create table public.dorms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, name),
  unique (school_id, code)
);

create table public.dorm_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  dorm_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, user_id, dorm_id),
  foreign key (school_id, user_id) references public.app_user_school_roles(school_id, user_id) on delete cascade,
  foreign key (school_id, dorm_id) references public.dorms(school_id, id) on delete cascade,
  check (ends_at is null or ends_at > starts_at)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  dorm_id uuid,
  student_number text,
  first_name text not null,
  last_name text not null,
  grade_level text,
  status public.student_status not null default 'active',
  enrollment_started_on date,
  enrollment_ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, student_number),
  foreign key (school_id, dorm_id) references public.dorms(school_id, id) on delete restrict
);

create table public.student_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  full_name text not null,
  relationship text not null,
  email text,
  phone text,
  is_primary boolean not null default false,
  can_receive_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, student_id) references public.students(school_id, id) on delete cascade
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid,
  dorm_id uuid,
  device_type public.device_type not null,
  label text not null,
  make text,
  model text,
  color text,
  serial_number text,
  asset_tag text,
  qr_code text not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  graduation_returned_at timestamptz,
  withdrawal_returned_at timestamptz,
  returned_to_contact_id uuid,
  returned_by_user_id uuid references public.app_users(id) on delete set null,
  return_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, qr_code),
  unique (school_id, asset_tag),
  unique (school_id, serial_number),
  foreign key (school_id, student_id) references public.students(school_id, id) on delete cascade,
  foreign key (school_id, dorm_id) references public.dorms(school_id, id) on delete restrict,
  foreign key (school_id, returned_to_contact_id) references public.student_contacts(school_id, id) on delete restrict,
  check (student_id is not null or dorm_id is not null)
);

create table public.device_current_status (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid,
  status public.device_status not null default 'checked_in',
  active_checkout_id uuid,
  active_school_use_record_id uuid,
  status_since timestamptz not null default now(),
  return_due_at timestamptz,
  last_seen_at timestamptz,
  last_seen_by_user_id uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, device_id),
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict
);

create table public.device_time_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  dorm_id uuid,
  name text not null,
  days_of_week int[] not null,
  checkout_start_time time not null,
  checkout_end_time time not null,
  default_duration_minutes int not null,
  effective_start_date date,
  effective_end_date date,
  is_active boolean not null default true,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, dorm_id) references public.dorms(school_id, id) on delete cascade,
  check (default_duration_minutes > 0),
  check (days_of_week <@ array[0,1,2,3,4,5,6])
);

create table public.device_checkouts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid not null,
  dorm_id uuid,
  device_time_rule_id uuid,
  checked_out_at timestamptz not null default now(),
  return_due_at timestamptz not null,
  checked_out_by_user_id uuid references public.app_users(id) on delete set null,
  checked_in_at timestamptz,
  checked_in_by_user_id uuid references public.app_users(id) on delete set null,
  status public.checkout_status not null default 'open',
  override_used boolean not null default false,
  override_reason text,
  checkout_notes text,
  checkin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete restrict,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict,
  foreign key (school_id, dorm_id) references public.dorms(school_id, id) on delete restrict,
  foreign key (school_id, device_time_rule_id) references public.device_time_rules(school_id, id) on delete restrict,
  check ((override_used = false and override_reason is null) or (override_used = true and length(trim(override_reason)) > 0))
);

create unique index device_checkouts_one_open_per_device
  on public.device_checkouts (school_id, device_id)
  where status in ('open', 'overdue', 'missing');

create table public.device_school_use_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid not null,
  approved_reason text not null,
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  released_at timestamptz not null default now(),
  released_by_user_id uuid references public.app_users(id) on delete set null,
  return_due_at timestamptz,
  returned_at timestamptz,
  returned_by_user_id uuid references public.app_users(id) on delete set null,
  status public.school_use_status not null default 'released',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete restrict,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict
);

create unique index device_school_use_one_active_per_device
  on public.device_school_use_records (school_id, device_id)
  where status in ('released', 'overdue', 'missing');

create table public.notice_delay_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  first_notice_delay_minutes int not null default 5,
  second_notice_delay_minutes int not null default 30,
  missing_threshold_minutes int not null default 120,
  include_supervisor_on_second_notice boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id),
  check (first_notice_delay_minutes >= 0),
  check (second_notice_delay_minutes >= first_notice_delay_minutes),
  check (missing_threshold_minutes >= second_notice_delay_minutes)
);

create table public.device_notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid not null,
  checkout_id uuid,
  school_use_record_id uuid,
  notice_level public.notice_level not null,
  notice_status public.notice_status not null default 'pending',
  due_at timestamptz not null,
  sent_at timestamptz,
  include_supervisor boolean not null default false,
  message text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete cascade,
  foreign key (school_id, checkout_id) references public.device_checkouts(school_id, id) on delete cascade,
  foreign key (school_id, school_use_record_id) references public.device_school_use_records(school_id, id) on delete cascade,
  check ((checkout_id is not null and school_use_record_id is null) or (checkout_id is null and school_use_record_id is not null))
);

create table public.device_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid,
  student_id uuid,
  checkout_id uuid,
  school_use_record_id uuid,
  event_type public.log_event_type not null,
  event_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete restrict,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict,
  foreign key (school_id, checkout_id) references public.device_checkouts(school_id, id) on delete restrict,
  foreign key (school_id, school_use_record_id) references public.device_school_use_records(school_id, id) on delete restrict
);

create table public.device_violations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid not null,
  source_log_id uuid,
  title text not null,
  description text,
  status public.violation_status not null default 'open',
  created_by_user_id uuid references public.app_users(id) on delete set null,
  resolved_by_user_id uuid references public.app_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete restrict,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict,
  foreign key (school_id, source_log_id) references public.device_logs(school_id, id) on delete restrict
);

create table public.device_confiscations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null,
  student_id uuid not null,
  violation_id uuid,
  confiscated_at timestamptz not null default now(),
  confiscated_by_user_id uuid references public.app_users(id) on delete set null,
  reason text not null,
  status public.confiscation_status not null default 'active',
  released_at timestamptz,
  released_by_user_id uuid references public.app_users(id) on delete set null,
  release_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete restrict,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict,
  foreign key (school_id, violation_id) references public.device_violations(school_id, id) on delete restrict
);

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  template_type public.template_type not null,
  name text not null,
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, template_type, name)
);

create table public.parent_notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  contact_id uuid,
  device_id uuid,
  violation_id uuid,
  confiscation_id uuid,
  template_id uuid,
  channel public.notification_channel not null,
  status public.notification_status not null default 'record_only',
  subject text,
  message text not null,
  sent_at timestamptz,
  recorded_by_user_id uuid references public.app_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, student_id) references public.students(school_id, id) on delete cascade,
  foreign key (school_id, contact_id) references public.student_contacts(school_id, id) on delete restrict,
  foreign key (school_id, device_id) references public.devices(school_id, id) on delete restrict,
  foreign key (school_id, violation_id) references public.device_violations(school_id, id) on delete restrict,
  foreign key (school_id, confiscation_id) references public.device_confiscations(school_id, id) on delete restrict,
  foreign key (school_id, template_id) references public.notification_templates(school_id, id) on delete restrict
);

alter table public.device_current_status
  add constraint device_current_status_active_checkout_fk
  foreign key (school_id, active_checkout_id) references public.device_checkouts(school_id, id) on delete restrict;

alter table public.device_current_status
  add constraint device_current_status_active_school_use_fk
  foreign key (school_id, active_school_use_record_id) references public.device_school_use_records(school_id, id) on delete restrict;

create index on public.app_user_school_roles (user_id, school_id) where is_active;
create index on public.dorms (school_id);
create index on public.dorm_staff_assignments (school_id);
create index on public.dorm_staff_assignments (user_id);
create index on public.dorm_staff_assignments (dorm_id);
create index dorm_staff_assignments_active_lookup
  on public.dorm_staff_assignments (school_id, user_id, dorm_id, starts_at, ends_at)
  where is_active;
create index on public.students (school_id, dorm_id, status);
create index on public.student_contacts (school_id, student_id);
create index on public.devices (school_id, student_id, is_active);
create index on public.devices (school_id, dorm_id, is_active);
create index on public.devices (school_id, qr_code);
create index on public.device_current_status (school_id, status, return_due_at);
create index on public.device_time_rules (school_id, dorm_id, is_active);
create index on public.device_checkouts (school_id, student_id, status, return_due_at);
create index on public.device_school_use_records (school_id, student_id, status, return_due_at);
create index on public.device_notices (school_id, notice_status, due_at);
create index on public.device_logs (school_id, device_id, created_at desc);
create index on public.device_logs (school_id, student_id, created_at desc);
create index on public.device_violations (school_id, student_id, status);
create index on public.device_confiscations (school_id, student_id, status);
create index on public.parent_notifications (school_id, student_id, created_at desc);

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.id = public.current_app_user_id()
      and au.global_role = 'super_admin'
      and au.is_active = true
  );
$$;

create or replace function public.has_school_role(target_school_id uuid, allowed_roles public.school_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.app_user_school_roles ausr
      join public.app_users au on au.id = ausr.user_id
      where ausr.user_id = public.current_app_user_id()
        and ausr.school_id = target_school_id
        and ausr.is_active = true
        and au.is_active = true
        and (allowed_roles is null or ausr.role = any(allowed_roles))
    );
$$;

create or replace function public.has_dorm_access(target_school_id uuid, target_dorm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.has_school_role(target_school_id, array['school_admin','dorm_supervisor']::public.school_role[])
    or (
      target_dorm_id is not null
      and exists (
        select 1
        from public.dorm_staff_assignments dsa
        join public.app_user_school_roles ausr
          on ausr.school_id = dsa.school_id
         and ausr.user_id = dsa.user_id
        join public.app_users au on au.id = dsa.user_id
        where dsa.school_id = target_school_id
          and dsa.dorm_id = target_dorm_id
          and dsa.user_id = public.current_app_user_id()
          and dsa.is_active = true
          and dsa.starts_at <= now()
          and (dsa.ends_at is null or dsa.ends_at > now())
          and ausr.role = 'dorm_staff'
          and ausr.is_active = true
          and au.is_active = true
      )
    );
$$;

create or replace function public.can_access_student(target_school_id uuid, target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.has_school_role(target_school_id, array['school_admin','dorm_supervisor','viewer']::public.school_role[])
    or exists (
      select 1
      from public.students s
      where s.school_id = target_school_id
        and s.id = target_student_id
        and public.has_dorm_access(s.school_id, s.dorm_id)
    );
$$;

create or replace function public.can_access_device(target_school_id uuid, target_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.has_school_role(target_school_id, array['school_admin','dorm_supervisor','viewer']::public.school_role[])
    or exists (
      select 1
      from public.devices d
      where d.school_id = target_school_id
        and d.id = target_device_id
        and (
          (d.student_id is not null and public.can_access_student(d.school_id, d.student_id))
          or (d.student_id is null and public.has_dorm_access(d.school_id, d.dorm_id))
        )
    );
$$;

create or replace function public.can_access_device_scope(target_school_id uuid, target_student_id uuid, target_dorm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.has_school_role(target_school_id, array['school_admin','dorm_supervisor']::public.school_role[])
    or (
      public.has_school_role(target_school_id, array['dorm_staff']::public.school_role[])
      and (
        (target_student_id is not null and public.can_access_student(target_school_id, target_student_id))
        or (target_student_id is null and public.has_dorm_access(target_school_id, target_dorm_id))
      )
    );
$$;

create or replace function public.prevent_device_log_mutation()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;

  raise exception 'device_logs are immutable for normal app users';
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schools_touch_updated_at before update on public.schools
for each row execute function public.touch_updated_at();
create trigger app_users_touch_updated_at before update on public.app_users
for each row execute function public.touch_updated_at();
create trigger app_user_school_roles_touch_updated_at before update on public.app_user_school_roles
for each row execute function public.touch_updated_at();
create trigger dorms_touch_updated_at before update on public.dorms
for each row execute function public.touch_updated_at();
create trigger dorm_staff_assignments_touch_updated_at before update on public.dorm_staff_assignments
for each row execute function public.touch_updated_at();
create trigger students_touch_updated_at before update on public.students
for each row execute function public.touch_updated_at();
create trigger student_contacts_touch_updated_at before update on public.student_contacts
for each row execute function public.touch_updated_at();
create trigger devices_touch_updated_at before update on public.devices
for each row execute function public.touch_updated_at();
create trigger device_current_status_touch_updated_at before update on public.device_current_status
for each row execute function public.touch_updated_at();
create trigger device_time_rules_touch_updated_at before update on public.device_time_rules
for each row execute function public.touch_updated_at();
create trigger device_checkouts_touch_updated_at before update on public.device_checkouts
for each row execute function public.touch_updated_at();
create trigger device_school_use_records_touch_updated_at before update on public.device_school_use_records
for each row execute function public.touch_updated_at();
create trigger notice_delay_settings_touch_updated_at before update on public.notice_delay_settings
for each row execute function public.touch_updated_at();
create trigger device_notices_touch_updated_at before update on public.device_notices
for each row execute function public.touch_updated_at();
create trigger device_violations_touch_updated_at before update on public.device_violations
for each row execute function public.touch_updated_at();
create trigger device_confiscations_touch_updated_at before update on public.device_confiscations
for each row execute function public.touch_updated_at();
create trigger notification_templates_touch_updated_at before update on public.notification_templates
for each row execute function public.touch_updated_at();
create trigger parent_notifications_touch_updated_at before update on public.parent_notifications
for each row execute function public.touch_updated_at();

create trigger device_logs_prevent_update before update on public.device_logs
for each row execute function public.prevent_device_log_mutation();

create trigger device_logs_prevent_delete before delete on public.device_logs
for each row execute function public.prevent_device_log_mutation();

alter table public.schools enable row level security;
alter table public.app_users enable row level security;
alter table public.app_user_school_roles enable row level security;
alter table public.dorms enable row level security;
alter table public.dorm_staff_assignments enable row level security;
alter table public.students enable row level security;
alter table public.student_contacts enable row level security;
alter table public.devices enable row level security;
alter table public.device_current_status enable row level security;
alter table public.device_time_rules enable row level security;
alter table public.device_checkouts enable row level security;
alter table public.device_school_use_records enable row level security;
alter table public.notice_delay_settings enable row level security;
alter table public.device_notices enable row level security;
alter table public.device_logs enable row level security;
alter table public.device_violations enable row level security;
alter table public.device_confiscations enable row level security;
alter table public.notification_templates enable row level security;
alter table public.parent_notifications enable row level security;

create policy "super admins manage schools" on public.schools
for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "school members read their schools" on public.schools
for select using (
  public.is_super_admin()
  or exists (
    select 1 from public.app_user_school_roles ausr
    where ausr.school_id = schools.id
      and ausr.user_id = auth.uid()
      and ausr.is_active = true
  )
);

create policy "users read own profile" on public.app_users
for select using (id = auth.uid() or public.is_super_admin());

create policy "super admins manage app users" on public.app_users
for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "school admins read school memberships" on public.app_user_school_roles
for select using (
  public.is_super_admin()
  or public.has_school_role(school_id, array['school_admin','dorm_supervisor','dorm_staff','viewer']::public.school_role[])
);

create policy "school admins manage school memberships" on public.app_user_school_roles
for all using (
  public.is_super_admin()
  or public.has_school_role(school_id, array['school_admin']::public.school_role[])
) with check (
  public.is_super_admin()
  or public.has_school_role(school_id, array['school_admin']::public.school_role[])
);

create policy "school members read dorms" on public.dorms
for select using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor','viewer']::public.school_role[])
  or public.has_dorm_access(school_id, id)
);
create policy "school admins and supervisors manage dorms" on public.dorms
for all using (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]));

create policy "school staff read dorm assignments" on public.dorm_staff_assignments
for select using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor','viewer']::public.school_role[])
  or user_id = public.current_app_user_id()
);
create policy "admins and supervisors manage dorm assignments" on public.dorm_staff_assignments
for all using (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]));

create policy "school members read students" on public.students
for select using (public.can_access_student(school_id, id));
create policy "staff manage students" on public.students
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_student(school_id, id))
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.has_dorm_access(school_id, dorm_id))
);

create policy "school members read student contacts" on public.student_contacts
for select using (public.can_access_student(school_id, student_id));
create policy "staff manage student contacts" on public.student_contacts
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_student(school_id, student_id))
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_student(school_id, student_id))
);

create policy "school members read devices" on public.devices
for select using (public.can_access_device(school_id, id));
create policy "staff manage devices" on public.devices
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_device(school_id, id))
) with check (public.can_access_device_scope(school_id, student_id, dorm_id));

create policy "school members read device current status" on public.device_current_status
for select using (public.can_access_device(school_id, device_id));
create policy "staff manage device current status" on public.device_current_status
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_device(school_id, device_id))
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_device(school_id, device_id))
);

create policy "school members read device time rules" on public.device_time_rules
for select using (public.has_school_role(school_id, array['school_admin','dorm_supervisor','dorm_staff','viewer']::public.school_role[]));
create policy "admins and supervisors manage device time rules" on public.device_time_rules
for all using (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]));

create policy "school members read device checkouts" on public.device_checkouts
for select using (public.can_access_device(school_id, device_id) and public.can_access_student(school_id, student_id));
create policy "staff manage device checkouts" on public.device_checkouts
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
);

create policy "school members read school use records" on public.device_school_use_records
for select using (public.can_access_device(school_id, device_id) and public.can_access_student(school_id, student_id));
create policy "staff manage school use records" on public.device_school_use_records
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
);

create policy "school members read notice delay settings" on public.notice_delay_settings
for select using (public.has_school_role(school_id, array['school_admin','dorm_supervisor','dorm_staff','viewer']::public.school_role[]));
create policy "admins and supervisors manage notice delay settings" on public.notice_delay_settings
for all using (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]));

create policy "school members read device notices" on public.device_notices
for select using (public.can_access_device(school_id, device_id) and public.can_access_student(school_id, student_id));
create policy "staff manage device notices" on public.device_notices
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
);

create policy "school members read device logs" on public.device_logs
for select using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor','viewer']::public.school_role[])
  or (device_id is not null and public.can_access_device(school_id, device_id))
  or (student_id is not null and public.can_access_student(school_id, student_id))
);
create policy "staff create device logs" on public.device_logs
for insert with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and (
      (device_id is not null and public.can_access_device(school_id, device_id))
      or (student_id is not null and public.can_access_student(school_id, student_id))
    )
  )
);

create policy "school members read violations" on public.device_violations
for select using (public.can_access_device(school_id, device_id) and public.can_access_student(school_id, student_id));
create policy "staff manage violations" on public.device_violations
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
);

create policy "school members read confiscations" on public.device_confiscations
for select using (public.can_access_device(school_id, device_id) and public.can_access_student(school_id, student_id));
create policy "staff manage confiscations" on public.device_confiscations
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (
    public.has_school_role(school_id, array['dorm_staff']::public.school_role[])
    and public.can_access_device(school_id, device_id)
    and public.can_access_student(school_id, student_id)
  )
);

create policy "school members read notification templates" on public.notification_templates
for select using (public.has_school_role(school_id, array['school_admin','dorm_supervisor','dorm_staff','viewer']::public.school_role[]));
create policy "admins and supervisors manage notification templates" on public.notification_templates
for all using (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[]));

create policy "school members read parent notifications" on public.parent_notifications
for select using (public.can_access_student(school_id, student_id));
create policy "staff manage parent notifications" on public.parent_notifications
for all using (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_student(school_id, student_id))
) with check (
  public.has_school_role(school_id, array['school_admin','dorm_supervisor']::public.school_role[])
  or (public.has_school_role(school_id, array['dorm_staff']::public.school_role[]) and public.can_access_student(school_id, student_id))
);
