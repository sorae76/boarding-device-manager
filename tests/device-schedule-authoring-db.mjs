import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveScheduleWithAllows } from "../lib/schedules/exceptions.ts";
import { previewScheduleDraft } from "../lib/schedules/authoring.ts";

// Called only by the Docker-owned disposable G1-A harness. No external DB URL.
export async function runAuthoringDatabaseChecks({ psql, psqlAsync, actorSql, ids, pass, runPublish, publishStatement, cancelStatement, resultRow }) {
  const q = (v) => v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
  const json = (sql) => JSON.parse(psql(sql).stdout.trim() || "null");
  const before = json(`select jsonb_build_object('devices', (select jsonb_agg(to_jsonb(d) order by id) from public.device_custody_devices d),
    'events', (select jsonb_agg(to_jsonb(e) order by id) from public.device_custody_events e),
    'notices', (select jsonb_agg(to_jsonb(n) order by id) from public.device_custody_notices n));`);
  const fails = (sql, pattern = /schedule_allow_not_authorized|permission denied/i) => {
    const result = psql(sql, { allowFailure: true }); assert.notEqual(result.status, 0, result.stdout); assert.match(result.stderr, pattern);
  };
  const read = (actor = ids.schoolAdmin, school = ids.school1, key = null, dorm = null) => json(actorSql(actor,
    `select public.read_device_schedule_authoring(${q(school)},${q(key)},${q(dorm)});`));
  const start = psql("select (date_trunc('milliseconds', now()) + interval '2 days')::text;").stdout.trim();
  const end = psql("select (date_trunc('milliseconds', now()) + interval '3 days')::text;").stdout.trim();
  const create = ({ actor = ids.schoolAdmin, school = ids.school1, device = null, student = ids.student, dorm = null,
    from = start, to = end, reason = "Approved fixture", key = randomUUID() } = {}) => actorSql(actor,
    `select public.create_device_schedule_allow(${q(school)},${q(device)},${q(student)},${q(dorm)},${q(from)},${q(to)},${q(reason)},${q(key)});`);
  const revoke = (id, actor = ids.schoolAdmin, reason = "Fixture revoked", school = ids.school1) => actorSql(actor,
    `select public.revoke_device_schedule_allow(${q(school)},${q(id)},${q(reason)});`);
  const read1 = read();
  assert.equal(read1.school_id, ids.school1); assert.ok(read1.scopes.some((s) => s.dorm_id === null));
  for (const scope of read1.scopes) { assert.equal(String(scope.ledger.length), scope.revision); assert.equal(typeof scope.revision, "string"); }
  for (const actor of [ids.staff, ids.viewer, ids.parent, ids.studentUser, ids.inactiveUser, ids.inactiveMembership, ids.otherSchoolAdmin]) assert.equal(read(actor), null);
  assert.equal(read(ids.schoolAdmin, ids.school2), null);
  assert.equal(read(ids.supervisor).can_manage_school, false);
  const scope = read1.scopes.find((s) => s.dorm_id === ids.dorm7);
  // Exercise a real authorized snapshot through G1-B, not policy-only rows.
  const removed = new Set(scope.ledger.map((l) => l.replaced_publication_id));
  const tail = scope.publications.filter((p) => !removed.has(p.id)).sort((a, b) => a.effective_from.localeCompare(b.effective_from)).at(-1);
  const from = psql("select (current_date + 365)::text;").stdout.trim();
  const preview = previewScheduleDraft(read1, { dorm_id: ids.dorm7, name: "G1-C server preview", effective_from: from,
    effective_to: null, expected_revision: scope.revision, predecessor_id: tail?.id ?? null, replaces_id: null, idempotency_key: randomUUID(),
    events: [{ weekday: 0, local_time: "21:00", event_type: "return" }, { weekday: 1, local_time: "07:00", event_type: "release" }] });
  assert.ok(preview.resolution.windows.length); assert.ok(!preview.resolution.segments.some((s) => s.state === "INVALID"));
  pass("G1-C authorized consistent snapshot, decimal revisions, complete ledger, G1-B server preview and denied readers");

  const authorizationDorm = randomUUID();
  psql(`insert into public.dorms(id,school_id,name,code,is_active) values
    (${q(authorizationDorm)},${q(ids.school1)},'Review authorization fixture','REVIEW',true);`);
  const authority = runPublish({ actor: ids.schoolAdmin, dorm: authorizationDorm, key: randomUUID() });
  assert.equal(authority.outcome, "published");
  const supervisorRequest = { actor: ids.supervisor, dorm: authorizationDorm, revision: 1, replaces: authority.publicationId };
  const assignmentId = randomUUID();
  for (const [label, dormId, starts, ends, active] of [
    ["none", null, null, null, true],
    ["expired", authorizationDorm, "now() - interval '2 days'", "now() - interval '1 day'", true],
    ["future", authorizationDorm, "now() + interval '1 day'", "null", true],
    ["inactive", authorizationDorm, "now() - interval '1 day'", "null", false],
    ["other residence", ids.dorm2, "now() - interval '1 day'", "null", true]
  ]) {
    if (dormId) psql(`insert into public.dorm_staff_assignments(id,school_id,user_id,dorm_id,starts_at,ends_at,is_active)
      values (${q(assignmentId)},${q(ids.school1)},${q(ids.supervisor)},${q(dormId)},${starts},${ends},${active});`);
    assert.equal(runPublish({ ...supervisorRequest, key: randomUUID() }).outcome, "not_authorized", label);
    assert.equal(resultRow(psql(cancelStatement({ actor: ids.supervisor, dorm: authorizationDorm, revision: 1,
      publication: authority.publicationId, key: randomUUID() })).stdout).outcome, "not_authorized", label);
    assert.ok(!read(ids.supervisor).residences.some((d) => d.id === authorizationDorm), label);
    assert.ok(read(ids.schoolAdmin).residences.some((d) => d.id === authorizationDorm));
    if (dormId) psql(`delete from public.dorm_staff_assignments where id=${q(assignmentId)};`);
  }
  psql(`insert into public.dorm_staff_assignments(id,school_id,user_id,dorm_id,starts_at,ends_at,is_active)
    values (${q(assignmentId)},${q(ids.school1)},${q(ids.supervisor)},${q(authorizationDorm)},now()-interval '1 day',now()+interval '1 day',true);`);
  assert.ok(read(ids.supervisor).residences.some((d) => d.id === authorizationDorm));
  const authorizedReplacement = runPublish({ ...supervisorRequest, key: randomUUID() });
  assert.equal(authorizedReplacement.outcome, "published");
  assert.equal(resultRow(psql(cancelStatement({ actor: ids.supervisor, dorm: authorizationDorm, revision: 2,
    publication: authorizedReplacement.publicationId, key: randomUUID() })).stdout).outcome, "cancelled");
  psql(`delete from public.dorm_staff_assignments where id=${q(assignmentId)};`);
  pass("G1-C correction: publish/cancel/manageable-list deny missing, expired, future, inactive and other-residence assignments; valid assignment allowed");

  // Synchronize on observed DB lock waits, rather than hoping a sleep starts a race.
  const waitFor = async (sql, label) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (psql(sql).stdout.trim() === "t") return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Did not observe ${label}`);
  };
  const raceSchool = randomUUID(), raceDorm = randomUUID();
  psql(`insert into public.schools(id,name,slug,timezone,is_active) values (${q(raceSchool)},'Timezone race',${q(raceSchool)},'America/New_York',true);
    insert into public.dorms(id,school_id,name,code,is_active) values (${q(raceDorm)},${q(raceSchool)},'Race residence','TZ',true);`);
  const fingerprintBefore = read(ids.superAdmin, raceSchool);
  const raceDate = psql("select (current_date + 30)::text;").stdout.trim();
  const raceKey = randomUUID();
  const raceEvents = [{ weekday: 0, local_time: "07:00", event_type: "release" }, { weekday: 0, local_time: "21:00", event_type: "return" }];
  const validatedPreview = previewScheduleDraft(fingerprintBefore, { dorm_id: raceDorm, name: "Published schedule",
    effective_from: raceDate, effective_to: null, expected_revision: "0", predecessor_id: null, replaces_id: null,
    idempotency_key: raceKey, events: raceEvents });
  const originalRequest = { actor: ids.superAdmin, school: raceSchool, dorm: raceDorm, key: raceKey,
    timezone: validatedPreview.timezone, from: q(raceDate), events: raceEvents };
  const originalStatement = publishStatement(originalRequest);
  const gate = 713041031;
  // A coordinator holds a test-only advisory lock while the timezone updater
  // holds the school row. Cancel only that coordinator once publish is blocked.
  async function coordinator(name, key) {
    const promise = psqlAsync(`set application_name=${q(name)}; begin; select pg_advisory_xact_lock(${key}); select pg_sleep(30); commit;`);
    const settled = promise.then((value) => ({ value }), (error) => ({ error }));
    await waitFor(`select exists(select 1 from pg_stat_activity where application_name=${q(name)} and wait_event='PgSleep');`, name);
    return settled;
  }
  const barrier = coordinator("g1c-tz-barrier", gate);
  // coordinator() is async; wait for its lock, not for its completion.
  await waitFor("select exists(select 1 from pg_stat_activity where application_name='g1c-tz-barrier' and wait_event='PgSleep');", "timezone barrier");
  const updater = psqlAsync(`set application_name='g1c-tz-updater'; begin;
    update public.schools set timezone='America/Los_Angeles' where id=${q(raceSchool)};
    select pg_advisory_xact_lock(${gate}); commit;`);
  await waitFor("select exists(select 1 from pg_stat_activity where application_name='g1c-tz-updater' and wait_event='advisory');", "updater holding school row");
  const publishRace = psqlAsync(`set application_name='g1c-tz-publish'; ${originalStatement}`);
  await waitFor("select exists(select 1 from pg_stat_activity where application_name='g1c-tz-publish' and wait_event_type='Lock');", "publication waiting for timezone update");
  psql("select pg_cancel_backend(pid) from pg_stat_activity where application_name='g1c-tz-barrier';");
  await barrier; await updater;
  assert.equal(resultRow((await publishRace).stdout).outcome, "stale_timezone");
  const afterRace = read(ids.superAdmin, raceSchool);
  assert.deepEqual(afterRace.scopes, fingerprintBefore.scopes);
  assert.equal(afterRace.timezone, "America/Los_Angeles");
  const retried = { ...originalRequest, timezone: "America/Los_Angeles" };
  const accepted = runPublish(retried); assert.equal(accepted.outcome, "published");
  assert.equal(psql(`select timezone_snapshot from public.device_schedule_publications where id=${q(accepted.publicationId)};`).stdout.trim(), retried.timezone);
  psql(`update public.schools set timezone='UTC' where id=${q(raceSchool)};`);
  const replayed = runPublish(retried);
  assert.equal(replayed.outcome, "published"); assert.equal(replayed.replay, true); assert.equal(replayed.publicationId, accepted.publicationId);
  assert.equal(runPublish({ ...retried, timezone: "UTC" }).outcome, "idempotency_conflict");
  assert.equal(runPublish({ ...retried, key: randomUUID(), timezone: null }).outcome, "stale_timezone");

  // Opposite ordering: a publication holding SHARE must block a timezone update
  // until its transaction commits. The resulting immutable snapshot stays UTC.
  const holdGate = gate + 1;
  const heldBarrier = coordinator("g1c-publish-barrier", holdGate);
  await waitFor("select exists(select 1 from pg_stat_activity where application_name='g1c-publish-barrier' and wait_event='PgSleep');", "publication barrier");
  const heldRequest = { actor: ids.superAdmin, school: raceSchool, key: randomUUID(), timezone: "UTC" };
  const heldStatement = publishStatement(heldRequest).replace('commit;', `select pg_advisory_xact_lock(${holdGate}); commit;`);
  const heldPublish = psqlAsync(`set application_name='g1c-held-publication'; ${heldStatement}`);
  await waitFor("select exists(select 1 from pg_stat_activity where application_name='g1c-held-publication' and wait_event='advisory');", "publication holding school SHARE");
  const blockedUpdater = psqlAsync(`set application_name='g1c-blocked-updater'; update public.schools set timezone='America/New_York' where id=${q(raceSchool)};`);
  await waitFor("select exists(select 1 from pg_stat_activity where application_name='g1c-blocked-updater' and wait_event_type='Lock');", "timezone update blocked by publication");
  psql("select pg_cancel_backend(pid) from pg_stat_activity where application_name='g1c-publish-barrier';");
  await heldBarrier;
  const heldResult = resultRow((await heldPublish).stdout); assert.equal(heldResult.outcome, "published");
  await blockedUpdater;
  assert.equal(psql(`select timezone_snapshot from public.device_schedule_publications where id=${q(heldResult.publicationId)};`).stdout.trim(), "UTC");
  assert.equal(psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='publish_device_schedule';").stdout.trim(), "1");
  pass("G1-C correction: coordinated timezone races in both orders, no-write stale conflict, timezone-bound replay, missing-timezone denial and single authoritative RPC");

  const key = randomUUID(); const statement = create({ key });
  const concurrent = await Promise.all([psqlAsync(statement), psqlAsync(statement)]);
  const exceptionId = concurrent[0].stdout.trim(); assert.equal(exceptionId, concurrent[1].stdout.trim());
  assert.equal(psql(statement).stdout.trim(), exceptionId);
  fails(create({ key, reason: "Different" }), /idempotency_conflict/);
  for (const actor of [ids.staff, ids.viewer, ids.parent, ids.studentUser, ids.inactiveUser, ids.inactiveMembership, ids.otherSchoolAdmin]) {
    fails(create({ actor })); fails(revoke(exceptionId, actor));
  }
  fails(create({ school: ids.school2 })); fails(revoke(exceptionId, ids.schoolAdmin, "Cross school", ids.school2));
  fails(create({ student: null })); fails(create({ device: ids.custodyDevice }));
  fails(create({ student: null, dorm: ids.dorm6 }));
  for (const options of [{ from: "2020-01-01T00:00:00Z" }, { to: start }, { reason: " " }, { reason: null }, { from: "infinity" }, { from: start.replace(/\+00$/, "+00") + "invalid" }]) {
    fails(create(options), /check constraint|not-null constraint|invalid input syntax/);
  }
  const deviceId = psql(create({ student: null, device: ids.custodyDevice })).stdout.trim();
  const residenceId = psql(create({ student: null, dorm: ids.dorm1 })).stdout.trim();
  assert.ok(deviceId && residenceId);
  pass("G1-C create all targets; genuine concurrent idempotency, same-school/role denial, exact-one, future interval and required reason");

  fails(create({ actor: ids.supervisor }));
  psql(`insert into public.dorm_staff_assignments(school_id,user_id,dorm_id,starts_at,is_active) values
    (${q(ids.school1)},${q(ids.supervisor)},${q(ids.dorm1)},now() - interval '1 day',true);`);
  const supervisorId = psql(create({ actor: ids.supervisor })).stdout.trim();
  assert.ok(supervisorId);
  assert.ok(psql(create({ actor: ids.supervisor, student: null, device: ids.custodyDevice })).stdout.trim());
  assert.ok(psql(create({ actor: ids.supervisor, student: null, dorm: ids.dorm1 })).stdout.trim());
  fails(create({ actor: ids.supervisor, student: null, dorm: ids.dorm2 }));
  psql(`update public.dorm_staff_assignments set ends_at = now() - interval '1 second' where user_id = ${q(ids.supervisor)};`);
  fails(revoke(supervisorId, ids.supervisor)); assert.equal(read(ids.supervisor).exceptions.length, 0);
  psql(`update public.dorm_staff_assignments set ends_at = null where user_id = ${q(ids.supervisor)};`);
  assert.equal(psql(revoke(supervisorId, ids.supervisor)).stdout.trim(), supervisorId);
  const deniedSearch = json(actorSql(ids.staff, `select coalesce(jsonb_agg(t),'[]') from public.search_device_schedule_exception_targets(${q(ids.school1)},'student','Test') t;`));
  assert.deepEqual(deniedSearch, []);
  const supervisorSearch = json(actorSql(ids.supervisor, `select coalesce(jsonb_agg(t),'[]') from public.search_device_schedule_exception_targets(${q(ids.school1)},'residence','Dorm') t;`));
  assert.deepEqual(supervisorSearch.map((s) => s.id), [ids.dorm1]);
  pass("G1-C supervisor active assignment scope, expired assignment denial, authorized search and revoke");

  const beforeRevoke = read().exceptions.find((e) => e.id === exceptionId);
  const revokes = await Promise.all([psqlAsync(revoke(exceptionId)), psqlAsync(revoke(exceptionId))]);
  assert.equal(revokes[0].stdout.trim(), exceptionId); assert.equal(revokes[1].stdout.trim(), exceptionId);
  fails(revoke(exceptionId, ids.schoolAdmin, "Different reason"), /already_revoked/);
  const afterRevoke = read().exceptions.find((e) => e.id === exceptionId);
  assert.equal(afterRevoke.created_at, beforeRevoke.created_at); assert.equal(afterRevoke.reason, beforeRevoke.reason);
  assert.ok(Date.parse(afterRevoke.revoked_at) >= Date.parse(beforeRevoke.created_at)); assert.equal(afterRevoke.revoked_by_user_id, ids.schoolAdmin);
  assert.equal(afterRevoke.revoke_reason, "Fixture revoked");
  for (const table of ["device_schedule_allow_exceptions", "device_schedule_allow_revocations"]) {
    fails(`set role authenticated; select * from public.${table};`);
    fails(`set role authenticated; delete from public.${table};`);
    fails(`update public.${table} set school_id=school_id;`, /published_device_schedule_is_immutable/);
    fails(`delete from public.${table};`, /published_device_schedule_is_immutable/);
  }
  for (const role of ["anon", "service_role"]) fails(`set role ${role}; select public.read_device_schedule_authoring(${q(ids.school1)});`);
  const functions = json(`select jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'owner',r.rolname,'config',p.proconfig))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
    where n.nspname='public' and p.proname in ('read_device_schedule_authoring','create_device_schedule_allow','revoke_device_schedule_allow','search_device_schedule_exception_targets');`);
  assert.equal(functions.length, 4); for (const f of functions) { assert.equal(f.definer, true); assert.equal(f.owner, "postgres"); assert.deepEqual(f.config, ['search_path=""']); }
  pass("G1-C immutable create/revoke audit, concurrent revoke retry, protected tables and hardened RPC ownership/ACL");

  // Use persisted exception rows with controlled event-time ownership and policy
  // fixtures; never infer historical membership from today's mutable student row.
  const persisted = read().exceptions;
  const subject = ids.custodyDevice;
  const a = persisted.find((e) => e.id === deviceId);
  const weekday = (new Date(a.start_at).getUTCDay() + 6) % 7;
  const p = { id: "fixture", school_id: ids.school1, dorm_id: null, scope_revision: "1", policy_id: "fixture", predecessor_publication_id: null,
    replaces_publication_id: null, timezone_snapshot: "UTC", effective_from: a.start_at.slice(0,10), declared_effective_to: null, is_active: true,
    events: [{ id: "r", weekday, local_time: "00:00", event_type: "return" }, { id: "l", weekday: (weekday + 2) % 7, local_time: "23:00", event_type: "release" }] };
  const input = { school_id: ids.school1, subject_id: subject, subject_kind: "device", as_of: new Date().toISOString(), exceptions: persisted,
    assignments: [{ id: "controlled-event-time", school_id: ids.school1, subject_id: subject, student_id: ids.student, dorm_id: null,
      evidence: "disposable controlled ownership fixture", start: a.start_at, end: a.end_at }], query: { start: a.start_at, end: a.end_at },
    scopes: [{ school_id: ids.school1, dorm_id: null, revision: "1", publications: [p], ledger: [{ id: "fixture", school_id: ids.school1, dorm_id: null,
      scope_revision: "1", operation: "publish", publication_id: "fixture", predecessor_publication_id: null, replaced_publication_id: null, cutover_date: p.effective_from }] }] };
  const resolved = resolveScheduleWithAllows(input); assert.ok(resolved.segments.every((s) => s.state === "ALLOWED"));
  assert.deepEqual(resolved.windows, resolved.base.windows);
  const after = json(`select jsonb_build_object('devices', (select jsonb_agg(to_jsonb(d) order by id) from public.device_custody_devices d),
    'events', (select jsonb_agg(to_jsonb(e) order by id) from public.device_custody_events e),
    'notices', (select jsonb_agg(to_jsonb(n) order by id) from public.device_custody_notices n));`);
  assert.deepEqual(after, before);
  pass("G1-C persisted allow overlay and byte-for-byte custody device/event/notice isolation");
}
