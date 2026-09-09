-- G1-A: authoritative, atomic schedule publication and concurrency boundary.
-- This migration intentionally does not resolve restricted periods or DST.

do $$
begin
  if exists (select 1 from public.device_schedule_policies) then
    raise exception 'g1a_existing_schedule_data_requires_controlled_migration';
  end if;
end;
$$;

-- Published replacements may keep the same cutover date as the snapshot they
-- supersede. The append-only ledger now owns uniqueness of the effective path.
drop index public.device_schedule_one_school_policy_start;
drop index public.device_schedule_one_residence_policy_start;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;

create table public.device_schedule_scope_revisions (
  school_id uuid not null references public.schools(id) on delete cascade,
  scope_type text not null,
  scope_id uuid not null,
  dorm_id uuid,
  revision bigint not null,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,
  updated_by_user_id uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, scope_type, scope_id),
  foreign key (school_id, dorm_id)
    references public.dorms(school_id, id) on delete restrict,
  constraint device_schedule_scope_type_valid
    check (scope_type in ('school', 'residence')),
  constraint device_schedule_scope_identity_valid
    check (
      (scope_type = 'school' and dorm_id is null and scope_id = school_id)
      or
      (scope_type = 'residence' and dorm_id is not null and scope_id = dorm_id)
    ),
  constraint device_schedule_scope_revision_nonnegative
    check (revision >= 0)
);

create index device_schedule_scope_revisions_dorm_idx
  on public.device_schedule_scope_revisions (school_id, dorm_id)
  where dorm_id is not null;

create table public.device_schedule_publications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  scope_type text not null,
  scope_id uuid not null,
  dorm_id uuid,
  scope_revision bigint not null,
  policy_id uuid not null,
  predecessor_publication_id uuid,
  replaces_publication_id uuid,
  timezone_snapshot text not null,
  effective_from date not null,
  declared_effective_to date,
  published_by_user_id uuid not null references public.app_users(id) on delete restrict,
  published_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, policy_id),
  unique (school_id, scope_type, scope_id, scope_revision),
  foreign key (school_id, scope_type, scope_id)
    references public.device_schedule_scope_revisions(school_id, scope_type, scope_id)
    deferrable initially deferred,
  foreign key (school_id, policy_id)
    references public.device_schedule_policies(school_id, id) on delete restrict,
  foreign key (school_id, predecessor_publication_id)
    references public.device_schedule_publications(school_id, id) on delete restrict,
  foreign key (school_id, replaces_publication_id)
    references public.device_schedule_publications(school_id, id) on delete restrict,
  constraint device_schedule_publication_scope_type_valid
    check (scope_type in ('school', 'residence')),
  constraint device_schedule_publication_scope_identity_valid
    check (
      (scope_type = 'school' and dorm_id is null and scope_id = school_id)
      or
      (scope_type = 'residence' and dorm_id is not null and scope_id = dorm_id)
    ),
  constraint device_schedule_publication_revision_positive
    check (scope_revision > 0),
  constraint device_schedule_publication_dates_valid
    check (declared_effective_to is null or declared_effective_to >= effective_from),
  constraint device_schedule_publication_not_self_replacing
    check (replaces_publication_id is null or replaces_publication_id <> id)
);

create index device_schedule_publications_scope_effective_idx
  on public.device_schedule_publications (
    school_id, scope_type, scope_id, effective_from, scope_revision
  );

create index device_schedule_publications_predecessor_idx
  on public.device_schedule_publications (school_id, predecessor_publication_id)
  where predecessor_publication_id is not null;

create table public.device_schedule_publication_ledger (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  scope_type text not null,
  scope_id uuid not null,
  dorm_id uuid,
  scope_revision bigint not null,
  operation text not null,
  publication_id uuid,
  predecessor_publication_id uuid,
  replaced_publication_id uuid,
  cutover_date date not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (school_id, scope_type, scope_id, scope_revision),
  foreign key (school_id, scope_type, scope_id)
    references public.device_schedule_scope_revisions(school_id, scope_type, scope_id)
    deferrable initially deferred,
  foreign key (school_id, publication_id)
    references public.device_schedule_publications(school_id, id) on delete restrict,
  foreign key (school_id, predecessor_publication_id)
    references public.device_schedule_publications(school_id, id) on delete restrict,
  foreign key (school_id, replaced_publication_id)
    references public.device_schedule_publications(school_id, id) on delete restrict,
  constraint device_schedule_ledger_scope_type_valid
    check (scope_type in ('school', 'residence')),
  constraint device_schedule_ledger_scope_identity_valid
    check (
      (scope_type = 'school' and dorm_id is null and scope_id = school_id)
      or
      (scope_type = 'residence' and dorm_id is not null and scope_id = dorm_id)
    ),
  constraint device_schedule_ledger_revision_positive
    check (scope_revision > 0),
  constraint device_schedule_ledger_operation_valid
    check (operation in ('publish', 'replace', 'cancel')),
  constraint device_schedule_ledger_operation_shape_valid
    check (
      (
        operation = 'publish'
        and publication_id is not null
        and replaced_publication_id is null
      )
      or
      (
        operation = 'replace'
        and publication_id is not null
        and replaced_publication_id is not null
        and publication_id <> replaced_publication_id
      )
      or
      (
        operation = 'cancel'
        and publication_id is null
        and replaced_publication_id is not null
      )
    )
);

create index device_schedule_ledger_replaced_idx
  on public.device_schedule_publication_ledger (school_id, replaced_publication_id)
  where replaced_publication_id is not null;

create table public.device_schedule_publication_idempotency (
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  school_id uuid not null,
  scope_type text not null,
  scope_id uuid not null,
  dorm_id uuid,
  idempotency_key uuid not null,
  operation text not null,
  payload_digest text not null,
  canonical_payload jsonb not null,
  result_outcome text not null,
  result_publication_id uuid not null,
  result_policy_id uuid not null,
  result_scope_revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (
    actor_user_id, school_id, scope_type, scope_id, idempotency_key
  ),
  foreign key (school_id, scope_type, scope_id)
    references public.device_schedule_scope_revisions(school_id, scope_type, scope_id)
    deferrable initially deferred,
  foreign key (school_id, result_publication_id)
    references public.device_schedule_publications(school_id, id) on delete restrict,
  foreign key (school_id, result_policy_id)
    references public.device_schedule_policies(school_id, id) on delete restrict,
  constraint device_schedule_idempotency_scope_type_valid
    check (scope_type in ('school', 'residence')),
  constraint device_schedule_idempotency_scope_identity_valid
    check (
      (scope_type = 'school' and dorm_id is null and scope_id = school_id)
      or
      (scope_type = 'residence' and dorm_id is not null and scope_id = dorm_id)
    ),
  constraint device_schedule_idempotency_operation_valid
    check (operation in ('publish', 'cancel')),
  constraint device_schedule_idempotency_digest_valid
    check (payload_digest ~ '^[0-9a-f]{32}$'),
  constraint device_schedule_idempotency_result_valid
    check (result_outcome in ('published', 'cancelled')),
  constraint device_schedule_idempotency_revision_positive
    check (result_scope_revision > 0)
);

create or replace function private.device_schedule_scope_lock_key(
  target_school_id uuid,
  target_dorm_id uuid
)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    'device_schedule_scope:' || target_school_id::text || ':' ||
      coalesce(target_dorm_id::text, 'school'),
    0
  );
$$;

create or replace function private.authorized_device_schedule_context(
  target_school_id uuid,
  target_dorm_id uuid
)
returns table (
  school_timezone text,
  scope_type text,
  scope_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    school.timezone,
    case when target_dorm_id is null then 'school' else 'residence' end,
    coalesce(target_dorm_id, target_school_id)
  from public.app_users app_user
  join public.schools school
    on school.id = target_school_id
   and school.is_active = true
  where app_user.id = auth.uid()
    and app_user.is_active = true
    and (
      target_dorm_id is null
      or exists (
        select 1
        from public.dorms residence
        where residence.school_id = target_school_id
          and residence.id = target_dorm_id
          and residence.is_active = true
      )
    )
    and (
      app_user.global_role = 'super_admin'::public.app_global_role
      or exists (
        select 1
        from public.app_user_school_roles membership
        where membership.user_id = app_user.id
          and membership.school_id = target_school_id
          and membership.is_active = true
          and (
            membership.role = 'school_admin'::public.school_role
            or (
              target_dorm_id is not null
              and membership.role = 'dorm_supervisor'::public.school_role
            )
          )
      )
    )
  limit 1;
$$;

create or replace function private.normalize_device_schedule_events(
  target_events jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized_events jsonb;
  event_types text[];
  event_count integer;
  event_index integer;
begin
  if pg_catalog.jsonb_typeof(target_events) is distinct from 'array'
    or pg_catalog.jsonb_array_length(target_events) = 0
  then
    raise exception 'schedule_publish_invalid_events'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_events) event_item
    where pg_catalog.jsonb_typeof(event_item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(event_item -> 'weekday') is distinct from 'number'
      or (event_item ->> 'weekday') !~ '^[0-6]$'
      or pg_catalog.jsonb_typeof(event_item -> 'local_time') is distinct from 'string'
      or (event_item ->> 'local_time') !~
        '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$'
      or pg_catalog.jsonb_typeof(event_item -> 'event_type') is distinct from 'string'
      or (event_item ->> 'event_type') not in ('release', 'return')
  ) then
    raise exception 'schedule_publish_invalid_events'
      using errcode = '22023';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'weekday', (event_item ->> 'weekday')::integer,
      'local_time', pg_catalog.to_char(
        (event_item ->> 'local_time')::time(0),
        'HH24:MI:SS'
      ),
      'event_type', event_item ->> 'event_type'
    )
    order by
      (event_item ->> 'weekday')::integer,
      (event_item ->> 'local_time')::time(0),
      event_item ->> 'event_type'
  )
  into normalized_events
  from pg_catalog.jsonb_array_elements(target_events) event_item;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(normalized_events) normalized_event
    group by
      normalized_event ->> 'weekday',
      normalized_event ->> 'local_time'
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'schedule_publish_duplicate_local_instant'
      using errcode = '22023';
  end if;

  select
    pg_catalog.array_agg(normalized_event ->> 'event_type'),
    pg_catalog.count(*)::integer
  into event_types, event_count
  from pg_catalog.jsonb_array_elements(normalized_events) normalized_event;

  if not ('release' = any(event_types))
    or not ('return' = any(event_types))
  then
    raise exception 'schedule_publish_incomplete_event_ring'
      using errcode = '22023';
  end if;

  for event_index in 1..event_count loop
    if event_types[event_index] = event_types[(event_index % event_count) + 1] then
      raise exception 'schedule_publish_non_alternating_event_ring'
        using errcode = '22023';
    end if;
  end loop;

  return normalized_events;
end;
$$;

create or replace function private.active_device_schedule_tail(
  target_school_id uuid,
  target_scope_type text,
  target_scope_id uuid
)
returns setof public.device_schedule_publications
language sql
stable
security invoker
set search_path = ''
as $$
  select publication.*
  from public.device_schedule_publications publication
  where publication.school_id = target_school_id
    and publication.scope_type = target_scope_type
    and publication.scope_id = target_scope_id
    and not exists (
      select 1
      from public.device_schedule_publication_ledger replacement
      where replacement.school_id = publication.school_id
        and replacement.replaced_publication_id = publication.id
    )
    and not exists (
      select 1
      from public.device_schedule_publications child
      where child.school_id = publication.school_id
        and child.scope_type = publication.scope_type
        and child.scope_id = publication.scope_id
        and child.predecessor_publication_id = publication.id
        and not exists (
          select 1
          from public.device_schedule_publication_ledger child_replacement
          where child_replacement.school_id = child.school_id
            and child_replacement.replaced_publication_id = child.id
        )
    )
  order by publication.scope_revision desc;
$$;

create or replace function private.reject_device_schedule_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'published_device_schedule_is_immutable'
    using errcode = '55000';
end;
$$;

create trigger device_schedule_policies_reject_mutation
before update or delete on public.device_schedule_policies
for each row execute function private.reject_device_schedule_snapshot_mutation();

create trigger device_schedule_events_reject_mutation
before update or delete on public.device_schedule_weekly_events
for each row execute function private.reject_device_schedule_snapshot_mutation();

create trigger device_schedule_publications_reject_mutation
before update or delete on public.device_schedule_publications
for each row execute function private.reject_device_schedule_snapshot_mutation();

create trigger device_schedule_ledger_reject_mutation
before update or delete on public.device_schedule_publication_ledger
for each row execute function private.reject_device_schedule_snapshot_mutation();

create trigger device_schedule_idempotency_reject_mutation
before update or delete on public.device_schedule_publication_idempotency
for each row execute function private.reject_device_schedule_snapshot_mutation();

create or replace function public.publish_device_schedule(
  target_school_id uuid,
  target_dorm_id uuid,
  target_expected_scope_revision bigint,
  target_idempotency_key uuid,
  target_predecessor_publication_id uuid,
  target_replaces_publication_id uuid,
  target_name text,
  target_effective_from date,
  target_effective_to date,
  target_events jsonb
)
returns table (
  outcome text,
  publication_id uuid,
  policy_id uuid,
  scope_revision bigint,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  authorization_context record;
  current_revision bigint := 0;
  next_revision bigint;
  local_today date;
  normalized_name text := pg_catalog.btrim(target_name);
  normalized_events jsonb;
  canonical_payload jsonb;
  payload_digest text;
  existing_idempotency public.device_schedule_publication_idempotency%rowtype;
  active_tail public.device_schedule_publications%rowtype;
  active_tail_found boolean := false;
  active_tail_count integer := 0;
  operation_name text := 'publish';
  new_policy_id uuid := pg_catalog.gen_random_uuid();
  new_publication_id uuid := pg_catalog.gen_random_uuid();
begin
  if caller_id is null then
    return query select 'not_authorized'::text, null::uuid, null::uuid,
      null::bigint, false;
    return;
  end if;

  if target_school_id is null
    or target_expected_scope_revision is null
    or target_expected_scope_revision < 0
    or target_idempotency_key is null
    or target_effective_from is null
    or normalized_name is null
    or normalized_name = ''
    or pg_catalog.length(normalized_name) > 200
    or (
      target_effective_to is not null
      and target_effective_to < target_effective_from
    )
  then
    raise exception 'schedule_publish_invalid_metadata'
      using errcode = '22023';
  end if;

  select *
  into authorization_context
  from private.authorized_device_schedule_context(
    target_school_id,
    target_dorm_id
  );

  if not found then
    return query select 'not_authorized'::text, null::uuid, null::uuid,
      null::bigint, false;
    return;
  end if;

  normalized_events := private.normalize_device_schedule_events(target_events);

  if target_replaces_publication_id is not null then
    operation_name := 'replace';
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'operation', operation_name,
    'school_id', target_school_id,
    'dorm_id', target_dorm_id,
    'expected_scope_revision', target_expected_scope_revision,
    'predecessor_publication_id', target_predecessor_publication_id,
    'replaces_publication_id', target_replaces_publication_id,
    'name', normalized_name,
    'effective_from', target_effective_from,
    'effective_to', target_effective_to,
    'events', normalized_events
  );
  payload_digest := pg_catalog.md5(canonical_payload::text);

  perform pg_catalog.pg_advisory_xact_lock(
    private.device_schedule_scope_lock_key(target_school_id, target_dorm_id)
  );

  select scope_state.revision
  into current_revision
  from public.device_schedule_scope_revisions scope_state
  where scope_state.school_id = target_school_id
    and scope_state.scope_type = authorization_context.scope_type
    and scope_state.scope_id = authorization_context.scope_id
  for update;

  if not found then
    current_revision := 0;
  end if;

  select idempotency.*
  into existing_idempotency
  from public.device_schedule_publication_idempotency idempotency
  where idempotency.actor_user_id = caller_id
    and idempotency.school_id = target_school_id
    and idempotency.scope_type = authorization_context.scope_type
    and idempotency.scope_id = authorization_context.scope_id
    and idempotency.idempotency_key = target_idempotency_key;

  if found then
    if existing_idempotency.canonical_payload = canonical_payload then
      return query select
        existing_idempotency.result_outcome,
        existing_idempotency.result_publication_id,
        existing_idempotency.result_policy_id,
        existing_idempotency.result_scope_revision,
        true;
    else
      return query select 'idempotency_conflict'::text, null::uuid, null::uuid,
        current_revision, false;
    end if;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone_name
    where timezone_name.name = authorization_context.school_timezone
  ) then
    raise exception 'schedule_publish_invalid_timezone'
      using errcode = '22023';
  end if;

  local_today := (
    pg_catalog.now() at time zone authorization_context.school_timezone
  )::date;

  if target_effective_from <= local_today then
    raise exception 'schedule_publish_effective_date_not_future'
      using errcode = '22023';
  end if;

  if target_expected_scope_revision <> current_revision then
    return query select 'stale_revision'::text, null::uuid, null::uuid,
      current_revision, false;
    return;
  end if;

  select pg_catalog.count(*)::integer
  into active_tail_count
  from private.active_device_schedule_tail(
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id
  );

  if active_tail_count > 1 then
    raise exception 'schedule_publish_invalid_timeline'
      using errcode = '55000';
  end if;

  select *
  into active_tail
  from private.active_device_schedule_tail(
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id
  );
  active_tail_found := found;

  if target_replaces_publication_id is not null then
    if not active_tail_found
      or active_tail.id <> target_replaces_publication_id
      or active_tail.effective_from <= local_today
      or target_predecessor_publication_id
        is distinct from active_tail.predecessor_publication_id
    then
      return query select 'replacement_conflict'::text, null::uuid, null::uuid,
        current_revision, false;
      return;
    end if;
  elsif active_tail_found then
    if target_predecessor_publication_id is null then
      return query select 'overlap_conflict'::text, null::uuid, null::uuid,
        current_revision, false;
      return;
    end if;

    if target_predecessor_publication_id <> active_tail.id then
      return query select 'predecessor_conflict'::text, null::uuid, null::uuid,
        current_revision, false;
      return;
    end if;
  elsif target_predecessor_publication_id is not null then
    return query select 'predecessor_conflict'::text, null::uuid, null::uuid,
      current_revision, false;
    return;
  end if;

  if target_predecessor_publication_id is not null then
    if not exists (
      select 1
      from public.device_schedule_publications predecessor
      where predecessor.school_id = target_school_id
        and predecessor.scope_type = authorization_context.scope_type
        and predecessor.scope_id = authorization_context.scope_id
        and predecessor.id = target_predecessor_publication_id
        and predecessor.effective_from < target_effective_from
    ) then
      return query select 'predecessor_conflict'::text, null::uuid, null::uuid,
        current_revision, false;
      return;
    end if;
  end if;

  next_revision := current_revision + 1;

  insert into public.device_schedule_scope_revisions (
    school_id,
    scope_type,
    scope_id,
    dorm_id,
    revision,
    created_by_user_id,
    updated_by_user_id
  ) values (
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id,
    target_dorm_id,
    next_revision,
    caller_id,
    caller_id
  )
  on conflict (school_id, scope_type, scope_id)
  do update set
    revision = excluded.revision,
    updated_by_user_id = caller_id,
    updated_at = pg_catalog.now();

  insert into public.device_schedule_policies (
    id,
    school_id,
    dorm_id,
    name,
    is_active,
    effective_from,
    effective_to,
    created_by_user_id,
    updated_by_user_id
  ) values (
    new_policy_id,
    target_school_id,
    target_dorm_id,
    normalized_name,
    true,
    target_effective_from,
    target_effective_to,
    caller_id,
    caller_id
  );

  insert into public.device_schedule_weekly_events (
    school_id,
    policy_id,
    weekday,
    local_time,
    event_type,
    created_by_user_id,
    updated_by_user_id
  )
  select
    target_school_id,
    new_policy_id,
    (normalized_event ->> 'weekday')::smallint,
    (normalized_event ->> 'local_time')::time(0),
    (normalized_event ->> 'event_type')::public.device_schedule_event_type,
    caller_id,
    caller_id
  from pg_catalog.jsonb_array_elements(normalized_events) normalized_event;

  insert into public.device_schedule_publications (
    id,
    school_id,
    scope_type,
    scope_id,
    dorm_id,
    scope_revision,
    policy_id,
    predecessor_publication_id,
    replaces_publication_id,
    timezone_snapshot,
    effective_from,
    declared_effective_to,
    published_by_user_id
  ) values (
    new_publication_id,
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id,
    target_dorm_id,
    next_revision,
    new_policy_id,
    target_predecessor_publication_id,
    target_replaces_publication_id,
    authorization_context.school_timezone,
    target_effective_from,
    target_effective_to,
    caller_id
  );

  insert into public.device_schedule_publication_ledger (
    school_id,
    scope_type,
    scope_id,
    dorm_id,
    scope_revision,
    operation,
    publication_id,
    predecessor_publication_id,
    replaced_publication_id,
    cutover_date,
    actor_user_id
  ) values (
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id,
    target_dorm_id,
    next_revision,
    operation_name,
    new_publication_id,
    target_predecessor_publication_id,
    target_replaces_publication_id,
    target_effective_from,
    caller_id
  );

  insert into public.device_schedule_publication_idempotency (
    actor_user_id,
    school_id,
    scope_type,
    scope_id,
    dorm_id,
    idempotency_key,
    operation,
    payload_digest,
    canonical_payload,
    result_outcome,
    result_publication_id,
    result_policy_id,
    result_scope_revision
  ) values (
    caller_id,
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id,
    target_dorm_id,
    target_idempotency_key,
    'publish',
    payload_digest,
    canonical_payload,
    'published',
    new_publication_id,
    new_policy_id,
    next_revision
  );

  return query select 'published'::text, new_publication_id, new_policy_id,
    next_revision, false;
end;
$$;

create or replace function public.cancel_future_device_schedule_publication(
  target_school_id uuid,
  target_dorm_id uuid,
  target_expected_scope_revision bigint,
  target_idempotency_key uuid,
  target_publication_id uuid
)
returns table (
  outcome text,
  publication_id uuid,
  policy_id uuid,
  scope_revision bigint,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  authorization_context record;
  current_revision bigint := 0;
  next_revision bigint;
  local_today date;
  canonical_payload jsonb;
  payload_digest text;
  existing_idempotency public.device_schedule_publication_idempotency%rowtype;
  active_tail public.device_schedule_publications%rowtype;
  active_tail_count integer := 0;
begin
  if caller_id is null then
    return query select 'not_authorized'::text, null::uuid, null::uuid,
      null::bigint, false;
    return;
  end if;

  if target_school_id is null
    or target_expected_scope_revision is null
    or target_expected_scope_revision < 0
    or target_idempotency_key is null
    or target_publication_id is null
  then
    raise exception 'schedule_cancel_invalid_metadata'
      using errcode = '22023';
  end if;

  select *
  into authorization_context
  from private.authorized_device_schedule_context(
    target_school_id,
    target_dorm_id
  );

  if not found then
    return query select 'not_authorized'::text, null::uuid, null::uuid,
      null::bigint, false;
    return;
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'operation', 'cancel',
    'school_id', target_school_id,
    'dorm_id', target_dorm_id,
    'expected_scope_revision', target_expected_scope_revision,
    'publication_id', target_publication_id
  );
  payload_digest := pg_catalog.md5(canonical_payload::text);

  perform pg_catalog.pg_advisory_xact_lock(
    private.device_schedule_scope_lock_key(target_school_id, target_dorm_id)
  );

  select scope_state.revision
  into current_revision
  from public.device_schedule_scope_revisions scope_state
  where scope_state.school_id = target_school_id
    and scope_state.scope_type = authorization_context.scope_type
    and scope_state.scope_id = authorization_context.scope_id
  for update;

  if not found then
    current_revision := 0;
  end if;

  select idempotency.*
  into existing_idempotency
  from public.device_schedule_publication_idempotency idempotency
  where idempotency.actor_user_id = caller_id
    and idempotency.school_id = target_school_id
    and idempotency.scope_type = authorization_context.scope_type
    and idempotency.scope_id = authorization_context.scope_id
    and idempotency.idempotency_key = target_idempotency_key;

  if found then
    if existing_idempotency.canonical_payload = canonical_payload then
      return query select
        existing_idempotency.result_outcome,
        existing_idempotency.result_publication_id,
        existing_idempotency.result_policy_id,
        existing_idempotency.result_scope_revision,
        true;
    else
      return query select 'idempotency_conflict'::text, null::uuid, null::uuid,
        current_revision, false;
    end if;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone_name
    where timezone_name.name = authorization_context.school_timezone
  ) then
    raise exception 'schedule_cancel_invalid_timezone'
      using errcode = '22023';
  end if;

  local_today := (
    pg_catalog.now() at time zone authorization_context.school_timezone
  )::date;

  if target_expected_scope_revision <> current_revision then
    return query select 'stale_revision'::text, null::uuid, null::uuid,
      current_revision, false;
    return;
  end if;

  select pg_catalog.count(*)::integer
  into active_tail_count
  from private.active_device_schedule_tail(
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id
  );

  if active_tail_count > 1 then
    raise exception 'schedule_cancel_invalid_timeline'
      using errcode = '55000';
  end if;

  select *
  into active_tail
  from private.active_device_schedule_tail(
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id
  );

  if not found
    or active_tail.id <> target_publication_id
    or active_tail.effective_from <= local_today
  then
    return query select 'cancellation_conflict'::text, null::uuid, null::uuid,
      current_revision, false;
    return;
  end if;

  next_revision := current_revision + 1;

  update public.device_schedule_scope_revisions scope_state
  set revision = next_revision,
      updated_by_user_id = caller_id,
      updated_at = pg_catalog.now()
  where scope_state.school_id = target_school_id
    and scope_state.scope_type = authorization_context.scope_type
    and scope_state.scope_id = authorization_context.scope_id;

  insert into public.device_schedule_publication_ledger (
    school_id,
    scope_type,
    scope_id,
    dorm_id,
    scope_revision,
    operation,
    publication_id,
    predecessor_publication_id,
    replaced_publication_id,
    cutover_date,
    actor_user_id
  ) values (
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id,
    target_dorm_id,
    next_revision,
    'cancel',
    null,
    active_tail.predecessor_publication_id,
    active_tail.id,
    active_tail.effective_from,
    caller_id
  );

  insert into public.device_schedule_publication_idempotency (
    actor_user_id,
    school_id,
    scope_type,
    scope_id,
    dorm_id,
    idempotency_key,
    operation,
    payload_digest,
    canonical_payload,
    result_outcome,
    result_publication_id,
    result_policy_id,
    result_scope_revision
  ) values (
    caller_id,
    target_school_id,
    authorization_context.scope_type,
    authorization_context.scope_id,
    target_dorm_id,
    target_idempotency_key,
    'cancel',
    payload_digest,
    canonical_payload,
    'cancelled',
    active_tail.id,
    active_tail.policy_id,
    next_revision
  );

  return query select 'cancelled'::text, active_tail.id, active_tail.policy_id,
    next_revision, false;
end;
$$;

alter table public.device_schedule_scope_revisions enable row level security;
alter table public.device_schedule_publications enable row level security;
alter table public.device_schedule_publication_ledger enable row level security;
alter table public.device_schedule_publication_idempotency enable row level security;

drop policy if exists "authorized managers create device schedule policies"
  on public.device_schedule_policies;
drop policy if exists "authorized managers update device schedule policies"
  on public.device_schedule_policies;
drop policy if exists "authorized managers create device schedule weekly events"
  on public.device_schedule_weekly_events;
drop policy if exists "authorized managers update device schedule weekly events"
  on public.device_schedule_weekly_events;

revoke all privileges on table public.device_schedule_policies
  from public, anon, authenticated, service_role;
revoke all privileges on table public.device_schedule_weekly_events
  from public, anon, authenticated, service_role;

grant select on table public.device_schedule_policies to authenticated;
grant select on table public.device_schedule_weekly_events to authenticated;

revoke all privileges on table public.device_schedule_scope_revisions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.device_schedule_publications
  from public, anon, authenticated, service_role;
revoke all privileges on table public.device_schedule_publication_ledger
  from public, anon, authenticated, service_role;
revoke all privileges on table public.device_schedule_publication_idempotency
  from public, anon, authenticated, service_role;

alter function private.device_schedule_scope_lock_key(uuid, uuid) owner to postgres;
alter function private.authorized_device_schedule_context(uuid, uuid) owner to postgres;
alter function private.normalize_device_schedule_events(jsonb) owner to postgres;
alter function private.active_device_schedule_tail(uuid, text, uuid) owner to postgres;
alter function private.reject_device_schedule_snapshot_mutation() owner to postgres;
alter function public.publish_device_schedule(
  uuid, uuid, bigint, uuid, uuid, uuid, text, date, date, jsonb
) owner to postgres;
alter function public.cancel_future_device_schedule_publication(
  uuid, uuid, bigint, uuid, uuid
) owner to postgres;

revoke all on function private.device_schedule_scope_lock_key(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.authorized_device_schedule_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_device_schedule_events(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.active_device_schedule_tail(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.reject_device_schedule_snapshot_mutation()
  from public, anon, authenticated, service_role;

revoke all on function public.publish_device_schedule(
  uuid, uuid, bigint, uuid, uuid, uuid, text, date, date, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.publish_device_schedule(
  uuid, uuid, bigint, uuid, uuid, uuid, text, date, date, jsonb
) to authenticated;

revoke all on function public.cancel_future_device_schedule_publication(
  uuid, uuid, bigint, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cancel_future_device_schedule_publication(
  uuid, uuid, bigint, uuid, uuid
) to authenticated;
