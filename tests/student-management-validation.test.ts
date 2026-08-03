import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { validateStudentBasicInput } from "../lib/students/validation.ts";

const valid = { firstName: "Ada", lastName: "Lovelace", studentNumber: "", gradeLevel: "", residenceId: "", schoolEmail: "ada@school.org", status: "active" as const };

test("accepts optional blank student fields", () => assert.equal(validateStudentBasicInput({ ...valid, schoolEmail: "" }), null));
test("requires both names", () => assert.equal(validateStudentBasicInput({ ...valid, firstName: "" }), "First and last name are required."));
test("rejects malformed email", () => assert.equal(validateStudentBasicInput({ ...valid, schoolEmail: "not-email" }), "Enter a valid school email."));
test("rejects invalid status", () => assert.equal(validateStudentBasicInput({ ...valid, status: "deleted" as "active" }), "Choose a valid status."));
test("rejects oversized names and optional identifiers", () => {
  assert.equal(validateStudentBasicInput({ ...valid, firstName: "x".repeat(101) }), "Names must be 100 characters or fewer.");
  assert.equal(validateStudentBasicInput({ ...valid, studentNumber: "x".repeat(101) }), "Student number must be 100 characters or fewer.");
  assert.equal(validateStudentBasicInput({ ...valid, gradeLevel: "x".repeat(51) }), "Grade level must be 50 characters or fewer.");
});
