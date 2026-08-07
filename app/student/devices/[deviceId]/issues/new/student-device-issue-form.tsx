"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { submitStudentDeviceIssueAction, type StudentDeviceIssueState } from "@/lib/students/device-issue-actions";
import { formatDateInTimeZone } from "@/lib/devices/format";
import { issueTypeLabels } from "@/lib/devices/issue-review";
import type { StudentDeviceIssueRequest } from "@/lib/students/portal";

const initialState: StudentDeviceIssueState = { status: "idle", message: "" };
function SubmitButton({ disabled }: { disabled: boolean }) { const { pending } = useFormStatus(); return <button className="min-h-11 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled || pending}>{pending ? "Submitting..." : "Submit request"}</button>; }

export default function StudentDeviceIssueForm({ deviceId, pendingRequests, timeZone }: { deviceId: string; pendingRequests: StudentDeviceIssueRequest[]; timeZone: string }) {
  const [state, action] = useFormState(submitStudentDeviceIssueAction, initialState);
  const pendingTypes = new Set(pendingRequests.map((request) => request.request_type));
  const allTypesPending = ["lost", "broken", "disposal"].every((type) => pendingTypes.has(type as StudentDeviceIssueRequest["request_type"]));
  if (state.status === "success") return <div className="space-y-4"><p className="rounded-md bg-green-50 p-4 text-sm text-green-800">{state.message}</p><Link className="font-semibold text-brand" href="/student">Return to my devices</Link></div>;
  return <form action={action} className="space-y-5"><input name="deviceId" type="hidden" value={deviceId} />{pendingRequests.length ? <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">This device already has a pending issue request.</p><ul className="mt-2 space-y-1">{pendingRequests.map((request) => <li key={request.request_id}>{issueTypeLabels[request.request_type]} · submitted {formatDateInTimeZone(request.submitted_at, timeZone)}</li>)}</ul></div> : null}<label className="block space-y-1 text-sm"><span className="font-medium">Request type</span><select className="min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" disabled={allTypesPending} name="requestType" required><option disabled={pendingTypes.has("lost")} value="lost">Report lost{pendingTypes.has("lost") ? " — Already pending" : ""}</option><option disabled={pendingTypes.has("broken")} value="broken">Report broken / damaged{pendingTypes.has("broken") ? " — Already pending" : ""}</option><option disabled={pendingTypes.has("disposal")} value="disposal">Request disposal / removal{pendingTypes.has("disposal") ? " — Already pending" : ""}</option></select></label><label className="block space-y-1 text-sm"><span className="font-medium">Reason</span><textarea className="min-h-32 w-full rounded-md border border-neutral-300 p-3" disabled={allTypesPending} maxLength={1000} name="studentReason" required /></label>{allTypesPending ? <p className="text-sm text-neutral-600">All issue types are already pending. Staff must review a request before another can be submitted.</p> : null}{state.status === "error" ? <p className="text-sm text-red-700" role="alert">{state.message}</p> : null}<div className="flex flex-wrap gap-3"><SubmitButton disabled={allTypesPending} /><Link className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold" href="/student">Cancel / Back</Link></div></form>;
}
