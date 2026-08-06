"use server";

import { revalidatePath } from "next/cache";
import { requireStudentPortalContext } from "@/lib/students/portal";
import { studentDeviceIssueError, validateStudentDeviceIssueInput } from "@/lib/students/device-issue";
import { createClient } from "@/lib/supabase/server";

export type StudentDeviceIssueState = { status: "idle" | "success" | "error"; message: string };

export async function submitStudentDeviceIssueAction(
  _previous: StudentDeviceIssueState,
  formData: FormData
): Promise<StudentDeviceIssueState> {
  try {
    const portal = await requireStudentPortalContext();
    const validation = validateStudentDeviceIssueInput({
      deviceId: formData.get("deviceId"), requestType: formData.get("requestType"),
      studentReason: formData.get("studentReason")
    });
    if (!validation.input) return { status: "error", message: validation.error ?? "Check the request." };
    const input = validation.input;
    const ownDevice = portal.devices.find((device) => device.device_id === input.deviceId);
    if (!ownDevice || !["checked_out", "returned"].includes(ownDevice.custody_status)) {
      return { status: "error", message: "This device is no longer eligible for an issue request." };
    }
    const { error } = await createClient().rpc("submit_current_student_device_issue", {
      target_device_id: input.deviceId,
      target_request_type: input.requestType,
      target_student_reason: input.studentReason
    });
    if (error) return { status: "error", message: studentDeviceIssueError(error.message) };
    revalidatePath("/student");
    return { status: "success", message: "Your device issue request was submitted for review." };
  } catch {
    return { status: "error", message: "The device issue request could not be submitted." };
  }
}
