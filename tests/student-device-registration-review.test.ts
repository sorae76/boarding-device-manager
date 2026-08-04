import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { normalizeReviewNote, registrationReviewError, validateRegistrationRequestId } from "../lib/devices/registration-review.ts";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("review input validation trims notes and enforces requirements", () => {
  assert.equal(validateRegistrationRequestId("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(validateRegistrationRequestId("not-a-uuid"), null);
  assert.deepEqual(normalizeReviewNote("   ", false), { error: null, note: null });
  assert.equal(normalizeReviewNote("   ", true).error, "A rejection note is required.");
  assert.deepEqual(normalizeReviewNote("  reviewed  ", true), { error: null, note: "reviewed" });
  assert.equal(normalizeReviewNote("x".repeat(1001), false).error, "Review note must be 1000 characters or fewer.");
});

test("review database errors map to safe messages without raw details", () => {
  assert.equal(registrationReviewError("registration_review_already_rejected"), "This registration request has already been rejected.");
  assert.equal(registrationReviewError("registration_review_already_approved"), "This registration request has already been approved.");
  assert.equal(registrationReviewError("registration_review_not_available tenant secret"), "This registration request is no longer available in your access scope.");
  assert.equal(registrationReviewError("23505 constraint private_name"), "A device with this serial number is already registered.");
  assert.equal(registrationReviewError("SQL select * from secret"), "The registration request could not be processed.");
});

test("Phase 1B migration provides atomic, scoped review RPCs", async () => {
  const sql = await read("../supabase/migrations/20260804000000_add_student_device_registration_review.sql");
  const approve = sql.slice(sql.indexOf("create or replace function public.approve_"), sql.indexOf("create or replace function public.reject_"));
  const reject = sql.slice(sql.indexOf("create or replace function public.reject_"));
  assert.match(sql, /create unique index device_custody_devices_school_normalized_serial_unique[\s\S]*lower\(btrim\(serial_number\)\)[\s\S]*serial_number is not null/);
  assert.match(approve, /for update/); assert.match(reject, /for update/);
  assert.match(approve, /pg_advisory_xact_lock/); assert.match(approve, /insert into public\.device_custody_devices/);
  assert.doesNotMatch(approve, /qr_token/); assert.match(approve, /normalized_serial, 'checked_out'/);
  assert.match(approve, /approved_device_id = new_device_id/); assert.match(approve, /registration\.status = 'approved'/);
  assert.match(approve, /registration\.status = 'rejected'/); assert.match(reject, /normalized_note is null/);
  assert.match(reject, /registration\.status = 'approved'/); assert.doesNotMatch(reject, /insert into public\.device_custody/);
  assert.doesNotMatch(reject, /device_custody_events/); assert.doesNotMatch(sql, /'dorm_supervisor'/);
  assert.match(sql, /dorm_staff_membership\.role = 'dorm_staff'/); assert.match(sql, /s\.status = 'active'/);
  assert.match(sql, /residence\.is_active = true/); assert.match(sql, /public\.has_dorm_access\(target_school_id, residence\.id\)/);
  assert.equal((sql.match(/security definer/g) ?? []).length, 4); assert.equal((sql.match(/set search_path = public, pg_temp/g) ?? []).length, 4);
  assert.equal((sql.match(/from public;/g) ?? []).length, 4); assert.equal((sql.match(/from anon;/g) ?? []).length, 4);
  assert.match(sql, /revoke all on function public\.can_review_student_device_registration\(uuid, uuid\) from authenticated;/);
  assert.doesNotMatch(sql, /grant execute on function public\.can_review_student_device_registration\(uuid, uuid\) to authenticated;/);
  for (const rpc of [
    "get_student_device_registration_request_for_staff",
    "approve_student_device_registration_request",
    "reject_student_device_registration_request"
  ]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\(uuid, uuid(?:, text)?\\) to authenticated;`));
  }
});

test("review UI and actions keep ownership server-side", async () => {
  const list = await read("../app/app/devices/registrations/page.tsx");
  const detail = await read("../app/app/devices/registrations/[requestId]/page.tsx");
  const forms = await read("../app/app/devices/registrations/[requestId]/review-forms.tsx");
  const actions = await read("../lib/devices/registration-review-actions.ts");
  const student = await read("../app/student/page.tsx");
  assert.equal((list.match(/>Review</g) ?? []).length, 2);
  assert.match(detail, /request\.status === "pending"/); assert.match(forms, /Approval note \(optional\)/);
  assert.match(forms, /name="reviewNote"[\s\S]*?required/); assert.match(forms, /useFormStatus/);
  assert.match(student, /bg-emerald-50/); assert.match(student, /bg-red-50/); assert.match(student, /request\.review_note/);
  for (const field of ["schoolId", "studentId", "reviewerId", "deviceId"]) assert.equal(actions.includes(`formData.get("${field}")`), false);
  assert.match(actions, /context\.currentSchool\.id/);
  assert.doesNotMatch(actions, /registrations\?reviewed=rejected/);
  assert.match(actions, /redirect\(`\/app\/devices\/registrations\/\$\{requestId\}`\)/);
});
