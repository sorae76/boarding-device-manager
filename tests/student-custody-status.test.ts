import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { studentManagementCustodyStatus } from "../lib/students/custody-status.ts";

function counts(
  checkedOutDevices: number,
  returnedDevices: number,
  lostDevices: number,
  inactiveDevices: number
) {
  return {
    checkedOutDevices,
    returnedDevices,
    lostDevices,
    inactiveDevices,
    totalDevices: checkedOutDevices + returnedDevices + lostDevices + inactiveDevices
  };
}

test("zero devices produces No devices status", () => {
  assert.equal(studentManagementCustodyStatus(counts(0, 0, 0, 0)), "no_devices");
});

test("one checked-out device produces With student status", () => {
  assert.equal(studentManagementCustodyStatus(counts(1, 0, 0, 0)), "with_student");
});

test("one returned device produces Checked in status", () => {
  assert.equal(studentManagementCustodyStatus(counts(0, 1, 0, 0)), "checked_in");
});

test("checked-out and returned devices produce Mixed custody status", () => {
  assert.equal(studentManagementCustodyStatus(counts(1, 1, 0, 0)), "mixed_custody");
});

test("any lost device has highest priority", () => {
  assert.equal(studentManagementCustodyStatus(counts(1, 1, 1, 1)), "missing");
});

test("inactive-only devices produce Inactive status", () => {
  assert.equal(studentManagementCustodyStatus(counts(0, 0, 0, 2)), "inactive");
});

test("approved registration represented by a checked-out device never produces Pending", () => {
  assert.notEqual(studentManagementCustodyStatus(counts(1, 0, 0, 0)), "pending");
});

test("mobile and desktop Students badges share the new label mapping", () => {
  const source = readFileSync(
    new URL("../app/app/students/student-management.tsx", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /pending:\s*"Pending"/);
  for (const label of ["No devices", "Missing", "Mixed custody", "With student", "Checked in", "Inactive"]) {
    assert.match(source, new RegExp(`:\\s*"${label}"`));
  }
  assert.equal(source.match(/statusLabels\[student\.custodyStatus\]/g)?.length, 2);
});
