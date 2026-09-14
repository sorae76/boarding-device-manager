-- G1-C. G1-A publish/cancel/locks/ledger are unchanged.
-- No custody DML. No grants on internal publication tables.
create table public.device_schedule_allow_exceptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  effect text not null default 'allow' check (effect = 'allow'),
  device_id uuid, student_id uuid, dorm_id uuid,
  start_at timestamptz not null, end_at timestamptz not null,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null,
  idempotency_key uuid not null,
  unique (school_id, id),
  unique (school_id, created_by_user_id, idempotency_key),
  foreign key (school_id, device_id) references public.device_custody_devices(school_id, id) on delete restrict,
  foreign key (school_id, student_id) references public.students(school_id, id) on delete restrict,
  foreign key (school_id, dorm_id) references public.dorms(school_id, id) on delete restrict,
  check (num_nonnulls(device_id, student_id, dorm_id) = 1),
  check (isfinite(start_at) and isfinite(end_at) and isfinite(created_at)),
  check (start_at >= created_at and end_at > start_at),
  check (date_trunc('milliseconds', start_at) = start_at and date_trunc('milliseconds', end_at) = end_at)
);
create table public.device_schedule_allow_revocations (
  school_id uuid not null, exception_id uuid primary key,
  revoked_at timestamptz not null,
  revoked_by_user_id uuid not null references public.app_users(id) on delete restrict,
  revoke_reason text not null check (length(btrim(revoke_reason)) between 1 and 2000),
  foreign key (school_id, exception_id) references public.device_schedule_allow_exceptions(school_id, id) on delete restrict
);
alter table public.device_schedule_allow_exceptions enable row level security;
alter table public.device_schedule_allow_revocations enable row level security;
revoke all on public.device_schedule_allow_exceptions, public.device_schedule_allow_revocations from public, anon, authenticated, service_role;
create index device_schedule_allows_school_start on public.device_schedule_allow_exceptions(school_id, start_at);
create trigger device_schedule_allow_immutable before update or delete on public.device_schedule_allow_exceptions
for each row execute function private.reject_device_schedule_snapshot_mutation();
create trigger device_schedule_allow_revoke_immutable before update or delete on public.device_schedule_allow_revocations
for each row execute function private.reject_device_schedule_snapshot_mutation();

-- Authoritative current authorization only. Historical applicability is resolved
-- separately from supplied event-time assignment evidence by the pure resolver.
create function private.can_manage_schedule_allow(target_school_id uuid, target_device_id uuid, target_student_id uuid, target_dorm_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select pg_catalog.num_nonnulls(target_device_id, target_student_id, target_dorm_id) = 1
    and exists (select 1 from public.schools s where s.id = target_school_id and s.is_active)
    and exists (
      select 1 from public.app_users u
      where u.id = auth.uid() and u.is_active and (
        u.global_role = 'super_admin' or exists (
          select 1 from public.app_user_school_roles m
          where m.school_id = target_school_id and m.user_id = u.id and m.is_active
            and (m.role = 'school_admin' or (m.role = 'dorm_supervisor' and exists (
              select 1 from public.dorm_staff_assignments a
              join public.dorms d on d.school_id = a.school_id and d.id = a.dorm_id and d.is_active
              where a.school_id = target_school_id and a.user_id = u.id and a.is_active
                and a.starts_at <= pg_catalog.now() and (a.ends_at is null or a.ends_at > pg_catalog.now())
                and a.dorm_id = coalesce(target_dorm_id, (select st.dorm_id from public.students st
                  where st.school_id = target_school_id and st.id = coalesce(target_student_id,
                    (select dev.student_id from public.device_custody_devices dev where dev.school_id = target_school_id and dev.id = target_device_id))))
            )))
        )
      )
    )
    and (target_dorm_id is null or exists (select 1 from public.dorms d where d.school_id = target_school_id and d.id = target_dorm_id and d.is_active))
    and (target_student_id is null or exists (select 1 from public.students s where s.school_id = target_school_id and s.id = target_student_id))
    and (target_device_id is null or exists (select 1 from public.device_custody_devices d where d.school_id = target_school_id and d.id = target_device_id));
$$;

create function public.create_device_schedule_allow(target_school_id uuid, target_device_id uuid, target_student_id uuid,
  target_dorm_id uuid, target_start timestamptz, target_end timestamptz, target_reason text, target_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare old_row public.device_schedule_allow_exceptions%rowtype; new_id uuid; recorded timestamptz;
begin
  if auth.uid() is null or target_idempotency_key is null then raise exception 'schedule_allow_not_authorized' using errcode = '42501'; end if;
  -- Serialize duplicate requests before recording time; retries return the original audit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('schedule_allow:' || target_school_id::text || ':' || auth.uid()::text || ':' || target_idempotency_key::text, 0));
  -- Freeze the current ownership rows during authorization; no custody mutation.
  perform 1 from public.device_custody_devices d where d.school_id = target_school_id and d.id = target_device_id for share;
  perform 1 from public.students s where s.school_id = target_school_id and s.id = coalesce(target_student_id,
    (select d.student_id from public.device_custody_devices d where d.school_id = target_school_id and d.id = target_device_id)) for share;
  if not private.can_manage_schedule_allow(target_school_id, target_device_id, target_student_id, target_dorm_id) then
    raise exception 'schedule_allow_not_authorized' using errcode = '42501';
  end if;
  select * into old_row from public.device_schedule_allow_exceptions e where e.school_id = target_school_id
    and e.created_by_user_id = auth.uid() and e.idempotency_key = target_idempotency_key;
  if found then
    if old_row.device_id is not distinct from target_device_id and old_row.student_id is not distinct from target_student_id
      and old_row.dorm_id is not distinct from target_dorm_id and old_row.start_at = target_start and old_row.end_at = target_end
      and old_row.reason = pg_catalog.btrim(target_reason) then return old_row.id; end if;
    raise exception 'schedule_allow_idempotency_conflict' using errcode = '22023';
  end if;
  recorded := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  insert into public.device_schedule_allow_exceptions (school_id, device_id, student_id, dorm_id, start_at, end_at, reason, created_by_user_id, created_at, idempotency_key)
  values (target_school_id, target_device_id, target_student_id, target_dorm_id, target_start, target_end, pg_catalog.btrim(target_reason), auth.uid(), recorded, target_idempotency_key)
  returning id into new_id;
  return new_id;
end;
$$;

create function public.revoke_device_schedule_allow(target_school_id uuid, target_exception_id uuid, target_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.device_schedule_allow_exceptions%rowtype; r public.device_schedule_allow_revocations%rowtype;
begin
  select * into e from public.device_schedule_allow_exceptions where school_id = target_school_id and id = target_exception_id for update;
  if not found then raise exception 'schedule_allow_not_authorized' using errcode = '42501'; end if;
  perform 1 from public.device_custody_devices d where d.school_id = target_school_id and d.id = e.device_id for share;
  perform 1 from public.students s where s.school_id = target_school_id and s.id = coalesce(e.student_id,
    (select d.student_id from public.device_custody_devices d where d.school_id = target_school_id and d.id = e.device_id)) for share;
  if not private.can_manage_schedule_allow(target_school_id, e.device_id, e.student_id, e.dorm_id) then
    raise exception 'schedule_allow_not_authorized' using errcode = '42501'; end if;
  select * into r from public.device_schedule_allow_revocations where exception_id = e.id;
  if found then
    if r.revoked_by_user_id = auth.uid() and r.revoke_reason = pg_catalog.btrim(target_reason) then return e.id; end if;
    raise exception 'schedule_allow_already_revoked' using errcode = '22023';
  end if;
  insert into public.device_schedule_allow_revocations (school_id, exception_id, revoked_at, revoked_by_user_id, revoke_reason)
  values (target_school_id, e.id, pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()), auth.uid(), pg_catalog.btrim(target_reason));
  return e.id;
end;
$$;

-- One STABLE SQL statement = one MVCC snapshot, including explicit revision-zero
-- scopes and the full ledger. No read grants to internal G1-A tables are added.
create function public.read_device_schedule_authoring(target_school_id uuid, target_request_key uuid default null, target_request_dorm uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
with authorized as (
  select s.* from public.schools s join public.app_users u on u.id = auth.uid() and u.is_active
  where s.id = target_school_id and s.is_active and (u.global_role = 'super_admin' or exists (
    select 1 from public.app_user_school_roles m where m.school_id = s.id and m.user_id = u.id and m.is_active and m.role in ('school_admin', 'dorm_supervisor')))
), requested as (
  select null::uuid as dorm_id from authorized
  union all select d.id from public.dorms d join authorized a on a.id = d.school_id where d.is_active
), snapshots as (
  select pg_catalog.jsonb_build_object('school_id', target_school_id, 'dorm_id', requested.dorm_id,
    'revision', coalesce((select revision::text from public.device_schedule_scope_revisions s where s.school_id = target_school_id and s.dorm_id is not distinct from requested.dorm_id), '0'),
    'publications', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object(
      'scope_revision', p.scope_revision::text, 'name', policy.name, 'is_active', policy.is_active,
      'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.weekday, e.local_time), '[]'::jsonb) from public.device_schedule_weekly_events e where e.school_id = p.school_id and e.policy_id = p.policy_id)
    ) order by p.scope_revision), '[]'::jsonb) from public.device_schedule_publications p
      join public.device_schedule_policies policy on policy.school_id = p.school_id and policy.id = p.policy_id
      where p.school_id = target_school_id and p.dorm_id is not distinct from requested.dorm_id),
    'ledger', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) || pg_catalog.jsonb_build_object('scope_revision', l.scope_revision::text) order by l.scope_revision), '[]'::jsonb)
      from public.device_schedule_publication_ledger l where l.school_id = target_school_id and l.dorm_id is not distinct from requested.dorm_id)
  ) as value, requested.dorm_id from requested
)
select pg_catalog.jsonb_build_object('school_id', a.id, 'timezone', a.timezone, 'observed_at', pg_catalog.now(), 'today', (pg_catalog.now() at time zone a.timezone)::date,
  'can_manage_school', exists(select 1 from private.authorized_device_schedule_context(a.id, null)),
  'residences', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'name', d.name) order by d.name, d.id), '[]'::jsonb)
    from public.dorms d where d.school_id = a.id and d.is_active and exists (select 1 from private.authorized_device_schedule_context(a.id, d.id))),
  'scopes', (select coalesce(pg_catalog.jsonb_agg(value order by dorm_id nulls first), '[]'::jsonb) from snapshots),
  'request_exists', exists(select 1 from public.device_schedule_publication_idempotency i where i.school_id = a.id and i.actor_user_id = auth.uid()
    and i.idempotency_key = target_request_key and i.dorm_id is not distinct from target_request_dorm and i.operation = 'publish'),
  'exceptions', (select coalesce(pg_catalog.jsonb_agg((pg_catalog.to_jsonb(e) - 'idempotency_key') || pg_catalog.jsonb_build_object(
    'revoked_at', r.revoked_at, 'revoked_by_user_id', r.revoked_by_user_id, 'revoke_reason', r.revoke_reason) order by e.created_at desc, e.id), '[]'::jsonb)
    from public.device_schedule_allow_exceptions e left join public.device_schedule_allow_revocations r on r.exception_id = e.id
    where e.school_id = a.id and private.can_manage_schedule_allow(a.id, e.device_id, e.student_id, e.dorm_id))
) from authorized a;
$$;

create function public.search_device_schedule_exception_targets(target_school_id uuid, target_kind text, target_query text)
returns table (id uuid, label text) language sql stable security definer set search_path = '' as $$
  select choice.id, choice.label from (
    select s.id, s.first_name || ' ' || s.last_name || ' · ' || coalesce(s.student_number, s.id::text) as label
    from public.students s where target_kind = 'student' and s.school_id = target_school_id
      and private.can_manage_schedule_allow(target_school_id, null, s.id, null)
    union all
    select d.id, s.first_name || ' ' || s.last_name || ' · ' || d.manufacturer || ' ' || d.model || ' · ' || coalesce(d.asset_tag, d.serial_number, d.id::text)
    from public.device_custody_devices d join public.students s on s.school_id = d.school_id and s.id = d.student_id
    where target_kind = 'device' and d.school_id = target_school_id and private.can_manage_schedule_allow(target_school_id, d.id, null, null)
    union all
    select d.id, d.name from public.dorms d where target_kind = 'residence' and d.school_id = target_school_id
      and private.can_manage_schedule_allow(target_school_id, null, null, d.id)
  ) choice where pg_catalog.length(pg_catalog.btrim(target_query)) between 1 and 100
    and (pg_catalog.strpos(pg_catalog.lower(choice.label), pg_catalog.lower(pg_catalog.btrim(target_query))) > 0 or choice.id::text = target_query)
  order by choice.label, choice.id limit 50;
$$;

alter function private.can_manage_schedule_allow(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function private.can_manage_schedule_allow(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
alter function public.create_device_schedule_allow(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid) owner to postgres;
alter function public.revoke_device_schedule_allow(uuid,uuid,text) owner to postgres;
alter function public.read_device_schedule_authoring(uuid,uuid,uuid) owner to postgres;
alter function public.search_device_schedule_exception_targets(uuid,text,text) owner to postgres;
revoke all on function public.create_device_schedule_allow(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid),
  public.revoke_device_schedule_allow(uuid,uuid,text), public.read_device_schedule_authoring(uuid,uuid,uuid),
  public.search_device_schedule_exception_targets(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_device_schedule_allow(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid),
  public.revoke_device_schedule_allow(uuid,uuid,text), public.read_device_schedule_authoring(uuid,uuid,uuid),
  public.search_device_schedule_exception_targets(uuid,text,text) to authenticated;
