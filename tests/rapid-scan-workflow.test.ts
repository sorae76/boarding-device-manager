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
  assert.doesNotMatch(workstation, /Release All|Return All/);
  assert.match(actions, /rapidScanTransitionAction/);
  assert.match(actions, /operation !== "release" && operation !== "return"/);
  assert.match(actions, /method: "manual"/);
});

test("Rapid Scan camera uses the local QR camera foundation and cleans it up safely", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");

  assert.match(workstation, /BarcodeDetector/);
  assert.match(workstation, /formats: \["qr_code"\]/);
  assert.match(workstation, /getSupportedFormats/);
  assert.match(workstation, /includes\("qr_code"\)/);
  assert.match(workstation, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(workstation, /video: \{ facingMode: "environment" \}/);
  assert.match(workstation, /audio: false/);
  assert.match(workstation, /playsInline/);
  assert.match(workstation, /requestAnimationFrame\(scan\)/);
  assert.match(workstation, /cancelAnimationFrame\(animationFrame\)/);
  assert.match(workstation, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(workstation, /canvas = null/);
});

test("camera decoding uses ready throttled frames and software fallback without overlapping", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");

  assert.match(workstation, /import jsQR from "jsqr"/);
  assert.match(workstation, /readyState >= HTMLMediaElement\.HAVE_CURRENT_DATA/);
  assert.match(workstation, /video\.videoWidth > 0/);
  assert.match(workstation, /video\.videoHeight > 0/);
  assert.match(workstation, /decodeIntervalMs = 250/);
  assert.match(workstation, /timestamp - lastDecodeAt < decodeIntervalMs/);
  assert.match(workstation, /decodeInFlight/);
  assert.match(workstation, /maximumDecodeDimension = 960/);
  assert.match(workstation, /document\.createElement\("canvas"\)/);
  assert.match(workstation, /context\.drawImage\(video/);
  assert.match(workstation, /context\.getImageData/);
  assert.match(workstation, /jsQR\(imageData\.data, width, height/);
});

test("native empty results and exceptions switch to the same software path", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");
  const cameraStart = workstation.indexOf("async function startCamera");
  const cameraEnd = workstation.indexOf("}, [scanning]);", cameraStart);
  const camera = workstation.slice(cameraStart, cameraEnd);

  assert.match(workstation, /nativeDetectTimeoutMs = 750/);
  assert.match(camera, /runBoundedNativeQrAttempt\(/);
  assert.match(camera, /detector\.detect\(video\)\.then/);
  assert.match(camera, /nativeDetectTimeoutMs/);
  assert.match(camera, /nativeOutcome\.status === "decoded"[\s\S]*handleDecodedValue\(decodedValue\)/);
  assert.match(camera, /nativeOutcome\.status === "empty"[\s\S]*consecutiveNativeEmptyResults \+= 1/);
  assert.match(camera, /consecutiveNativeEmptyResults \+= 1/);
  assert.match(camera, /requiresSoftwareQrFallback\(\{[\s\S]*consecutiveNativeEmptyResults/);
  assert.match(camera, /else \{[\s\S]*useSoftwareFallback = true/);
  assert.match(camera, /if \(useSoftwareFallback\)[\s\S]*else if \(detector\)/);
  assert.match(camera, /if \(!cancelled\) animationFrame = window\.requestAnimationFrame\(scan\)/);
  assert.doesNotMatch(camera, /requestSubmit|scanReturnDeviceAction|rapidScanTransitionAction|runTransition/);
});

test("camera scan start is gated until an explicit operating mode is selected", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");
  const scanControlStart = workstation.indexOf("Camera QR fallback");
  const scanControlEnd = workstation.indexOf("<form", scanControlStart);
  const scanControl = workstation.slice(scanControlStart, scanControlEnd);

  assert.match(scanControl, /disabled=\{!mode\}/);
  assert.match(scanControl, /if \(!mode\) return;[\s\S]*setScanning\(\(current\) => !current\)/);
  assert.match(scanControl, /Select Morning Release or Evening Return before starting the camera/);
  assert.match(workstation, /onClick=\{\(\) => chooseMode\(value\)\}/);
  assert.match(workstation, /onClick=\{\(\) => runTransition\(device\.id\)\}/);
  assert.match(workstation, /rapidScanTransitionAction\(\{ deviceId, operation: mode \}\)/);
});

test("camera QR resolution is device-only, exact, residence-filtered, and selects the owner", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");
  const resolverStart = workstation.indexOf("function resolveScannedDevice");
  const resolverEnd = workstation.indexOf("export function rapidScanStudentMatches", resolverStart);
  const resolver = workstation.slice(resolverStart, resolverEnd);

  assert.match(resolver, /devicePassLookup\(rawValue\)/);
  for (const field of ["device.id", "device.qrToken", "device.assetTag", "device.serialNumber"]) {
    assert.match(resolver, new RegExp(field.replace(".", "\\.")));
  }
  assert.match(resolver, /identifier === query/);
  assert.match(resolver, /matches\.length === 1/);
  assert.doesNotMatch(resolver, /firstName|lastName|studentNumber|includes\(/);
  assert.match(workstation, /resolveScannedDevice\(residenceStudentsRef\.current, parsedValue\)/);
  assert.match(workstation, /setSelectedStudentId\(match\.student\.id\)/);
  assert.match(workstation, /setScannedDeviceId\(match\.device\.id\)/);
  assert.match(workstation, /Scanned device — custody unchanged/);
});

test("camera scans update UI only and never enter the custody mutation path", async () => {
  const workstation = await read("../app/app/rapid-scan/rapid-scan-workstation.tsx");
  const cameraStart = workstation.indexOf("async function startCamera");
  const cameraEnd = workstation.indexOf("}, [scanning]);", cameraStart);
  const camera = workstation.slice(cameraStart, cameraEnd);

  assert.doesNotMatch(camera, /requestSubmit|scanReturnDeviceAction|rapidScanTransitionAction|runTransition/);
  assert.match(camera, /lastScanRef\.current/);
  assert.match(camera, /normalize\(parsedValue\) === normalize\(lastScanRef\.current\)\) return/);
  assert.match(camera, /setSearchMessage\(unavailableMessage\)/);
  assert.match(camera, /setSelectedStudentId\(null\)/);
  assert.match(workstation, /onClick=\{\(\) => runTransition\(device\.id\)\}/);
  assert.match(workstation, /rapidScanTransitionAction\(\{ deviceId, operation: mode \}\)/);
  assert.match(workstation, /mode === "release" \? "Release device" : "Return device"/);
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
