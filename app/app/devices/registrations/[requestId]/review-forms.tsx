"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  approveStudentDeviceRegistrationAction,
  rejectStudentDeviceRegistrationAction
} from "@/lib/devices/registration-review-actions";
import type { RegistrationReviewActionState } from "@/lib/devices/types";

const initialState: RegistrationReviewActionState = { status: "idle", message: "" };

function SubmitButton({
  children,
  tone
}: {
  children: React.ReactNode;
  tone: "approve" | "reject";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`min-h-11 w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
        tone === "approve" ? "bg-brand" : "bg-red-700"
      }`}
      disabled={pending}
      type="submit"
    >
      {pending ? "Processing..." : children}
    </button>
  );
}

function ErrorMessage({ state }: { state: RegistrationReviewActionState }) {
  return state.status === "error" ? (
    <p className="text-sm text-red-700" role="alert">
      {state.message}
    </p>
  ) : null;
}

export function ApprovalForm({ requestId }: { requestId: string }) {
  const [state, action] = useFormState(
    approveStudentDeviceRegistrationAction,
    initialState
  );

  return (
    <form action={action} className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <input name="requestId" type="hidden" value={requestId} />
      <label className="block text-sm font-medium" htmlFor="approval-note">
        Approval note (optional)
      </label>
      <textarea
        className="min-h-24 w-full rounded-md border border-neutral-300 p-3 text-sm"
        id="approval-note"
        maxLength={1000}
        name="reviewNote"
      />
      <ErrorMessage state={state} />
      <SubmitButton tone="approve">Approve and create device</SubmitButton>
    </form>
  );
}

export function RejectionForm({ requestId }: { requestId: string }) {
  const [state, action] = useFormState(
    rejectStudentDeviceRegistrationAction,
    initialState
  );

  return (
    <form action={action} className="space-y-3 rounded-lg border border-red-200 p-4">
      <input name="requestId" type="hidden" value={requestId} />
      <label className="block text-sm font-medium" htmlFor="rejection-note">
        Reason for rejection
      </label>
      <textarea
        className="min-h-24 w-full rounded-md border border-neutral-300 p-3 text-sm"
        id="rejection-note"
        maxLength={1000}
        name="reviewNote"
        required
      />
      <ErrorMessage state={state} />
      <SubmitButton tone="reject">Reject registration</SubmitButton>
    </form>
  );
}
