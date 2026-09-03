-- DSE-1A: recurring weekly schedule schema and authorization foundation.
-- Schedule data is advisory and has no custody transition side effects.

create type public.device_schedule_event_type as enum ('release', 'return');

create table public.device_schedule_policies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  dorm_id uuid,
  name text not null,
  is_active boolean not null default true,
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, dorm_id)
    references public.dorms(school_id, id) on delete restrict,
  constraint device_schedule_policies_name_not_blank
    check (length(btrim(name)) > 0),
  constraint device_schedule_policies_effective_dates_valid
    check (effective_to is null or effective_to >= effective_from)
);

-- These indexes permit future-dated versions and prevent two versions for the
-- same scope from beginning on the same date. DSE-2 atomic writes must reject
-- overlapping effective ranges.
create unique index device_schedule_one_school_policy_start
  on public.device_schedule_policies (school_id, effective_from)
  where dorm_id is null;

create unique index device_schedule_one_residence_policy_start
  on public.device_schedule_policies (school_id, dorm_id, effective_from)
  where dorm_id is not null;

create index device_schedule_policies_effective_lookup
  on public.device_schedule_policies (
    school_id,
    dorm_id,
    is_active,
    effective_from,
    effective_to
  );

create table public.device_schedule_weekly_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  policy_id uuid not null,
  -- ISO-compatible convention used by this engine: 0 = Monday, 6 = Sunday.
  weekday smallint not null,
  local_time time without time zone not null,
  event_type public.device_schedule_event_type not null,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, policy_id)
    references public.device_schedule_policies(school_id, id) on delete cascade,
  constraint device_schedule_weekly_events_weekday_valid
    check (weekday between 0 and 6),
  constraint device_schedule_weekly_events_unique_local_time
    unique (policy_id, weekday, local_time)
);

create index device_schedule_weekly_events_ordered_lookup
  on public.device_schedule_weekly_events (policy_id, weekday, local_time);

create trigger device_schedule_policies_touch_updated_at
before update on public.device_schedule_policies
for each row execute function public.touch_updated_at();

create trigger device_schedule_weekly_events_touch_updated_at
before update on public.device_schedule_weekly_events
for each row execute function public.touch_updated_at();

create or replace function public.can_read_device_schedule_policy(
  target_school_id uuid,
  target_dorm_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_super_admin()
    or exists (
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
          membership.role in ('school_admin', 'dorm_supervisor')
          or (
            target_dorm_id is null
            and membership.role in ('dorm_staff', 'viewer')
          )
          or (
            target_dorm_id is not null
            and membership.role = 'dorm_staff'::public.school_role
            and exists (
              select 1
              from public.dorm_staff_assignments assignment
              join public.dorms residence
                on residence.school_id = assignment.school_id
               and residence.id = assignment.dorm_id
               and residence.is_active = true
              where assignment.school_id = target_school_id
                and assignment.dorm_id = target_dorm_id
                and assignment.user_id = app_user.id
                and assignment.is_active = true
                and assignment.starts_at <= now()
                and (assignment.ends_at is null or assignment.ends_at > now())
            )
          )
        )
    );
$$;

create or replace function public.can_manage_device_schedule_policy(
  target_school_id uuid,
  target_dorm_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_super_admin()
    or exists (
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
          membership.role = 'school_admin'::public.school_role
          or (
            target_dorm_id is not null
            and membership.role = 'dorm_supervisor'::public.school_role
          )
        )
    );
$$;

revoke all on function public.can_read_device_schedule_policy(uuid, uuid)
from public, anon;
grant execute on function public.can_read_device_schedule_policy(uuid, uuid)
to authenticated;

revoke all on function public.can_manage_device_schedule_policy(uuid, uuid)
from public, anon;
grant execute on function public.can_manage_device_schedule_policy(uuid, uuid)
to authenticated;

alter table public.device_schedule_policies enable row level security;
alter table public.device_schedule_weekly_events enable row level security;

create policy "authorized members read device schedule policies"
on public.device_schedule_policies
for select
to authenticated
using (public.can_read_device_schedule_policy(school_id, dorm_id));

create policy "authorized managers create device schedule policies"
on public.device_schedule_policies
for insert
to authenticated
with check (
  public.can_manage_device_schedule_policy(school_id, dorm_id)
  and created_by_user_id = auth.uid()
  and updated_by_user_id = auth.uid()
);

create policy "authorized managers update device schedule policies"
on public.device_schedule_policies
for update
to authenticated
using (public.can_manage_device_schedule_policy(school_id, dorm_id))
with check (
  public.can_manage_device_schedule_policy(school_id, dorm_id)
  and updated_by_user_id = auth.uid()
);

create policy "authorized members read device schedule weekly events"
on public.device_schedule_weekly_events
for select
to authenticated
using (
  exists (
    select 1
    from public.device_schedule_policies policy
    where policy.school_id = device_schedule_weekly_events.school_id
      and policy.id = device_schedule_weekly_events.policy_id
      and public.can_read_device_schedule_policy(policy.school_id, policy.dorm_id)
  )
);

create policy "authorized managers create device schedule weekly events"
on public.device_schedule_weekly_events
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and updated_by_user_id = auth.uid()
  and exists (
    select 1
    from public.device_schedule_policies policy
    where policy.school_id = device_schedule_weekly_events.school_id
      and policy.id = device_schedule_weekly_events.policy_id
      and public.can_manage_device_schedule_policy(policy.school_id, policy.dorm_id)
  )
);

create policy "authorized managers update device schedule weekly events"
on public.device_schedule_weekly_events
for update
to authenticated
using (
  exists (
    select 1
    from public.device_schedule_policies policy
    where policy.school_id = device_schedule_weekly_events.school_id
      and policy.id = device_schedule_weekly_events.policy_id
      and public.can_manage_device_schedule_policy(policy.school_id, policy.dorm_id)
  )
)
with check (
  updated_by_user_id = auth.uid()
  and exists (
    select 1
    from public.device_schedule_policies policy
    where policy.school_id = device_schedule_weekly_events.school_id
      and policy.id = device_schedule_weekly_events.policy_id
      and public.can_manage_device_schedule_policy(policy.school_id, policy.dorm_id)
  )
);

revoke all privileges on table public.device_schedule_policies from anon;
revoke all privileges on table public.device_schedule_weekly_events from anon;
revoke all privileges on table public.device_schedule_policies from authenticated;
revoke all privileges on table public.device_schedule_weekly_events from authenticated;

grant select, insert, update
on table public.device_schedule_policies
to authenticated;

grant select, insert, update
on table public.device_schedule_weekly_events
to authenticated;
