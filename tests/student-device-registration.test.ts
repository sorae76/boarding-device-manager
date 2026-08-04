import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { studentDeviceRegistrationError, validateStudentDeviceRegistrationInput } from "../lib/students/device-registration.ts";
// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { runStudentPortalFlow } from "../lib/students/portal-flow.ts";
// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { formatDateInTimeZone, formatDateTimeInTimeZone } from "../lib/devices/format.ts";

const validInput = {
  deviceType: "laptop",
  manufacturer: " Dell ",
  model: " Latitude 7450 ",
  color: " Silver ",
  serialNumber: " ABC-123 ",
  studentNote: " Personal charger included "
};

test("student registration trims every submitted text field", () => {
  const result = validateStudentDeviceRegistrationInput(validInput);
  assert.deepEqual(result.input, {
    deviceType: "laptop", manufacturer: "Dell", model: "Latitude 7450",
    color: "Silver", serialNumber: "ABC-123", studentNote: "Personal charger included"
  });
});

test("student registration requires serial number and validates device type", () => {
  assert.equal(validateStudentDeviceRegistrationInput({ ...validInput, serialNumber: "  " }).error, "Serial number is required.");
  assert.equal(validateStudentDeviceRegistrationInput({ ...validInput, deviceType: "printer" }).error, "Choose a valid device type.");
});

test("student registration enforces field maximum lengths", () => {
  assert.equal(validateStudentDeviceRegistrationInput({ ...validInput, manufacturer: "x".repeat(101) }).error, "Manufacturer must be 100 characters or fewer.");
  assert.equal(validateStudentDeviceRegistrationInput({ ...validInput, serialNumber: "x".repeat(201) }).error, "Serial number must be 200 characters or fewer.");
  assert.equal(validateStudentDeviceRegistrationInput({ ...validInput, studentNote: "x".repeat(1001) }).error, "Student note must be 1000 characters or fewer.");
});

test("registration timestamps use the explicit school timezone", () => {
  const submittedAt = "2026-08-03T22:47:00.000Z";
  const nearMidnightUtc = "2026-08-04T02:47:00.000Z";

  assert.doesNotThrow(() => formatDateInTimeZone("not-a-date", "America/New_York"));
  assert.doesNotThrow(() => formatDateTimeInTimeZone("not-a-date", "America/New_York"));
  assert.equal(formatDateInTimeZone("not-a-date", "America/New_York"), "Unknown");
  assert.equal(formatDateTimeInTimeZone("not-a-date", "America/New_York"), "Unknown");
  assert.equal(formatDateTimeInTimeZone(submittedAt, "America/New_York"), "Aug 3, 2026, 6:47 PM");
  assert.equal(formatDateInTimeZone(nearMidnightUtc, "America/New_York"), "8/3/2026");
  assert.equal(formatDateInTimeZone(nearMidnightUtc, "UTC"), "8/4/2026");
});

test("duplicate database details map to one safe message", () => {
  const safe = "A device with that serial number is already registered or awaiting verification.";
  assert.equal(studentDeviceRegistrationError("student_registration_duplicate"), safe);
  assert.equal(studentDeviceRegistrationError("23505 unique violation"), safe);
  assert.equal(studentDeviceRegistrationError("constraint school secret"), "The registration request could not be submitted.");
});

test("student portal flow loads verified devices and registration requests separately", async () => {
  const calls: string[] = [];
  const result = await runStudentPortalFlow({
    async requireSession() { return { currentSchool: {}, effectiveRole: "student" }; },
    redirectNonStudent() { throw new Error("unexpected"); },
    redirectInvalidStudent() { throw new Error("unexpected"); },
    async rpc(name) {
      calls.push(name);
      if (name === "get_current_student_portal_profile") return { data: [{ student_id: "student" }], error: null };
      if (name === "list_current_student_portal_devices") return { data: [{ device_id: "verified" }], error: null };
      return { data: [{ request_id: "pending" }], error: null };
    }
  });
  assert.deepEqual(calls, ["get_current_student_portal_profile", "list_current_student_portal_devices", "list_current_student_device_registration_requests"]);
  assert.deepEqual(result.devices, [{ device_id: "verified" }]);
  assert.deepEqual(result.registrationRequests, [{ request_id: "pending" }]);
});

test("student form and action expose no client ownership fields", async () => {
  const form = await readFile(new URL("../app/student/devices/new/student-device-registration-form.tsx", import.meta.url), "utf8");
  const action = await readFile(new URL("../lib/students/device-registration-actions.ts", import.meta.url), "utf8");
  for (const forbidden of ["studentId", "student_id", "schoolId", "school_id"]) {
    assert.equal(form.includes(forbidden), false);
    assert.equal(action.includes(forbidden), false);
  }
});

test("migration keeps requests separate and enforces staff role and dorm scope", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260803000000_add_student_device_registration_requests.sql", import.meta.url), "utf8");
  const staffRpc = sql.slice(
    sql.indexOf("create or replace function public.list_student_device_registration_requests_for_staff"),
    sql.indexOf("revoke all on function public.list_student_device_registration_requests_for_staff")
  );
  assert.match(sql, /insert into public\.student_device_registration_requests/);
  assert.doesNotMatch(sql, /insert into public\.device_custody_devices/);
  assert.match(sql, /ausr\.role = 'school_admin'/);
  assert.match(sql, /ausr\.role = 'dorm_staff'/);
  assert.doesNotMatch(sql, /ausr\.role = 'dorm_supervisor'/);
  assert.match(sql, /and s\.dorm_id is not null/);
  assert.match(sql, /from public\.dorms active_dorm/);
  assert.match(sql, /active_dorm\.id = s\.dorm_id/);
  assert.match(sql, /active_dorm\.school_id = target_school_id/);
  assert.match(sql, /active_dorm\.is_active = true/);
  assert.match(sql, /public\.has_dorm_access\(target_school_id, active_dorm\.id\)/);
  assert.match(sql, /revoke all privileges on table public\.student_device_registration_requests from authenticated/);
  assert.match(staffRpc, /from public\.schools active_school/);
  assert.match(staffRpc, /active_school\.id = target_school_id/);
  assert.match(staffRpc, /active_school\.is_active = true/);
  assert.ok(
    staffRpc.indexOf("from public.schools active_school") <
      staffRpc.indexOf("ausr.role = 'school_admin'"),
    "active-school authorization must apply before the staff role branches"
  );
});

test("staff registrations page has separate mobile cards and desktop table", async () => {
  const page = await readFile(new URL("../app/app/devices/registrations/page.tsx", import.meta.url), "utf8");
  assert.match(page, /className="space-y-3 md:hidden" data-mobile-registration-cards/);
  assert.match(page, /className="hidden [^"]*md:block"\s+data-desktop-registration-table/);
  assert.doesNotMatch(page, /min-w-\[1050px\]/);
  assert.match(page, /break-all text-neutral-900/);
  assert.doesNotMatch(page, />\s*(Approve|Reject)\s*</i);
  assert.match(page, /formatDateTimeInTimeZone\(request\.submitted_at, schoolTimeZone\)/);
});

test("student registration form uses shared type-specific manufacturer options", async () => {
  const form = await readFile(new URL("../app/student/devices/new/student-device-registration-form.tsx", import.meta.url), "utf8");
  const portal = await readFile(new URL("../app/student/page.tsx", import.meta.url), "utf8");

  assert.match(form, /manufacturerOptionsByDeviceType/);
  assert.match(form, /name="manufacturer" type="hidden" value=\{manufacturer\}/);
  assert.match(form, /manufacturerPreset === "Other"/);
  assert.match(form, /Custom manufacturer/);
  assert.match(form, /setManufacturerPreset\(nextOptions\[0\] \?\? "Other"\)/);
  assert.match(form, /setCustomManufacturer\(""\)/);
  assert.doesNotMatch(form, /name="manufacturer" required/);
  assert.match(portal, /formatDateInTimeZone\(request\.submitted_at, school\.timezone\)/);
});
