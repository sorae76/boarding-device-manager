import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Native Node test runner requires the source extension.
import { previewScheduleDraft, activePublications } from "../lib/schedules/authoring.ts";
// @ts-expect-error Native Node test runner requires the source extension.
import { resolveScheduleWithAllows } from "../lib/schedules/exceptions.ts";
// @ts-expect-error Native Node test runner requires the source extension.
import { resolveSchedule } from "../lib/schedules/resolver.ts";
import type { AuthoringSnapshot, ScheduleDraft } from "../lib/schedules/authoring-types";
import type { AllowException, AllowResolverInput } from "../lib/schedules/exceptions";

const school = "10000000-0000-0000-0000-000000000001", dorm = "20000000-0000-0000-0000-000000000001";
const student = "30000000-0000-0000-0000-000000000001", device = "40000000-0000-0000-0000-000000000001";
const snapshot = (): AuthoringSnapshot => ({ school_id: school, timezone: "America/New_York", today: "2030-01-01", observed_at: "2030-01-01T12:00:00Z",
  can_manage_school: true, residences: [{ id: dorm, name: "Dorm" }], exceptions: [], intervals: [],
  scopes: [null, dorm].map((dorm_id) => ({ school_id: school, dorm_id, revision: "0", publications: [], ledger: [] })) });
const draft = (): ScheduleDraft => ({ dorm_id: null, name: "Week", effective_from: "2030-01-07", effective_to: null, expected_revision: "0",
  predecessor_id: null, replaces_id: null, idempotency_key: "50000000-0000-0000-0000-000000000001",
  events: [{ weekday: 0, local_time: "21:00", event_type: "return" }, { weekday: 1, local_time: "07:00", event_type: "release" }] });
function request(): AllowResolverInput {
  const s = snapshot();
  const p = { id: "publication", school_id: school, dorm_id: null, scope_revision: "1", policy_id: "policy", predecessor_publication_id: null,
    replaces_publication_id: null, timezone_snapshot: "UTC", effective_from: "2030-01-01", declared_effective_to: null, is_active: true,
    events: draft().events.map((e, i) => ({ ...e, id: `${i}` })) };
  return { school_id: school, subject_id: device, subject_kind: "device", as_of: "2030-01-08T12:00:00Z", exceptions: [],
    scopes: [{ ...s.scopes[0], revision: "1", publications: [p], ledger: [{ id: "ledger", school_id: school, dorm_id: null,
      scope_revision: "1", operation: "publish", publication_id: p.id, predecessor_publication_id: null, replaced_publication_id: null, cutover_date: p.effective_from }] }, s.scopes[1]],
    assignments: [{ id: "asof", school_id: school, subject_id: device, student_id: student, dorm_id: dorm, evidence: "historical fixture",
      start: "2030-01-01T00:00:00Z", end: "2030-02-01T00:00:00Z" }], query: { start: "2030-01-07T21:00:00Z", end: "2030-01-08T07:00:00Z" } };
}
function allow(id: string, start = "2030-01-07T22:00:00Z", end = "2030-01-08T01:00:00Z"): AllowException {
  return { id, school_id: school, effect: "allow", device_id: device, student_id: null, dorm_id: null, start_at: start, end_at: end,
    reason: "Approved", created_by_user_id: "actor", created_at: "2030-01-01T12:00:00Z", revoked_at: null, revoked_by_user_id: null, revoke_reason: null };
}
test("G1-C school and residence drafts get deterministic server preview and UTC effective interval", () => {
  for (const dorm_id of [null, dorm]) {
    const d = { ...draft(), dorm_id }; const a = previewScheduleDraft(snapshot(), d);
    assert.deepEqual(a, previewScheduleDraft(snapshot(), d)); assert.equal(a.start, "2030-01-07T05:00:00Z");
    assert.ok(a.resolution.segments.some((s) => s.state === "RESTRICTED"));
    assert.equal(a.resolution.windows[0].provenance[0].scope, dorm_id ? "residence" : "school");
  }
});
test("G1-C preview denies unauthorized school, foreign residence, stale revision, today and invalid weekly ring", () => {
  assert.throws(() => previewScheduleDraft({ ...snapshot(), can_manage_school: false }, draft()), /authorized/);
  assert.throws(() => previewScheduleDraft(snapshot(), { ...draft(), dorm_id: student }), /authorized/);
  assert.throws(() => previewScheduleDraft(snapshot(), { ...draft(), expected_revision: "1" }), /changed/);
  assert.throws(() => previewScheduleDraft(snapshot(), { ...draft(), effective_from: "2030-01-01" }), /tomorrow/);
  assert.throws(() => previewScheduleDraft(snapshot(), { ...draft(), events: [{ weekday: 0, local_time: "22:00", event_type: "return" }, { weekday: 1, local_time: "07:00", event_type: "return" }] }), /nonalternating/);
});
test("G1-C preview change invalidates fingerprint; inclusive date has exclusive UTC end", () => {
  const first = previewScheduleDraft(snapshot(), draft());
  const next = previewScheduleDraft(snapshot(), { ...draft(), name: "Changed", effective_to: "2030-01-09" });
  assert.notEqual(first.fingerprint, next.fingerprint); assert.equal(next.end, "2030-01-10T05:00:00Z");
});
test("G1-C future successor and replacement preserve published snapshots and detect chain conflicts", () => {
  const s = snapshot(); const id = "60000000-0000-0000-0000-000000000001";
  s.scopes[0] = { ...s.scopes[0], revision: "1", publications: [{ id, name: "Existing", school_id: school, dorm_id: null,
    scope_revision: "1", policy_id: "policy", predecessor_publication_id: null, replaces_publication_id: null,
    timezone_snapshot: "America/New_York", effective_from: "2030-01-03", declared_effective_to: null, is_active: true,
    events: draft().events.map((e, i) => ({ ...e, id: String(i) })) }], ledger: [{ id: "ledger", school_id: school, dorm_id: null,
    scope_revision: "1", operation: "publish", publication_id: id, predecessor_publication_id: null, replaced_publication_id: null, cutover_date: "2030-01-03" }] };
  const copy = structuredClone(s);
  assert.ok(previewScheduleDraft(s, { ...draft(), expected_revision: "1", predecessor_id: id }).resolution.windows.length);
  assert.ok(previewScheduleDraft(s, { ...draft(), expected_revision: "1", replaces_id: id }).resolution.windows.length);
  assert.deepEqual(s, copy);
  assert.throws(() => previewScheduleDraft(s, { ...draft(), expected_revision: "1" }), /chain changed/);
  assert.throws(() => previewScheduleDraft({ ...s, today: "2030-01-04" }, { ...draft(), expected_revision: "1", replaces_id: id }), /chain changed/);
});
test("G1-C authoring preview retains G1-B New York fold and gap boundary choices", () => {
  const s = snapshot();
  for (const [date, returned, released, expectedStart, expectedEnd] of [
    ["2030-11-03", "01:30", "01:45", "2030-11-03T05:30:00Z", "2030-11-03T06:45:00Z"],
    ["2030-03-10", "02:30", "02:45", "2030-03-10T06:30:00Z", "2030-03-10T07:45:00Z"]
  ]) {
    const r = previewScheduleDraft(s, { ...draft(), effective_from: date, events: [
      { weekday: 6, local_time: returned, event_type: "return" }, { weekday: 6, local_time: released, event_type: "release" }
    ] });
    assert.equal(r.resolution.windows[0].restricted_window_start, expectedStart);
    assert.equal(r.resolution.windows[0].restricted_window_end, expectedEnd);
  }
});
test("G1-C allows union across all target kinds preserves canonical window/provenance and inputs", () => {
  const input = request(); input.exceptions = [allow("device"), { ...allow("student", "2030-01-08T00:00:00Z", "2030-01-08T03:00:00Z"), device_id: null, student_id: student },
    { ...allow("residence", "2030-01-08T02:00:00Z", "2030-01-08T04:00:00Z"), device_id: null, dorm_id: dorm }];
  const copy = structuredClone(input); const r = resolveScheduleWithAllows(input);
  assert.deepEqual(input, copy); assert.deepEqual(r.windows, r.base.windows);
  assert.ok(r.segments.filter((s) => s.state === "ALLOWED").every((s) => s.restricted_window_id === r.windows[0].restricted_window_id));
  assert.equal(r.segments.filter((s) => s.state === "RESTRICTED").reduce((sum, s) => sum + Date.parse(s.end) - Date.parse(s.start), 0), 4 * 3600000);
  assert.deepEqual(r, resolveScheduleWithAllows({ ...input, exceptions: [...input.exceptions].reverse() }));
});
test("G1-C overlay ownership metadata never renames the original G1-B window", () => {
  const input = request();
  const original = resolveSchedule({ ...input, assignments: input.assignments.map((a) => ({
    id: a.id, school_id: a.school_id, subject_id: a.subject_id, evidence: a.evidence, start: a.start, end: a.end, dorm_id: a.dorm_id
  })) });
  input.exceptions = [allow("a")];
  const overlay = resolveScheduleWithAllows(input);
  assert.deepEqual(overlay.base, original); assert.deepEqual(overlay.windows, original.windows);
  assert.deepEqual(resolveScheduleWithAllows({ ...input, assignments: input.assignments.map((a) => ({ ...a, student_id: "another-owner" })) }).windows, original.windows);
});
test("G1-C revoke clips only its future effect; overlapping allow remains, history and old as-of replay remain", () => {
  const input = request(); const a = { ...allow("a"), revoked_at: "2030-01-07T23:00:00Z", revoked_by_user_id: "actor", revoke_reason: "Changed" };
  input.exceptions = [a, allow("b")];
  let r = resolveScheduleWithAllows(input);
  assert.ok(r.segments.some((s) => s.start === a.revoked_at && s.state === "ALLOWED" && s.allow_exception_ids.join() === "b"));
  r = resolveScheduleWithAllows({ ...input, exceptions: [a] });
  assert.ok(r.segments.some((s) => s.end === a.revoked_at && s.state === "ALLOWED"));
  assert.ok(r.segments.some((s) => s.start === a.revoked_at && s.state === "RESTRICTED"));
  const past = resolveScheduleWithAllows({ ...input, exceptions: [a], as_of: "2030-01-07T22:30:00Z" });
  assert.ok(past.segments.some((s) => s.end === a.end_at && s.state === "ALLOWED"));
});
test("G1-C half-open exact allow endpoints and creation-as-of", () => {
  const input = request(); input.exceptions = [allow("a")];
  assert.equal(resolveScheduleWithAllows({ ...input, query: { instant: input.exceptions[0].start_at } }).segments[0].state, "ALLOWED");
  assert.equal(resolveScheduleWithAllows({ ...input, query: { instant: input.exceptions[0].end_at } }).segments[0].state, "RESTRICTED");
  assert.ok(resolveScheduleWithAllows({ ...input, as_of: "2029-12-31T00:00:00Z" }).segments.every((s) => s.state === "RESTRICTED"));
});
test("G1-C residence and student exceptions follow event-time assignments, unknown gaps never backfill", () => {
  const input = request(); input.exceptions = [{ ...allow("a"), device_id: null, student_id: student }, { ...allow("b"), device_id: null, dorm_id: dorm }];
  input.assignments = [{ ...input.assignments[0], end: "2030-01-07T23:00:00Z" }, { ...input.assignments[0], id: "later", start: "2030-01-08T00:00:00Z", dorm_id: null, student_id: "new-owner" }];
  const r = resolveScheduleWithAllows(input);
  assert.ok(r.segments.some((s) => s.start === "2030-01-07T23:00:00Z" && s.state === "UNCONFIGURED"));
  assert.ok(r.segments.some((s) => s.start === "2030-01-08T00:00:00Z" && s.state === "RESTRICTED"));
});
test("G1-C invalid exception snapshots fail closed", () => {
  const input = request();
  for (const a of [{ ...allow("a"), school_id: "other" }, { ...allow("a"), student_id: student }, { ...allow("a"), reason: " " },
    { ...allow("a"), created_at: "2030-01-08T00:00:00Z" }, { ...allow("a"), effect: "restrict" as "allow" }]) {
    assert.ok(resolveScheduleWithAllows({ ...input, exceptions: [a] }).segments.every((s) => s.state === "INVALID"));
  }
});
test("G1-C preserves INVALID/UNCONFIGURED and empty scope", () => {
  const input = request(); input.exceptions = [allow("a")]; input.scopes = [];
  assert.ok(resolveScheduleWithAllows(input).segments.every((s) => s.state === "UNCONFIGURED"));
  assert.deepEqual(activePublications(snapshot().scopes[0]), []);
});
test("G1-C mutation paths use authenticated approved RPCs only and keep custody untouched", () => {
  const source = readFileSync(new URL("../lib/schedules/actions.ts", import.meta.url), "utf8");
  assert.match(source, /requireScheduleContext/); assert.match(source, /publish_device_schedule/); assert.match(source, /cancel_future_device_schedule_publication/);
  assert.match(source, /request_exists/); assert.match(source, /fingerprint/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|service_role|transition.*custody/);
  const sql = readFileSync(new URL("../supabase/migrations/20260912222326_g1c_schedule_authoring_and_allow_exceptions.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.(?:device_custody|students|dorm_staff)/i);
  assert.match(sql, /num_nonnulls\(device_id, student_id, dorm_id\) = 1/);
});
