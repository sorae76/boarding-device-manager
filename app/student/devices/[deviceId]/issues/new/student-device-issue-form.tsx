"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { submitStudentDeviceIssueAction, type StudentDeviceIssueState } from "@/lib/students/device-issue-actions";

const initialState: StudentDeviceIssueState = { status: "idle", message: "" };
function SubmitButton() { const { pending } = useFormStatus(); return <button className="min-h-11 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={pending}>{pending ? "Submitting..." : "Submit request"}</button>; }

export default function StudentDeviceIssueForm({ deviceId }: { deviceId: string }) {
  const [state, action] = useFormState(submitStudentDeviceIssueAction, initialState);
  if (state.status === "success") return <div className="space-y-4"><p className="rounded-md bg-green-50 p-4 text-sm text-green-800">{state.message}</p><Link className="font-semibold text-brand" href="/student">Return to my devices</Link></div>;
  return <form action={action} className="space-y-5"><input name="deviceId" type="hidden" value={deviceId} /><label className="block space-y-1 text-sm"><span className="font-medium">Request type</span><select className="min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2" name="requestType" required><option value="lost">Report lost</option><option value="broken">Report broken / damaged</option><option value="disposal">Request disposal / removal</option></select></label><label className="block space-y-1 text-sm"><span className="font-medium">Reason</span><textarea className="min-h-32 w-full rounded-md border border-neutral-300 p-3" maxLength={1000} name="studentReason" required /></label>{state.status === "error" ? <p className="text-sm text-red-700" role="alert">{state.message}</p> : null}<div className="flex flex-wrap gap-3"><SubmitButton /><Link className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold" href="/student">Cancel / Back</Link></div></form>;
}
