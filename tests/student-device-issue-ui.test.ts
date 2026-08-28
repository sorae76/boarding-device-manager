import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { studentDeviceIssueError, validateStudentDeviceIssueInput } from "../lib/students/device-issue.ts";
// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { deviceIssueReviewError, issueApprovalNoteRequired, normalizeIssueReviewNote } from "../lib/devices/issue-review.ts";
const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const id = "550e8400-e29b-41d4-a716-446655440000";

test("student issue input is trimmed, validated, and safely mapped", () => {
  assert.deepEqual(validateStudentDeviceIssueInput({ deviceId: id, requestType: " broken ", studentReason: " cracked screen " }).input, { deviceId: id, requestType: "broken", studentReason: "cracked screen" });
  assert.equal(validateStudentDeviceIssueInput({ deviceId: id, requestType: "other", studentReason: "x" }).error, "Choose a valid request type.");
  assert.equal(validateStudentDeviceIssueInput({ deviceId: id, requestType: "lost", studentReason: " " }).error, "A reason is required.");
  assert.equal(validateStudentDeviceIssueInput({ deviceId: id, requestType: "lost", studentReason: "x".repeat(1001) }).error, "Reason must be 1000 characters or fewer.");
  assert.equal(studentDeviceIssueError("constraint secret SQL"), "The device issue request could not be submitted.");
});

test("student route verifies an own eligible portal device and exposes no authority fields", async () => {
  const page = await read("../app/student/devices/[deviceId]/issues/new/page.tsx");
  const form = await read("../app/student/devices/[deviceId]/issues/new/student-device-issue-form.tsx");
  const action = await read("../lib/students/device-issue-actions.ts");
  assert.match(page, /portal\.devices\.find/); assert.match(page, /\["checked_out", "returned"\]/); assert.match(page, /notFound\(\)/);
  assert.match(page, /does not immediately change the device custody or lifecycle status/);
  for (const field of ["schoolId", "studentId", "submittedByUserId"]) assert.equal(form.includes(field) || action.includes(`formData.get("${field}")`), false);
  assert.match(action, /submit_current_student_device_issue/); assert.match(action, /revalidatePath\("\/student"\)/);
  assert.match(form, /Report lost/); assert.match(form, /Report broken \/ damaged/); assert.match(form, /Request disposal \/ removal/);
});

test("student portal separates pending requests from collapsed history and keeps eligible actions", async () => {
  const flow = await read("../lib/students/portal-flow.ts"); const portal = await read("../app/student/page.tsx"); const types = await read("../lib/students/portal.ts"); const labels = await read("../lib/devices/issue-review.ts");
  assert.match(flow, /list_current_student_device_issue_requests/); assert.match(flow, /issueRequests/);
  assert.match(portal, /Open requests/); assert.match(portal, /status === "pending"/); assert.match(portal, /<details/); assert.match(portal, /View request history/); assert.match(labels, /pending: "Pending review"/); assert.match(labels, /approved: "Approved"/); assert.match(labels, /rejected: "Rejected"/); assert.match(portal, /Staff feedback/); assert.match(portal, /Report an issue/);
  assert.doesNotMatch(types, /qr_token|reviewed_by_user_id|submitted_by_user_id|applied_event_id/);
});

test("UI cleanup keeps defaults, badges, pending issue choices, and aligned cards", async () => {
  const form = await read("../app/app/devices/device-form.tsx");
  const portal = await read("../app/student/page.tsx");
  const issuePage = await read("../app/student/devices/[deviceId]/issues/new/page.tsx");
  const issueForm = await read("../app/student/devices/[deviceId]/issues/new/student-device-issue-form.tsx");
  const queue = await read("../app/app/devices/issues/page.tsx");
  const detail = await read("../app/app/devices/[deviceId]/page.tsx");
  const issueReview = await read("../app/app/devices/issues/[requestId]/review-forms.tsx");
  const registrationReview = await read("../app/app/devices/registrations/[requestId]/review-forms.tsx");
  const format = await read("../lib/devices/format.ts");

  assert.match(form, /device\?\.color \?\? "Black"/);
  assert.match(form, /name="color" required type="hidden"/);
  assert.match(portal, /shrink-0 items-center whitespace-nowrap rounded-full/);
  assert.match(issuePage, /request\.device_id === device\.device_id && request\.status === "pending"/);
  assert.match(issueForm, /This device already has a pending issue request/);
  assert.match(issueForm, /disabled=\{pendingTypes\.has\("lost"\)\}/);
  assert.match(issueForm, /All issue types are already pending/);
  assert.match(queue, /<colgroup>/); assert.match(queue, /submittedParts/); assert.match(queue, /whitespace-nowrap font-semibold text-brand/);
  assert.match(format, /inactive: "Inactive \/ Unavailable"/);
  assert.match(detail, /device\.status !== "inactive" \? <Link/);
  assert.match(detail, /flex h-full flex-col/); assert.match(detail, /mt-auto rounded-md/);
  assert.match(issueReview, /flex h-full flex-col/); assert.match(issueReview, /mt-auto pt-3/);
  assert.match(registrationReview, /flex h-full flex-col/); assert.match(registrationReview, /mt-auto pt-3/);
});

test("staff issue helpers use only scoped RPCs and queue supports all statuses", async () => {
  const data = await read("../lib/devices/data.ts"); const queue = await read("../app/app/devices/issues/page.tsx"); const detail = await read("../app/app/devices/issues/[requestId]/page.tsx");
  const issueHelpers = data.slice(data.indexOf("export async function listStudentDeviceIssuesForStaff"), data.indexOf("export async function listPendingDeviceRegistrations"));
  assert.match(issueHelpers, /list_student_device_issue_requests_for_staff/); assert.match(issueHelpers, /get_student_device_issue_request_for_staff/);
  assert.doesNotMatch(issueHelpers, /\.from\("(?:students|dorms|device_custody_devices|student_device_issue_requests)"\)/);
  assert.match(queue, /\["pending", "approved", "rejected"\]/); assert.match(queue, /data-mobile-issue-cards/); assert.match(queue, /data-desktop-issue-table/);
  for (const value of ["student_name", "residence_name", "current_custody_status", "device_status_at_submission", "student_reason", "reviewed_at"]) assert.ok(queue.includes(value) || detail.includes(value));
  assert.match(detail, /Processed request detail/); assert.match(detail, /Disposal approval is restricted/);
  assert.doesNotMatch(queue + detail, /qr_token/);
});

test("review actions trust only request id and note and map errors safely", async () => {
  const actions = await read("../lib/devices/issue-review-actions.ts"); const forms = await read("../app/app/devices/issues/[requestId]/review-forms.tsx");
  for (const field of ["schoolId", "studentId", "deviceId", "reviewerId", "requestType", "noteRequired"]) assert.equal(actions.includes(`formData.get("${field}")`), false);
  assert.match(actions, /context\.currentSchool\.id/); assert.match(actions, /approve_student_device_issue_request/); assert.match(actions, /reject_student_device_issue_request/);
  assert.equal(issueApprovalNoteRequired("lost"), false); assert.equal(issueApprovalNoteRequired("broken"), true); assert.equal(issueApprovalNoteRequired("disposal"), true);
  assert.equal(normalizeIssueReviewNote(" ", true).error, "A review note is required.");
  assert.equal(deviceIssueReviewError("device_issue_disposal_requires_returned private"), "The device must be returned before disposal can be approved.");
  assert.equal(deviceIssueReviewError("raw SQL secret"), "The device issue request could not be processed.");
  assert.match(forms, /requestType !== "lost"/); assert.match(forms, /Reason for rejection \(required\)/);
});

test("device registry keeps registration and issue queues separate", async () => {
  const page = await read("../app/app/devices/page.tsx"); const access = await read("../lib/devices/access.ts");
  assert.match(page, /Pending registrations \(\{pendingRegistrations\.length\}\)/); assert.match(page, /Pending issue requests \(\{pendingIssues\.length\}\)/);
  assert.match(page, /listStudentDeviceIssuesForStaff\(context, "pending"\)/);
  const workflowGate = access.slice(access.indexOf("export function canAccessDeviceWorkflows"), access.indexOf("export function canAccessDeviceDashboard"));
  assert.doesNotMatch(workflowGate, /dorm_supervisor/);
});

test("device registry exposes one native full-row Device Detail link without changing workflows", async () => {
  const page = await read("../app/app/devices/page.tsx");
  const rowStart = page.indexOf("{devices.map((device) => (");
  const rowEnd = page.indexOf("{devices.length === 0", rowStart);
  const row = page.slice(rowStart, rowEnd);

  assert.match(row, /<tr[\s\S]*className="relative cursor-pointer hover:bg-neutral-50 focus-within:bg-brand-soft"/);
  assert.match(row, /<Link[\s\S]*className="font-semibold text-brand outline-none after:absolute after:inset-0 after:content-\[''\]"[\s\S]*href=\{`\/app\/devices\/\$\{device\.id\}`\}[\s\S]*\{deviceName\(device\)\}[\s\S]*<\/Link>/);
  assert.equal(Array.from(row.matchAll(/href=\{`\/app\/devices\/\$\{device\.id\}`\}/g)).length, 1);
  assert.doesNotMatch(row, /<Link[^>]*>[\s\S]*<tr/);
  assert.doesNotMatch(row, /<form|transitionDeviceLifecycleAction|scanReturnDeviceAction|onClick=/);
  assert.doesNotMatch(page, /"use client"|useRouter|router\.push/);
  assert.doesNotMatch(page, /href=\{`\/device-pass\/\$\{device\.qr_token\}`\}/);

  for (const control of [
    "Pending registrations",
    "Pending issue requests",
    "Download template",
    "Import CSV",
    "Export CSV",
    "Add device"
  ]) {
    assert.match(page, new RegExp(control));
  }
});
