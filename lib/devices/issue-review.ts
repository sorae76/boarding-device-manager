import type { StudentDeviceIssueType } from "@/lib/students/device-issue";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateIssueRequestId(value: unknown) { return typeof value === "string" && uuidPattern.test(value) ? value : null; }
export function normalizeIssueReviewNote(value: unknown, required: boolean) {
  const note = typeof value === "string" ? value.trim() : "";
  if (required && !note) return { error: "A review note is required.", note: null };
  if (note.length > 1000) return { error: "Review note must be 1000 characters or fewer.", note: null };
  return { error: null, note: note || null };
}
export function issueApprovalNoteRequired(type: StudentDeviceIssueType) { return type === "broken" || type === "disposal"; }
export function deviceIssueReviewError(raw: unknown) {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value.includes("device_issue_review_already_approved")) return "This request has already been approved.";
  if (value.includes("device_issue_review_already_rejected")) return "This request has already been rejected.";
  if (value.includes("device_issue_disposal_requires_returned")) return "The device must be returned before disposal can be approved.";
  if (value.includes("device_issue_review_note_required")) return "A review note is required for this action.";
  if (value.includes("device_issue_review_not_available")) return "This request is no longer available in your access scope.";
  if (value.includes("device_issue_device_not_available")) return "The device is no longer available for this review.";
  return "The device issue request could not be processed.";
}
export const issueTypeLabels = { lost: "Lost device", broken: "Broken / damaged", disposal: "Disposal / removal" } as const;
export const issueStatusLabels = { pending: "Pending review", approved: "Approved", rejected: "Rejected" } as const;
export const issueStatusBadgeClasses = { pending: "bg-amber-50 text-amber-800", approved: "bg-emerald-50 text-emerald-800", rejected: "bg-red-50 text-red-800" } as const;
