import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { compareScheduleEvents, formatScheduleLocalTime, isScheduleReaderRole } from "../lib/schedules/types.ts";

test("schedule reader role matrix is exact", () => {
  for (const role of ["super_admin", "school_admin", "dorm_supervisor", "dorm_staff", "viewer"] as const) assert.equal(isScheduleReaderRole(role), true, role);
  for (const role of ["parent", "student"] as const) assert.equal(isScheduleReaderRole(role), false, role);
});

test("weekly events order by weekday, local time, then type", () => {
  const events = [
    { weekday: 1, local_time: "08:00:00", event_type: "return" },
    { weekday: 0, local_time: "18:00:00", event_type: "return" },
    { weekday: 1, local_time: "08:00:00", event_type: "release" }
  ].map((event, index) => ({ ...event, id: String(index), school_id: "school-a", policy_id: "policy-a" })) as Parameters<typeof compareScheduleEvents>[0][];
  events.sort(compareScheduleEvents);
  assert.deepEqual(events.map(({ weekday, local_time, event_type }) => [weekday, local_time, event_type]), [
    [0, "18:00:00", "return"], [1, "08:00:00", "release"], [1, "08:00:00", "return"]
  ]);
});

test("local wall-clock times format without timezone conversion", () => {
  assert.equal(formatScheduleLocalTime("00:05:00"), "12:05 AM");
  assert.equal(formatScheduleLocalTime("12:30:00"), "12:30 PM");
  assert.equal(formatScheduleLocalTime("18:45:00"), "6:45 PM");
});

test("data access is authenticated, read-only, and explicitly school scoped", () => {
  const source = readFileSync(new URL("../lib/schedules/data.ts", import.meta.url), "utf8");
  assert.match(source, /createClient\(\)/);
  assert.equal((source.match(/\.eq\("school_id", schoolId\)/g) ?? []).length, 3);
  assert.match(source, /visiblePolicyIds\.has\(event\.policy_id\)/);
  assert.doesNotMatch(source, /service[_-]?role|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i);
});

test("route and settings entry use the shared authorization gate", () => {
  const route = readFileSync(new URL("../app/app/settings/schedules/page.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../app/app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(route, /requireScheduleContext\(\)/);
  assert.match(settings, /canReadSchedules\(context\)/);
  assert.match(settings, /href="\/app\/settings\/schedules"/);
});

test("presentation separates scopes and displays safe empty states", () => {
  const source = readFileSync(new URL("../app/app/settings/schedules/schedule-management.tsx", import.meta.url), "utf8");
  assert.match(source, /School-wide schedules/);
  assert.match(source, /Residence schedules/);
  assert.match(source, /No school-wide schedule policies are available/);
  assert.match(source, /No residence schedule policies are available/);
  assert.doesNotMatch(source, /school_id|dorm_id|policy_id/);
});
