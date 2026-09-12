import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { resolveSchedule, scheduleResolverVersions } from "../lib/schedules/resolver.ts";

// Invoked only by the disposable G1-A harness with --with-g1b. No connection
// string, production project, credential, or network database access is used.
export async function runResolverDatabaseChecks({ psql, runPublish, cancelStatement, resultRow, ids, pass }) {
  const school = "71000000-0000-0000-0000-000000000001";
  const residence = "72000000-0000-0000-0000-000000000001";
  const emptyResidence = "72000000-0000-0000-0000-000000000002";
  const subject = "73000000-0000-0000-0000-000000000001";
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const json = (sql) => JSON.parse(psql(sql).stdout.trim());
  const operationalSnapshot = () => json(`
select jsonb_build_object(
  'devices', (select coalesce(jsonb_agg(to_jsonb(d) order by id), '[]') from public.device_custody_devices d),
  'events', (select coalesce(jsonb_agg(to_jsonb(e) order by id), '[]') from public.device_custody_events e),
  'notices', (select coalesce(jsonb_agg(to_jsonb(n) order by id), '[]') from public.device_custody_notices n),
  'incident_tables', (select coalesce(jsonb_agg(table_name order by table_name), '[]') from information_schema.tables
    where table_schema = 'public' and table_name like '%incident%')
);`);
  const before = operationalSnapshot();
  const monday = psql(`select (current_date + 42 + ((8 - extract(isodow from current_date + 42)::int) % 7))::text;`).stdout.trim();
  const day = (offset) => Temporal.PlainDate.from(monday).add({ days: offset }).toString();
  const timestamp = (offset, time) => `${day(offset)}T${time}:00Z`;
  psql(`
insert into public.schools (id, name, slug, timezone, is_active)
values (${q(school)}::uuid, 'G1-B disposable fixture', 'g1b-disposable', 'UTC', true);
insert into public.dorms (id, school_id, name, code, is_active) values
  (${q(residence)}::uuid, ${q(school)}::uuid, 'Resolver residence', 'G1B', true),
  (${q(emptyResidence)}::uuid, ${q(school)}::uuid, 'Empty residence', 'G1BE', true);
insert into public.students (id, school_id, dorm_id, student_number, first_name, last_name)
values (${q(subject)}::uuid, ${q(school)}::uuid, ${q(residence)}::uuid, 'G1B', 'Resolver', 'Fixture');
`);
  const events = [
    { weekday: 0, local_time: "21:00", event_type: "return" },
    { weekday: 1, local_time: "07:00", event_type: "release" }
  ];
  const publish = (options = {}) => {
    const result = runPublish({ actor: ids.superAdmin, school, key: randomUUID(), from: `${q(day(-1))}::date`, events, ...options });
    assert.equal(result.outcome, "published");
    return result;
  };

  // One read-only repeatable-read transaction. Include explicit empty scopes,
  // immutable published content and the entire ledger through each revision.
  // Policy/event-only SELECTs cannot establish absence of a residence override.
  const readScopes = () => json(`
begin isolation level repeatable read read only;
select jsonb_agg(jsonb_build_object(
  'school_id', ${q(school)}, 'dorm_id', requested.dorm_id,
  'revision', coalesce((select revision::text from public.device_schedule_scope_revisions s
    where s.school_id = ${q(school)}::uuid and s.dorm_id is not distinct from requested.dorm_id), '0'),
  'publications', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
    'scope_revision', p.scope_revision::text, 'is_active', policy.is_active,
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.weekday, e.local_time), '[]')
      from public.device_schedule_weekly_events e where e.school_id = p.school_id and e.policy_id = p.policy_id)
  ) order by p.scope_revision), '[]')
    from public.device_schedule_publications p
    join public.device_schedule_policies policy on policy.school_id = p.school_id and policy.id = p.policy_id
    where p.school_id = ${q(school)}::uuid and p.dorm_id is not distinct from requested.dorm_id),
  'ledger', (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object('scope_revision', l.scope_revision::text)
    order by l.scope_revision), '[]') from public.device_schedule_publication_ledger l
    where l.school_id = ${q(school)}::uuid and l.dorm_id is not distinct from requested.dorm_id)
) order by requested.dorm_id nulls first)
from (values (null::uuid), (${q(residence)}::uuid), (${q(emptyResidence)}::uuid)) requested(dorm_id);
commit;
`);
  const request = (scopes, dorm_id = null, query = { instant: timestamp(0, "22:00") }) => ({
    school_id: school, subject_id: subject, scopes, query,
    // Explicit controlled fixture evidence; never inferred from students.dorm_id.
    assignments: [{ id: "controlled-asof", school_id: school, subject_id: subject, dorm_id, evidence: "G1-B controlled assignment fixture",
      start: timestamp(-10, "00:00"), end: timestamp(40, "00:00") }]
  });
  const state = (result) => result.segments[0].state;
  const bounds = (result) => result.windows.map((w) => [w.restricted_window_start, w.restricted_window_end]);

  const p1 = publish();
  const revision1 = readScopes();
  const result1 = resolveSchedule(request(revision1));
  assert.equal(state(result1), "RESTRICTED");
  assert.deepEqual(bounds(result1), [[timestamp(0, "21:00"), timestamp(1, "07:00")]]);
  assert.equal(result1.windows[0].provenance[0].publication_id, p1.publicationId);
  assert.equal(result1.windows[0].provenance[0].policy_id, p1.policyId);
  assert.equal(state(resolveSchedule(request(revision1, emptyResidence))), "RESTRICTED");
  assert.equal(state(resolveSchedule({ ...request(revision1), assignments: [] })), "UNCONFIGURED");
  pass("G1-B persisted publication, school-only, empty-residence fallback, unknown as-of");

  const p2 = publish({ revision: 1, predecessor: p1.publicationId, from: `${q(day(1))}::date`, events: [
    { weekday: 0, local_time: "23:00", event_type: "return" }, { weekday: 1, local_time: "09:00", event_type: "release" }
  ] });
  const revision2 = readScopes();
  const result2 = resolveSchedule(request(revision2));
  assert.deepEqual(bounds(result2), [[timestamp(0, "21:00"), timestamp(1, "09:00")]]);
  assert.deepEqual(result2.windows[0].provenance.map((p) => p.publication_id), [p1.publicationId, p2.publicationId]);
  assert.deepEqual(resolveSchedule(request(revision1)), result1);
  pass("G1-B persisted successor cutover, continuous union and saved revision replay");

  const p3 = publish({ revision: 2, predecessor: p1.publicationId, replaces: p2.publicationId, from: `${q(day(1))}::date`, events: [
    { weekday: 0, local_time: "23:00", event_type: "return" }, { weekday: 1, local_time: "10:00", event_type: "release" }
  ] });
  const replacement = resolveSchedule(request(readScopes()));
  assert.deepEqual(bounds(replacement), [[timestamp(0, "21:00"), timestamp(1, "10:00")]]);
  assert.deepEqual(replacement.windows[0].provenance.map((p) => p.publication_id), [p1.publicationId, p3.publicationId]);
  const cancellation = resultRow(psql(cancelStatement({ actor: ids.superAdmin, school, revision: 3,
    key: randomUUID(), publication: p3.publicationId })).stdout);
  assert.equal(cancellation.outcome, "cancelled");
  const cancelled = resolveSchedule(request(readScopes()));
  assert.deepEqual(bounds(cancelled), bounds(result1));
  assert.equal(cancelled.windows[0].restricted_window_id, result1.windows[0].restricted_window_id);
  assert.deepEqual(resolveSchedule(request(revision2)), result2);
  pass("G1-B persisted replacement/cancellation history and deterministic old-revision replay");

  const residencePublication = publish({ dorm: residence, events: [
    { weekday: 0, local_time: "23:00", event_type: "return" }, { weekday: 1, local_time: "08:00", event_type: "release" }
  ] });
  const residenceSnapshot = readScopes();
  const overridden = resolveSchedule(request(residenceSnapshot, residence));
  assert.equal(state(overridden), "ALLOWED");
  assert.equal(overridden.segments[0].provenance[0].publication_id, residencePublication.publicationId);
  const corruptedCopy = structuredClone(residenceSnapshot);
  corruptedCopy.find((s) => s.dorm_id === residence).publications[0].events = [];
  assert.equal(state(resolveSchedule(request(corruptedCopy, residence))), "INVALID");
  assert.equal(state(resolveSchedule(request(residenceSnapshot, residence))), "ALLOWED");
  pass("G1-B real residence override and invalid copied-snapshot no-fallback (no invalid DB write)");

  psql(`update public.schools set timezone = 'America/New_York' where id = ${q(school)}::uuid;`);
  const newZone = publish({ revision: 4, predecessor: p1.publicationId, from: `${q(day(8))}::date` });
  psql(`update public.schools set timezone = 'Pacific/Honolulu' where id = ${q(school)}::uuid;`);
  const zoneSnapshot = readScopes();
  const zonePolicy = zoneSnapshot[0].publications.find((p) => p.id === newZone.publicationId);
  assert.equal(zonePolicy.timezone_snapshot, "America/New_York");
  const returnUtc = Temporal.PlainDateTime.from(`${day(14)}T21:00`).toZonedDateTime("America/New_York").toInstant().toString();
  const releaseUtc = Temporal.PlainDateTime.from(`${day(15)}T07:00`).toZonedDateTime("America/New_York").toInstant().toString();
  assert.deepEqual(bounds(resolveSchedule(request(zoneSnapshot, null, { instant: returnUtc }))), [[returnUtc, releaseUtc]]);
  pass("G1-B immutable publication timezone is independent of today's school timezone");

  // Persist a DST fixture through G1-A with a future transition date. Expected
  // UTC instants are arithmetic calendar fixtures, not library disambiguation.
  const year = Temporal.PlainDate.from(monday).year + 1;
  const november1 = Temporal.PlainDate.from({ year, month: 11, day: 1 });
  const fallbackSunday = november1.add({ days: (7 - november1.dayOfWeek) % 7 });
  psql(`update public.schools set timezone = 'America/New_York' where id = ${q(school)}::uuid;`);
  publish({ dorm: emptyResidence, from: `${q(fallbackSunday.subtract({ days: 1 }).toString())}::date`, events: [
    { weekday: 6, local_time: "01:15", event_type: "return" }, { weekday: 6, local_time: "01:45", event_type: "release" }
  ] });
  const dstRequest = request(readScopes(), emptyResidence, { instant: `${fallbackSunday}T06:00:00Z` });
  dstRequest.assignments[0].start = `${year}-01-01T00:00:00Z`;
  dstRequest.assignments[0].end = `${year + 1}-01-01T00:00:00Z`;
  assert.deepEqual(bounds(resolveSchedule(dstRequest)), [[`${fallbackSunday}T05:15:00Z`, `${fallbackSunday}T06:45:00Z`]]);
  pass("G1-B persisted New York fall-back template resolves both ambiguous boundaries");

  assert.deepEqual(operationalSnapshot(), before);
  assert.deepEqual(before.incident_tables, []);
  pass("G1-B full custody device/event/notice rows unchanged; no incident tables created");
  process.stdout.write(`G1-B runtime versions: ${JSON.stringify(scheduleResolverVersions())}\n`);
  process.stdout.write("G1-B disposable PostgreSQL runtime: PASS\n");
}
