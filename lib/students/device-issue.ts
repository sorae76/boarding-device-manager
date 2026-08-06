export type StudentDeviceIssueType = "lost" | "broken" | "disposal";
export type StudentDeviceIssueStatus = "pending" | "approved" | "rejected";
export type StudentDeviceIssueResolution =
  | "lost_marked_missing"
  | "broken_exception"
  | "disposal_inactivated";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const studentDeviceIssueTypes: StudentDeviceIssueType[] = ["lost", "broken", "disposal"];

export function validateStudentDeviceIssueInput(input: {
  deviceId: unknown;
  requestType: unknown;
  studentReason: unknown;
}) {
  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  const requestType = typeof input.requestType === "string" ? input.requestType.trim() : "";
  const studentReason = typeof input.studentReason === "string" ? input.studentReason.trim() : "";
  if (!uuidPattern.test(deviceId)) return { error: "Choose a valid device." };
  if (!studentDeviceIssueTypes.includes(requestType as StudentDeviceIssueType)) return { error: "Choose a valid request type." };
  if (!studentReason) return { error: "A reason is required." };
  if (studentReason.length > 1000) return { error: "Reason must be 1000 characters or fewer." };
  return { input: { deviceId, requestType: requestType as StudentDeviceIssueType, studentReason } };
}

export function studentDeviceIssueError(raw: unknown) {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value.includes("device_issue_duplicate_pending")) return "You already have a pending request of this type for this device.";
  if (value.includes("device_issue_device_not_available")) return "This device is no longer eligible for an issue request.";
  if (value.includes("device_issue_student_not_available")) return "Your student account could not be verified.";
  if (value.includes("device_issue_invalid_submission")) return "Check the request details and try again.";
  return "The device issue request could not be submitted.";
}
