import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
// @ts-expect-error Native Node test runner requires the source extension.
import * as authoring from "../lib/schedules/authoring.ts";
import type { AuthoringSnapshot, ScheduleDraft } from "../lib/schedules/authoring-types";

const school = "10000000-0000-0000-0000-000000000001";
const draft: ScheduleDraft = { dorm_id: null, name: "Test", effective_from: "2030-01-07", effective_to: null,
  expected_revision: "0", predecessor_id: null, replaces_id: null, idempotency_key: "20000000-0000-0000-0000-000000000001",
  events: [{ weekday: 0, local_time: "21:00", event_type: "return" }, { weekday: 1, local_time: "07:00", event_type: "release" }] };
const data = (): AuthoringSnapshot & { request_exists: boolean } => ({ school_id: school, timezone: "UTC", today: "2030-01-01", observed_at: "2030-01-01T12:00:00Z",
  can_manage_school: true, residences: [], exceptions: [], intervals: [], request_exists: false,
  scopes: [{ school_id: school, dorm_id: null, revision: "0", publications: [], ledger: [] }] });
const compiled = ts.transpileModule(readFileSync(new URL("../lib/schedules/actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
function harness(role = "school_admin", snapshot = data(), outcome = "published") {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const exports: Record<string, (...args: any[]) => Promise<any>> = {}; // Isolated real action module with injected transport/session.
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath() {} },
    "@/lib/schedules/access": { async requireScheduleContext() { return { effectiveRole: role, currentSchool: { id: school } }; } },
    "@/lib/schedules/authoring": authoring,
    "@/lib/supabase/server": { createClient() { return { async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args }); return { error: null, data: name === "read_device_schedule_authoring" ? snapshot : [{ outcome }] };
    } }; } }
  };
  new Function("require", "exports", compiled)((name: string) => { assert.ok(name in dependencies); return dependencies[name]; }, exports);
  return { actions: exports, calls };
}
test("G1-C real server actions deny unauthorized roles before any RPC", async () => {
  for (const role of ["student", "parent", "viewer", "dorm_staff", "user"]) {
    const { actions, calls } = harness(role);
    for (const [name, args] of [["loadScheduleAuthoring", []], ["previewSchedule", [draft]], ["publishSchedule", [draft, "forged"]],
      ["cancelSchedule", [null, "id", "0", "key"]], ["createAllowException", [{}]], ["revokeAllowException", ["id", "reason"]], ["searchExceptionTargets", ["student", "Test"]]] as const) {
      assert.equal((await actions[name](...args)).ok, false);
    }
    assert.equal(calls.length, 0);
  }
});
test("G1-C publish revalidates preview and binds school/revision/key to approved RPC", async () => {
  const { actions, calls } = harness();
  assert.equal((await actions.publishSchedule(draft, "forged", "UTC")).ok, false);
  assert.equal(calls.filter((c) => c.name === "publish_device_schedule").length, 0);
  const preview = await actions.previewSchedule(draft); assert.equal(preview.ok, true);
  const result = await actions.publishSchedule({ ...draft, school_id: "attacker" }, preview.value.fingerprint, preview.value.timezone);
  // Extra payload fields invalidate the preview hash; no forged tenant write.
  assert.equal(result.ok, false);
  assert.equal((await actions.publishSchedule(draft, preview.value.fingerprint, preview.value.timezone)).ok, true);
  const rpc = calls.find((c) => c.name === "publish_device_schedule")!;
  assert.equal(rpc.args.target_school_id, school); assert.equal(rpc.args.target_expected_scope_revision, "0");
  assert.equal(rpc.args.target_idempotency_key, draft.idempotency_key); assert.deepEqual(rpc.args.target_events, draft.events);
  assert.equal(rpc.args.target_expected_timezone, "UTC");
});
test("G1-C lost publication response reaches G1-A replay despite changed date/revision; conflicts remain failures", async () => {
  const snapshot = data(); snapshot.today = "2031-01-01"; snapshot.timezone = "America/New_York"; snapshot.request_exists = true;
  const { actions, calls } = harness("school_admin", snapshot);
  assert.equal((await actions.publishSchedule(draft, "old-preview", "UTC")).ok, true);
  assert.ok(calls.some((c) => c.name === "publish_device_schedule"));
  assert.equal(calls.find((c) => c.name === "publish_device_schedule")!.args.target_expected_timezone, "UTC");
  assert.equal((await harness("school_admin", snapshot, "idempotency_conflict").actions.publishSchedule(draft, "old-preview", "UTC")).ok, false);
});

test("G1-C publish rejects missing/changed preview timezone and propagates atomic DB timezone conflicts", async () => {
  const { actions, calls } = harness();
  const preview = await actions.previewSchedule(draft);
  assert.equal(preview.value.timezone, "UTC");
  assert.equal((await actions.publishSchedule(draft, preview.value.fingerprint)).ok, false);
  assert.equal((await actions.publishSchedule(draft, preview.value.fingerprint, "America/New_York")).ok, false);
  assert.equal(calls.filter((c) => c.name === "publish_device_schedule").length, 0);
  const raced = harness("school_admin", data(), "stale_timezone");
  const result = await raced.actions.publishSchedule(draft, preview.value.fingerprint, "UTC");
  assert.equal(result.ok, false);
  assert.match(result.message, /stale_timezone.*Reload and preview/);
  assert.equal(raced.calls.find((c) => c.name === "publish_device_schedule")!.args.target_expected_timezone, "UTC");
});
test("G1-C exception actions require UTC and send exactly one target, authenticated school and no supplied actor", async () => {
  for (const kind of ["device", "student", "residence"] as const) {
    const { actions, calls } = harness();
    const input = { kind, target: "target", start: "2030-01-07T22:00:00Z", end: "2030-01-08T01:00:00Z", reason: "Allowed", key: "key" };
    assert.equal((await actions.createAllowException({ ...input, start: "2030-01-07T22:00" })).ok, false);
    assert.equal(calls.length, 0);
    assert.equal((await actions.createAllowException(input)).ok, true);
    const args = calls[0].args;
    assert.equal(args.target_school_id, school);
    assert.equal([args.target_device_id, args.target_student_id, args.target_dorm_id].filter(Boolean).length, 1);
    assert.ok(!("actor" in args));
  }
});
