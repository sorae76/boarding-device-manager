"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { normalizeReviewNote, registrationReviewError, reviewErrorState, validateRegistrationRequestId } from "@/lib/devices/registration-review";
import { createClient } from "@/lib/supabase/server";
import type { RegistrationReviewActionState } from "@/lib/devices/types";

function refreshRegistrationViews(requestId: string) {
  revalidatePath("/app/dashboard");
  revalidatePath("/app/devices");
  revalidatePath("/app/devices/registrations");
  revalidatePath(`/app/devices/registrations/${requestId}`);
  revalidatePath("/student");
}

export async function approveStudentDeviceRegistrationAction(
  _previous: RegistrationReviewActionState,
  formData: FormData
): Promise<RegistrationReviewActionState> {
  const context = await requireDeviceWorkflowContext();
  const requestId = validateRegistrationRequestId(formData.get("requestId"));
  const review = normalizeReviewNote(formData.get("reviewNote"), false);
  if (!requestId) return reviewErrorState("The registration request is invalid.");
  if (review.error) return reviewErrorState(review.error);

  const { data, error } = await createClient().rpc("approve_student_device_registration_request", {
    target_school_id: context.currentSchool.id,
    target_request_id: requestId,
    target_review_note: review.note
  });
  if (error || typeof data !== "string") return reviewErrorState(registrationReviewError(error?.message));
  refreshRegistrationViews(requestId);
  redirect(`/app/devices/${data}`);
}

export async function rejectStudentDeviceRegistrationAction(
  _previous: RegistrationReviewActionState,
  formData: FormData
): Promise<RegistrationReviewActionState> {
  const context = await requireDeviceWorkflowContext();
  const requestId = validateRegistrationRequestId(formData.get("requestId"));
  const review = normalizeReviewNote(formData.get("reviewNote"), true);
  if (!requestId) return reviewErrorState("The registration request is invalid.");
  if (review.error) return reviewErrorState(review.error);

  const { error } = await createClient().rpc("reject_student_device_registration_request", {
    target_school_id: context.currentSchool.id,
    target_request_id: requestId,
    target_review_note: review.note
  });
  if (error) return reviewErrorState(registrationReviewError(error.message));
  refreshRegistrationViews(requestId);
  redirect(`/app/devices/registrations/${requestId}`);
}
