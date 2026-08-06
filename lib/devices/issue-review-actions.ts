"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { getStudentDeviceIssueForStaff } from "@/lib/devices/data";
import { deviceIssueReviewError, issueApprovalNoteRequired, normalizeIssueReviewNote, validateIssueRequestId } from "@/lib/devices/issue-review";
import { createClient } from "@/lib/supabase/server";
import type { DeviceIssueReviewActionState } from "@/lib/devices/types";

function refreshIssueViews(requestId: string, deviceId?: string) {
  for (const path of ["/student", "/app/dashboard", "/app/devices", "/app/devices/issues", `/app/devices/issues/${requestId}`]) revalidatePath(path);
  if (deviceId) revalidatePath(`/app/devices/${deviceId}`);
}
function errorState(message: string): DeviceIssueReviewActionState { return { status: "error", message }; }

export async function approveStudentDeviceIssueAction(_previous: DeviceIssueReviewActionState, formData: FormData): Promise<DeviceIssueReviewActionState> {
  const context = await requireDeviceWorkflowContext();
  const requestId = validateIssueRequestId(formData.get("requestId"));
  if (!requestId) return errorState("The device issue request is invalid.");
  const request = await getStudentDeviceIssueForStaff(context, requestId);
  if (!request) return errorState("This request is no longer available in your access scope.");
  const review = normalizeIssueReviewNote(formData.get("reviewNote"), issueApprovalNoteRequired(request.request_type));
  if (review.error) return errorState(review.error);
  const { error } = await createClient().rpc("approve_student_device_issue_request", { target_school_id: context.currentSchool.id, target_request_id: requestId, target_review_note: review.note });
  if (error) return errorState(deviceIssueReviewError(error.message));
  refreshIssueViews(requestId, request.device_id); redirect(`/app/devices/issues/${requestId}`);
}
export async function rejectStudentDeviceIssueAction(_previous: DeviceIssueReviewActionState, formData: FormData): Promise<DeviceIssueReviewActionState> {
  const context = await requireDeviceWorkflowContext();
  const requestId = validateIssueRequestId(formData.get("requestId"));
  const review = normalizeIssueReviewNote(formData.get("reviewNote"), true);
  if (!requestId) return errorState("The device issue request is invalid.");
  if (review.error) return errorState(review.error);
  const { error } = await createClient().rpc("reject_student_device_issue_request", { target_school_id: context.currentSchool.id, target_request_id: requestId, target_review_note: review.note });
  if (error) return errorState(deviceIssueReviewError(error.message));
  refreshIssueViews(requestId); redirect(`/app/devices/issues/${requestId}`);
}
