-- G1-C confirmed review findings only. Existing migrations stay immutable.
-- Strengthen the shared publish/cancel/authoring authorization rule.
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
              and exists (
                select 1 from public.dorm_staff_assignments assignment
                where assignment.school_id = target_school_id
                  and assignment.dorm_id = target_dorm_id
                  and assignment.user_id = app_user.id
                  and assignment.is_active = true
                  and assignment.starts_at <= pg_catalog.now()
                  and (assignment.ends_at is null or assignment.ends_at > pg_catalog.now())
              )
            )
          )
      )
    )
  limit 1;
$$;

-- Replace the signature, not the authority: there is exactly one public
-- publish_device_schedule implementation. Ten-argument calls may only replay
-- successful legacy requests; they cannot create unchecked publications.
drop function public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb);

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
  target_events jsonb,
  target_expected_timezone text default null
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
  -- Preserve the canonical shape of pre-amendment requests for replay only.
  -- Every new publication requires and records its validated preview timezone.
  if target_expected_timezone is not null then
    canonical_payload := canonical_payload || pg_catalog.jsonb_build_object(
      'expected_timezone', target_expected_timezone
    );
  end if;
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

  -- Lock ordering is scope advisory/revision, then school. SHARE locks are
  -- mutually compatible for independent scopes, but block timezone UPDATEs.
  -- Re-read authorization after any lock wait. The school row remains locked
  -- until publication commits, so the checked timezone is the stored timezone.
  perform 1 from public.schools school
  where school.id = target_school_id for share;
  select * into authorization_context
  from private.authorized_device_schedule_context(target_school_id, target_dorm_id);
  if not found then
    return query select 'not_authorized'::text, null::uuid, null::uuid,
      current_revision, false;
    return;
  end if;
  if target_expected_timezone is null
    or target_expected_timezone is distinct from authorization_context.school_timezone
  then
    return query select 'stale_timezone'::text, null::uuid, null::uuid,
      current_revision, false;
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

alter function private.authorized_device_schedule_context(uuid,uuid) owner to postgres;
revoke all on function private.authorized_device_schedule_context(uuid,uuid) from public,anon,authenticated,service_role;
alter function public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb,text) owner to postgres;
revoke all on function public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.publish_device_schedule(uuid,uuid,bigint,uuid,uuid,uuid,text,date,date,jsonb,text) to authenticated;
