import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Rapid Scan route uses the authenticated device workflow and RLS reader", async () => {
  const page = await read("../app/app/rapid-scan/page.tsx");
  const data = await read("../lib/devices/data.ts");

  assert.match(page, /requireDeviceWorkflowContext\(\)/);
  assert.match(page, /listRapidScanStudents\(context\)/);
  assert.match(data, /\.from\("students"\)/);
  assert.match(data, /\.eq\("school_id", context\.currentSchool\.id\)/);
  assert.match(data, /\.eq\("status", "active"\)/);
  assert.match(data, /listDevices\(context\)/);
  assert.doesNotMatch(data, /service_role/);
});

test("student-centric search supports student identity and device fallback", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");

  for (const field of ["firstName", "lastName", "studentNumber", "device.id", "device.qrToken", "device.assetTag", "device.serialNumber"]) {
    assert.match(workstation, new RegExp(field.replace(".", "\\.")));
  }
  assert.match(workstation, /devicePassLookup/);
  assert.match(workstation, /setSelectedStudentId\(student\.id\)/);
  assert.match(workstation, /selectedStudent\.devices\.map/);
  assert.match(workstation, /No matching student is available in your access scope/);
});

test("Rapid Scan exposes only explicit per-device release and return modes", async () => {
  const [workstation, actions] = await Promise.all([
    read("../app/app/rapid-scan/rapid-scan-workstation.tsx"),
    read("../lib/devices/actions.ts")
  ]);

  assert.match(workstation, /Morning Release/);
  assert.match(workstation, /Evening Return/);
  assert.match(workstation, /mode === "release"[\s\S]*"returned"/);
  assert.match(workstation, /mode === "return"[\s\S]*"checked_out"/);
  assert.doesNotMatch(workstation, /Release All|Return All|BarcodeDetector|getUserMedia/);
  assert.match(actions, /rapidScanTransitionAction/);
  assert.match(actions, /operation !== "release" && operation !== "return"/);
  assert.match(actions, /method: "manual"/);
});

test("Rapid Scan action reuses the atomic RPC wrapper and returns safe outcomes", async () => {
  const actions = await read("../lib/devices/actions.ts");
  const start = actions.indexOf("export async function rapidScanTransitionAction");
  const end = actions.indexOf("export async function transitionDeviceLifecycleAction", start);
  const rapidAction = actions.slice(start, end);

  assert.match(rapidAction, /requireDeviceWorkflowContext\(\)/);
  assert.match(rapidAction, /transitionCustodyWithRpc/);
  assert.match(rapidAction, /status: "applied"/);
  assert.match(rapidAction, /status: "stale_status"/);
  assert.match(rapidAction, /status: "unavailable"/);
  assert.match(rapidAction, /Already processed or status changed/);
  assert.doesNotMatch(rapidAction, /\.from\("device_custody_(?:devices|events)"\)/);
  assert.doesNotMatch(rapidAction, /not_authorized|not_available/);
});

test("workstation blocks duplicate submission and keeps lost or inactive devices non-actionable", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");

  assert.match(workstation, /if \(!mode \|\| isPending \|\| pendingDeviceId\) return/);
  assert.match(workstation, /disabled=\{isPending \|\| pendingDeviceId !== null\}/);
  assert.match(workstation, /device\.status === requiredStatus/);
  assert.match(workstation, /Not eligible in this mode/);
  assert.match(workstation, /Next Student/);
  assert.match(workstation, /sessionStorage/);
});

test("navigation uses the existing device-workflow role matrix", async () => {
  const layout = await read("../app/app/layout.tsx");
  assert.match(layout, /canUseDeviceWorkflows[\s\S]*href="\/app\/rapid-scan"[\s\S]*Rapid Scan/);
});
