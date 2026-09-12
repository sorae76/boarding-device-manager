import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node native TypeScript tests require an explicit extension.
import { resolveSchedule, scheduleResolverVersions } from "../lib/schedules/resolver.ts";
import type { Publication, ScopeSnapshot, ResolverInput } from "../lib/schedules/resolver";

const school = "school-a";
const event = (weekday: number, local_time: string, event_type: "return" | "release", id = `${weekday}-${local_time}-${event_type}`) => ({ id, weekday, local_time, event_type });
const overnight = [event(0, "21:00", "return"), event(1, "07:00", "release")];
function publication(overrides: Partial<Publication> = {}): Publication {
  return { id: "p1", school_id: school, dorm_id: null, scope_revision: "1", policy_id: "policy-p1",
    predecessor_publication_id: null, replaces_publication_id: null, timezone_snapshot: "UTC",
    effective_from: "2025-01-01", declared_effective_to: null, is_active: true, events: overnight, ...overrides };
}
function scope(publications: Publication[] = [publication()], dorm_id: string | null = null): ScopeSnapshot {
  return { school_id: school, dorm_id, revision: String(publications.length), publications,
    ledger: publications.map((p) => ({ id: `ledger-${p.id}`, school_id: school, dorm_id,
      scope_revision: p.scope_revision, operation: p.replaces_publication_id ? "replace" : "publish",
      publication_id: p.id, predecessor_publication_id: p.predecessor_publication_id,
      replaced_publication_id: p.replaces_publication_id, cutover_date: p.effective_from })) };
}
function input(scopes = [scope()], overrides: Partial<ResolverInput> = {}): ResolverInput {
  return { school_id: school, subject_id: "student-a", scopes,
    assignments: [{ id: "asof-a", school_id: school, subject_id: "student-a", evidence: "fixture-evidence", dorm_id: null,
      start: "2024-01-01T00:00:00Z", end: "2028-01-01T00:00:00Z" }],
    query: { instant: "2025-01-06T22:00:00Z" }, ...overrides };
}
function at(value: string, publications: Publication[] = [publication()]) {
  return resolveSchedule(input([scope(publications)], { query: { instant: value } }));
}
function onlyState(result: ReturnType<typeof resolveSchedule>) { assert.equal(result.segments.length, 1); return result.segments[0].state; }
function bounds(result: ReturnType<typeof resolveSchedule>) {
  return result.windows.map((w) => [w.restricted_window_start, w.restricted_window_end]);
}

test("A school-wide policy: restricted result and complete UTC/local provenance", () => {
  const result = resolveSchedule(input());
  assert.equal(onlyState(result), "RESTRICTED");
  assert.deepEqual(bounds(result), [["2025-01-06T21:00:00Z", "2025-01-07T07:00:00Z"]]);
  const p = result.windows[0].provenance[0];
  assert.equal(p.selection, "school_only");
  assert.equal(p.return?.event_id, overnight[0].id);
  assert.equal(p.release?.event_id, overnight[1].id);
  assert.equal(p.local_start, "2025-01-06T21:00:00+00:00[UTC]");
  assert.deepEqual(result.versions, scheduleResolverVersions());
});
test("B residence policy completely overrides school events", () => {
  const request = input([scope(), scope([publication({ id: "res", dorm_id: "r1", events: [event(0, "23:00", "return"), event(1, "08:00", "release")] })], "r1")]);
  request.assignments[0].dorm_id = "r1";
  const result = resolveSchedule(request);
  assert.equal(onlyState(result), "ALLOWED");
  assert.equal(result.segments[0].provenance[0].selection, "residence_override");
  assert.equal(result.segments[0].provenance[0].publication_id, "res");
});
test("C proven empty residence scope falls back to school", () => {
  const request = input([scope(), scope([], "r1")]); request.assignments[0].dorm_id = "r1";
  const result = resolveSchedule(request);
  assert.equal(onlyState(result), "RESTRICTED");
  assert.equal(result.windows[0].provenance[0].selection, "school_fallback");
});
test("D invalid residence ring does not fall back", () => {
  const request = input([scope(), scope([publication({ id: "res", dorm_id: "r1", events: [] })], "r1")]);
  request.assignments[0].dorm_id = "r1";
  const result = resolveSchedule(request);
  assert.equal(onlyState(result), "INVALID"); assert.deepEqual(result.windows, []);
  assert.equal(result.segments[0].reason, "incomplete_event_ring");
  assert.equal(result.segments[0].provenance[0].publication_id, "res");
});
test("E no effective publication is UNCONFIGURED, not ALLOWED", () => {
  assert.equal(onlyState(resolveSchedule(input([scope([])]))), "UNCONFIGURED");
  assert.equal(onlyState(at("2024-12-31T23:59:00Z")), "UNCONFIGURED");
});
test("F same-day restricted window", () => {
  const p = publication({ events: [event(0, "09:00", "return"), event(0, "15:00", "release")] });
  assert.deepEqual(bounds(at("2025-01-06T10:00:00Z", [p])), [["2025-01-06T09:00:00Z", "2025-01-06T15:00:00Z"]]);
});
test("G cross-midnight", () => {
  assert.deepEqual(bounds(at("2025-01-07T02:00:00Z")), [["2025-01-06T21:00:00Z", "2025-01-07T07:00:00Z"]]);
});
test("H/I Sunday to Monday uses previous-week Return", () => {
  const p = publication({ events: [event(0, "07:00", "release"), event(6, "22:00", "return")] });
  assert.deepEqual(bounds(at("2025-01-06T03:00:00Z", [p])), [["2025-01-05T22:00:00Z", "2025-01-06T07:00:00Z"]]);
});
test("J current-week Return pairs with next-week Release", () => {
  const p = publication({ events: [event(0, "07:00", "release"), event(0, "21:00", "return")] });
  assert.deepEqual(bounds(at("2025-01-12T23:00:00Z", [p])), [["2025-01-06T21:00:00Z", "2025-01-13T07:00:00Z"]]);
});
test("K multiple alternating windows per day and week", () => {
  const p = publication({ events: [event(0, "09:00", "return"), event(0, "10:00", "release"), event(0, "12:00", "return"), event(0, "13:00", "release"), ...overnight] });
  const result = resolveSchedule(input([scope([p])], { query: { start: "2025-01-06T00:00:00Z", end: "2025-01-08T00:00:00Z" } }));
  assert.equal(result.windows.length, 3);
  assert.deepEqual(result.windows.map((w) => w.provenance[0].return?.local), ["2025-01-06T09:00:00", "2025-01-06T12:00:00", "2025-01-06T21:00:00"]);
});
test("L exact Return is RESTRICTED; M exact Release is ALLOWED", () => {
  assert.equal(onlyState(at("2025-01-06T20:59:59.999Z")), "ALLOWED");
  assert.equal(onlyState(at("2025-01-06T21:00:00Z")), "RESTRICTED");
  assert.equal(onlyState(at("2025-01-07T06:59:59.999Z")), "RESTRICTED");
  assert.equal(onlyState(at("2025-01-07T07:00:00Z")), "ALLOWED");
});
test("N effective_from midnight clips a previous-week Return", () => {
  const p = publication({ effective_from: "2025-01-06", events: [event(6, "21:00", "return"), event(0, "07:00", "release")] });
  assert.deepEqual(bounds(at("2025-01-06T01:00:00Z", [p])), [["2025-01-06T00:00:00Z", "2025-01-06T07:00:00Z"]]);
});
test("O inclusive declared effective_to clips at following midnight", () => {
  const p = publication({ declared_effective_to: "2025-01-06" });
  assert.deepEqual(bounds(at("2025-01-06T22:00:00Z", [p])), [["2025-01-06T21:00:00Z", "2025-01-07T00:00:00Z"]]);
  assert.equal(onlyState(at("2025-01-07T00:00:00Z", [p])), "UNCONFIGURED");
});
test("P authorized successor clips old template without cross-policy event pairing", () => {
  const p2 = publication({ id: "p2", policy_id: "policy-p2", scope_revision: "2", predecessor_publication_id: "p1", effective_from: "2025-01-07", events: [event(1, "12:00", "return"), event(1, "13:00", "release")] });
  assert.deepEqual(bounds(at("2025-01-06T22:00:00Z", [publication(), p2])), [["2025-01-06T21:00:00Z", "2025-01-07T00:00:00Z"]]);
  assert.equal(onlyState(at("2025-01-07T00:00:00Z", [publication(), p2])), "ALLOWED");
});
test("Q restricted on both sides of cutover unions with both publication versions", () => {
  const p2 = publication({ id: "p2", policy_id: "policy-p2", scope_revision: "2", predecessor_publication_id: "p1", effective_from: "2025-01-07", events: [event(0, "23:00", "return"), event(1, "09:00", "release")] });
  const result = at("2025-01-07T00:00:00Z", [publication(), p2]);
  assert.deepEqual(bounds(result), [["2025-01-06T21:00:00Z", "2025-01-07T09:00:00Z"]]);
  assert.deepEqual(result.windows[0].provenance.map((p) => p.publication_id), ["p1", "p2"]);
  assert.equal(result.windows[0].provenance[0].release?.utc, "2025-01-07T07:00:00Z");
  assert.equal(result.windows[0].provenance[0].end, "2025-01-07T00:00:00Z");
});
test("R UNCONFIGURED gaps are not merged", () => {
  const events = [event(0, "07:00", "release"), event(0, "21:00", "return")];
  const p1 = publication({ events, declared_effective_to: "2025-01-06" });
  const p2 = publication({ id: "p2", scope_revision: "2", predecessor_publication_id: "p1", effective_from: "2025-01-08", events });
  const result = resolveSchedule(input([scope([p1, p2])], { query: { start: "2025-01-06T22:00:00Z", end: "2025-01-08T12:00:00Z" } }));
  assert.deepEqual(bounds(result), [["2025-01-06T21:00:00Z", "2025-01-07T00:00:00Z"], ["2025-01-08T00:00:00Z", "2025-01-13T07:00:00Z"]]);
  assert.ok(result.segments.some((s) => s.state === "UNCONFIGURED"));
});

const dstFixtures = [
  { name: "S fall-back ambiguous Return earlier", zone: "America/New_York", events: [event(6, "01:30", "return"), event(6, "03:00", "release")], query: "2025-11-02T06:00:00Z", start: "2025-11-02T05:30:00Z", end: "2025-11-02T08:00:00Z" },
  { name: "T fall-back ambiguous Release later", zone: "America/New_York", events: [event(6, "00:30", "return"), event(6, "01:30", "release")], query: "2025-11-02T06:00:00Z", start: "2025-11-02T04:30:00Z", end: "2025-11-02T06:30:00Z" },
  { name: "U spring nonexistent Return earlier", zone: "America/New_York", events: [event(6, "02:30", "return"), event(6, "04:00", "release")], query: "2025-03-09T07:00:00Z", start: "2025-03-09T06:30:00Z", end: "2025-03-09T08:00:00Z" },
  { name: "V spring nonexistent Release later", zone: "America/New_York", events: [event(6, "01:00", "return"), event(6, "02:30", "release")], query: "2025-03-09T07:00:00Z", start: "2025-03-09T06:00:00Z", end: "2025-03-09T07:30:00Z" },
  { name: "W Lord Howe 30-minute gap Return", zone: "Australia/Lord_Howe", events: [event(6, "02:15", "return"), event(6, "03:00", "release")], query: "2025-10-04T15:30:00Z", start: "2025-10-04T15:15:00Z", end: "2025-10-04T16:00:00Z" },
  { name: "W Lord Howe 30-minute gap Release", zone: "Australia/Lord_Howe", events: [event(6, "01:00", "return"), event(6, "02:15", "release")], query: "2025-10-04T15:30:00Z", start: "2025-10-04T14:30:00Z", end: "2025-10-04T15:45:00Z" },
  { name: "W Lord Howe 30-minute fold Return", zone: "Australia/Lord_Howe", events: [event(6, "01:45", "return"), event(6, "03:00", "release")], query: "2025-04-05T15:00:00Z", start: "2025-04-05T14:45:00Z", end: "2025-04-05T16:30:00Z" },
  { name: "W Lord Howe 30-minute fold Release", zone: "Australia/Lord_Howe", events: [event(6, "01:00", "return"), event(6, "01:45", "release")], query: "2025-04-05T15:00:00Z", start: "2025-04-05T14:00:00Z", end: "2025-04-05T15:15:00Z" }
];
for (const fixture of dstFixtures) test(fixture.name, () => {
  const result = at(fixture.query, [publication({ timezone_snapshot: fixture.zone, events: fixture.events })]);
  assert.equal(onlyState(result), "RESTRICTED");
  assert.deepEqual(bounds(result), [[fixture.start, fixture.end]]);
  assert.equal(result.windows[0].provenance[0].return?.disambiguation, "earlier");
  assert.equal(result.windows[0].provenance[0].release?.disambiguation, "later");
  assert.equal(onlyState(at(fixture.end, [publication({ timezone_snapshot: fixture.zone, events: fixture.events })])), "ALLOWED");
});
test("X invalid timezone is INVALID", () => {
  assert.equal(onlyState(at("2025-01-06T22:00:00Z", [publication({ timezone_snapshot: "Not/A_Zone" })])), "INVALID");
});
test("Y stable window identity across replay, query size, event and scope ordering", () => {
  const request = input(); const before = structuredClone(request);
  const first = resolveSchedule(request);
  assert.deepEqual(request, before);
  assert.deepEqual(resolveSchedule(request), first);
  request.query = { start: "2025-01-06T23:00:00Z", end: "2025-01-07T06:00:00Z" };
  request.scopes[0].publications[0].events.reverse();
  assert.deepEqual(resolveSchedule(request).windows, first.windows);
  request.subject_id = "student-b";
  request.assignments[0].subject_id = "student-b";
  assert.notEqual(resolveSchedule(request).windows[0].restricted_window_id, first.windows[0].restricted_window_id);
});
test("Z resolver has no I/O, custody transition, event, notice, incident or UI path", () => {
  const src = readFileSync(new URL("../lib/schedules/resolver.ts", import.meta.url), "utf8");
  assert.deepEqual([...src.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]), ["node:crypto", "@js-temporal/polyfill"]);
  // Hash.update is an in-memory SHA-256 operation, not a database update.
  assert.doesNotMatch(src.replace('createHash("sha256").update(', "hash("), /\.rpc\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|fetch\(|transition_residence_device_custody|device_custody_|createClient|incidents/);
});
test("unknown historical assignment cannot use today's residence or school fallback", () => {
  assert.equal(onlyState(resolveSchedule(input([scope()], { assignments: [] }))), "UNCONFIGURED");
  const request = input(); request.assignments[0].start = "2025-01-07T00:00:00Z";
  assert.equal(onlyState(resolveSchedule(request)), "UNCONFIGURED");
  request.assignments[0].dorm_id = "r1"; request.query = { instant: "2025-01-07T01:00:00Z" };
  assert.equal(onlyState(resolveSchedule(request)), "UNCONFIGURED");
});
test("assignment change clips/reselects and retains both as-of snapshots", () => {
  const request = input([scope(), scope([publication({ id: "res", dorm_id: "r1", events: [event(0, "23:00", "return"), event(1, "09:00", "release")] })], "r1")]);
  request.assignments[0].end = "2025-01-07T00:00:00Z";
  request.assignments.push({ ...request.assignments[0], id: "asof-b", evidence: "move-evidence", dorm_id: "r1", start: "2025-01-07T00:00:00Z", end: "2028-01-01T00:00:00Z" });
  const result = resolveSchedule(request);
  assert.deepEqual(bounds(result), [["2025-01-06T21:00:00Z", "2025-01-07T09:00:00Z"]]);
  assert.deepEqual(result.windows[0].provenance.map((p) => p.assignment.id), ["asof-a", "asof-b"]);
});
test("assignment evidence gaps split canonical windows", () => {
  const request = input(); request.assignments[0].end = "2025-01-07T00:00:00Z";
  request.assignments.push({ ...request.assignments[0], id: "later", start: "2025-01-07T01:00:00Z", end: "2028-01-01T00:00:00Z" });
  request.query = { start: "2025-01-06T22:00:00Z", end: "2025-01-07T06:00:00Z" };
  assert.deepEqual(bounds(resolveSchedule(request)), [["2025-01-06T21:00:00Z", "2025-01-07T00:00:00Z"], ["2025-01-07T01:00:00Z", "2025-01-07T07:00:00Z"]]);
});
test("replacement/cancellation and revision replay restore predecessor interpretation", () => {
  const p2 = publication({ id: "p2", scope_revision: "2", predecessor_publication_id: "p1", effective_from: "2025-01-07" });
  const p3 = publication({ id: "p3", scope_revision: "3", predecessor_publication_id: "p1", replaces_publication_id: "p2", effective_from: "2025-01-08" });
  const s = scope([publication(), p2, p3]);
  assert.deepEqual(bounds(resolveSchedule(input([s]))), [["2025-01-06T21:00:00Z", "2025-01-07T07:00:00Z"]]);
  s.revision = "4"; s.ledger.push({ id: "cancel", school_id: school, dorm_id: null, scope_revision: "4", operation: "cancel", publication_id: null, predecessor_publication_id: "p1", replaced_publication_id: "p3", cutover_date: "2025-01-08" });
  const result = resolveSchedule(input([s]));
  assert.equal(onlyState(result), "RESTRICTED");
  assert.equal(result.windows[0].provenance[0].effective_end, null);
  assert.deepEqual(bounds(resolveSchedule(input([scope([publication(), p2])]))), [["2025-01-06T21:00:00Z", "2025-01-07T07:00:00Z"]]);
});
test("DST overlapping windows are unioned with both local event pairs", () => {
  const p = publication({ timezone_snapshot: "America/New_York", events: [event(6, "00:30", "return"), event(6, "01:15", "release"), event(6, "01:45", "return"), event(6, "03:00", "release")] });
  const result = at("2025-11-02T06:00:00Z", [p]);
  assert.deepEqual(bounds(result), [["2025-11-02T04:30:00Z", "2025-11-02T08:00:00Z"]]);
  assert.equal(result.windows[0].provenance.length, 2);
});
test("invalid rings, duplicate local times and inactive selected publication fail closed", () => {
  const variants = [publication({ is_active: false }), publication({ events: [event(0, "09:00", "return"), event(0, "10:00", "return")] }), publication({ events: [event(0, "09:00", "return"), event(0, "09:00", "release")] }), publication({ events: [event(7, "09:00", "return"), event(0, "10:00", "release")] })];
  for (const p of variants) assert.equal(onlyState(at("2025-01-06T22:00:00Z", [p])), "INVALID");
});
test("tampered/incomplete authoritative snapshots and cross-tenant inputs fail closed", () => {
  const variants: ScopeSnapshot[] = [];
  const missing = scope(); missing.ledger = []; variants.push(missing);
  const badRevision = scope(); badRevision.revision = "2"; variants.push(badRevision);
  const badPub = scope(); badPub.publications[0].school_id = "other"; variants.push(badPub);
  const badPred = scope(); badPred.publications[0].predecessor_publication_id = "fake"; variants.push(badPred);
  const unledgered = scope(); unledgered.publications.push(publication({ id: "extra" })); variants.push(unledgered);
  const badZone = scope(); badZone.publications[0].timezone_snapshot = "Not/A_Zone"; variants.push(badZone);
  for (const s of variants) assert.equal(onlyState(resolveSchedule(input([s]))), "INVALID");
  const request = input(); request.assignments[0].school_id = "other";
  assert.equal(onlyState(resolveSchedule(request)), "INVALID");
});
test("replay rejects a changed tzdata/resolver version", () => {
  const request = input(); request.expected_versions = { ...scheduleResolverVersions(), tzdata: "different" };
  const result = resolveSchedule(request);
  assert.equal(onlyState(result), "INVALID");
  assert.equal(result.segments[0].reason, "resolver_runtime_version_mismatch");
});
test("query endpoints and overlapping assignment evidence are validated", () => {
  for (const query of [{ instant: "2025-01-06T22:00:00" }, { instant: "2025-01-06T22:00:00.000001Z" }, { start: "2025-01-07T00:00:00Z", end: "2025-01-06T00:00:00Z" }]) {
    assert.equal(onlyState(resolveSchedule(input([scope()], { query }))), "INVALID");
  }
  const request = input(); request.assignments.push({ ...request.assignments[0], id: "overlap" });
  assert.equal(onlyState(resolveSchedule(request)), "INVALID");
});
test("publication timezone snapshot is used separately on either side of cutover", () => {
  const p1 = publication({ timezone_snapshot: "America/New_York", events: [event(0, "21:00", "return"), event(1, "07:00", "release")] });
  const p2 = publication({ id: "p2", scope_revision: "2", predecessor_publication_id: "p1", effective_from: "2025-01-07", timezone_snapshot: "America/Chicago", events: [event(0, "21:00", "return"), event(1, "08:00", "release")] });
  const result = at("2025-01-07T05:00:00Z", [p1, p2]);
  assert.deepEqual(bounds(result), [["2025-01-07T02:00:00Z", "2025-01-07T14:00:00Z"]]);
  assert.deepEqual(result.windows[0].provenance.map((p) => [p.timezone_snapshot, p.start, p.end]), [
    ["America/New_York", "2025-01-07T02:00:00Z", "2025-01-07T06:00:00Z"],
    ["America/Chicago", "2025-01-07T06:00:00Z", "2025-01-07T14:00:00Z"]
  ]);
});

test("assignment evidence belongs to the requested subject", () => {
  const request = input(); request.assignments[0].subject_id = "other-student";
  assert.equal(onlyState(resolveSchedule(request)), "INVALID");
});
test("skipped civil policy date and offset-only timezone are invalid", () => {
  const request = input([scope([publication({ timezone_snapshot: "Pacific/Apia", effective_from: "2011-12-30" })])]);
  request.assignments[0].start = "2011-01-01T00:00:00Z";
  request.query = { instant: "2011-12-31T00:00:00Z" };
  assert.equal(onlyState(resolveSchedule(request)), "INVALID");
  assert.equal(onlyState(at("2025-01-06T22:00:00Z", [publication({ timezone_snapshot: "+05:30" })])), "INVALID");
});
test("scope and ledger input ordering does not change output", () => {
  const p2 = publication({ id: "p2", scope_revision: "2", predecessor_publication_id: "p1", effective_from: "2025-02-01" });
  const request = input([scope([publication(), p2]), scope([], "r1")]);
  request.assignments[0].dorm_id = "r1";
  const result = resolveSchedule(request);
  request.scopes[0].ledger.reverse(); request.scopes[0].publications.reverse(); request.scopes.reverse();
  assert.deepEqual(resolveSchedule(request), result);
});
test("distant future successor does not rename an unchanged historical window", () => {
  const old = resolveSchedule(input());
  const p2 = publication({ id: "p2", scope_revision: "2", predecessor_publication_id: "p1", effective_from: "2025-02-01" });
  const newer = resolveSchedule(input([scope([publication(), p2])]));
  assert.equal(newer.windows[0].restricted_window_id, old.windows[0].restricted_window_id);
});
test("a continuous cutover chain expands beyond the initial query padding", () => {
  const start = new Date("2025-01-06T00:00:00Z");
  const policies: Publication[] = [];
  // Every new daily version enters its restricted part at midnight and would
  // release two days later. Daily successors therefore form one long window.
  for (let i = 0; i < 45; i++) {
    const from = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    const weekday = i % 7;
    policies.push(publication({ id: `chain-${i}`, policy_id: `policy-chain-${i}`, scope_revision: String(i + 1),
      effective_from: from, predecessor_publication_id: i ? `chain-${i - 1}` : null,
      events: [event((weekday + 6) % 7, "21:00", "return"), event((weekday + 2) % 7, "07:00", "release")] }));
  }
  const request = input([scope(policies)], { query: { instant: "2025-01-25T12:00:00Z" } });
  const result = resolveSchedule(request);
  assert.equal(onlyState(result), "RESTRICTED");
  assert.deepEqual(bounds(result), [["2025-01-06T00:00:00Z", "2025-02-21T07:00:00Z"]]);
  assert.equal(result.windows[0].provenance.length, 45);
  request.query = { instant: "2025-02-05T12:00:00Z" };
  assert.deepEqual(resolveSchedule(request).windows, result.windows);
});
test("runtime provenance matches the exact pinned Temporal dependency", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies["@js-temporal/polyfill"], "0.5.1");
  assert.equal(lock.packages["node_modules/@js-temporal/polyfill"].version, "0.5.1");
  assert.equal(scheduleResolverVersions().temporal, "@js-temporal/polyfill@0.5.1");
});
