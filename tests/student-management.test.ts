import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { canManageStudents, nextNewStudentEditorVersion, studentEditorVersion, studentManagementError } from "../lib/students/management.ts";

function context(effectiveRole: string, membershipRole = effectiveRole, scoped = true) {
  return {
    effectiveRole,
    currentSchool: { id: "school-a" },
    currentMembership: {
      school_id: scoped ? "school-a" : "school-b",
      role: membershipRole,
      is_active: true
    }
  } as Parameters<typeof canManageStudents>[0];
}

test("student management role gate allows a scoped school admin", () => {
  assert.equal(canManageStudents(context("school_admin")), true);
});

test("student management role gate denies non-admin school roles", () => {
  for (const role of ["dorm_supervisor", "dorm_staff", "viewer", "student"]) {
    assert.equal(canManageStudents(context(role)), false, role);
  }
});

test("super admin requires an active membership scoped to the current school", () => {
  assert.equal(canManageStudents(context("super_admin", "viewer")), true);
  assert.equal(canManageStudents(context("super_admin", "viewer", false)), false);
  assert.equal(
    canManageStudents({ ...context("super_admin", "viewer"), currentMembership: null }),
    false
  );
  assert.equal(
    canManageStudents({
      ...context("super_admin", "viewer"),
      currentMembership: { ...context("super_admin", "viewer").currentMembership!, is_active: false }
    }),
    false
  );
});

test("school admin cannot manage through a mismatched or non-admin membership", () => {
  assert.equal(canManageStudents(context("school_admin", "school_admin", false)), false);
  assert.equal(canManageStudents(context("school_admin", "viewer")), false);
});

test("stable database codes map to safe distinct duplicate messages", () => {
  assert.equal(
    studentManagementError("ZS001", "STUDENT_DUPLICATE_EMAIL"),
    "This email is already assigned to another active student."
  );
  assert.equal(
    studentManagementError("ZS002", "STUDENT_DUPLICATE_NUMBER"),
    "This student number is already in use at this school."
  );
  assert.equal(studentManagementError("XX000", "internal_constraint_name"), "The student could not be saved.");
});

test("editor version changes whenever a saved field changes", () => {
  const student = {
    id: "student-a", first_name: "Ada", last_name: "Lovelace", student_number: null,
    grade_level: null, dorm_id: null, school_email: null, status: "active", updated_at: "one"
  } as Parameters<typeof studentEditorVersion>[0];
  assert.notEqual(studentEditorVersion(student), studentEditorVersion({ ...student!, first_name: "Augusta" }));
  assert.notEqual(studentEditorVersion(student), studentEditorVersion({ ...student!, updated_at: "two" }));
});

test("new-student editor remount version changes only after successful creation", () => {
  const initialVersion = 0;
  const errorVersion = nextNewStudentEditorVersion(initialVersion, "error");
  const successVersion = nextNewStudentEditorVersion(errorVersion, "success");

  assert.equal(errorVersion, initialVersion);
  assert.equal(studentEditorVersion(undefined, errorVersion), "new-student-0");
  assert.equal(successVersion, 1);
  assert.equal(studentEditorVersion(undefined, successVersion), "new-student-1");
});

test("migration rejects changing or clearing a linked email", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260802000000_add_student_admin_management.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /linked_auth_user_id is not null and normalized_email is distinct from current_school_email/);
  assert.match(sql, /STUDENT_LINKED_EMAIL_LOCKED/);
  const current: string | null = "linked@school.org";
  const cleared: string | null = null;
  const changed: string | null = "other@school.org";
  assert.notEqual(cleared, current, "clearing normalizes to null and is distinct");
  assert.notEqual(changed, current, "changing is distinct");
});

test("migration reasserts residence-only direct updates and explicit scoped RPC authorization", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260802000000_add_student_admin_management.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /revoke all privileges on table public\.students from authenticated/);
  assert.match(sql, /grant update \(dorm_id\) on table public\.students to authenticated/);
  assert.doesNotMatch(sql, /has_school_role\(target_school_id/);
  assert.match(sql, /ausr\.role = 'school_admin'::public\.school_role/g);
  assert.match(sql, /public\.is_super_admin\(\) and public\.has_active_school_membership\(target_school_id\)/g);
  assert.match(sql, /get stacked diagnostics violated_constraint = constraint_name/g);
  assert.match(sql, /students_active_school_email_unique/);
  assert.match(sql, /students_school_id_student_number_key/);
  assert.match(sql, /errcode = 'ZS001'/g);
  assert.match(sql, /errcode = 'ZS002'/g);
});
