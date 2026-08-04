import Link from "next/link";
import { notFound } from "next/navigation";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { getStudentDeviceRegistrationForStaff } from "@/lib/devices/data";
import { deviceTypeLabels, formatDateTimeInTimeZone } from "@/lib/devices/format";
import { validateRegistrationRequestId } from "@/lib/devices/registration-review";

import { ApprovalForm, RejectionForm } from "./review-forms";

export const dynamic = "force-dynamic";

export default async function RegistrationReviewPage({
  params
}: {
  params: { requestId: string };
}) {
  const context = await requireDeviceWorkflowContext();
  const requestId = validateRegistrationRequestId(params.requestId);

  if (!requestId) {
    notFound();
  }

  const request = await getStudentDeviceRegistrationForStaff(context, requestId);

  if (!request) {
    notFound();
  }

  const timezone = context.currentSchool.timezone;
  const fields = [
    ["Student", `${request.student_name}${request.student_number ? ` (${request.student_number})` : ""}`],
    ["Residence", request.residence_name ?? "Unassigned"],
    ["Device type", deviceTypeLabels[request.device_type]],
    ["Manufacturer", request.manufacturer],
    ["Model", request.model],
    ["Color", request.color],
    ["Serial number", request.serial_number],
    ["Student note", request.student_note ?? "None"],
    ["Submitted", formatDateTimeInTimeZone(request.submitted_at, timezone)]
  ];

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Device Registry</p>
        <h1 className="mt-1 text-2xl font-semibold">Registration review</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Current status: <span className="font-semibold capitalize">{request.status}</span>
        </p>
      </div>

      <section className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div className="min-w-0" key={label}>
              <dt className="text-sm font-medium text-neutral-500">{label}</dt>
              <dd className="mt-1 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {request.status === "pending" ? (
        <>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Approval creates an operational device with status <strong>With student</strong>.
            No custody event is created.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <ApprovalForm requestId={request.request_id} />
            <RejectionForm requestId={request.request_id} />
          </div>
        </>
      ) : (
        <section className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Review result</h2>
          {request.reviewed_at ? (
            <p className="text-sm text-neutral-700">
              Reviewed {formatDateTimeInTimeZone(request.reviewed_at, timezone)}
            </p>
          ) : null}
          {request.review_note ? (
            <p className="whitespace-pre-wrap break-words text-sm text-neutral-700">
              Staff feedback: {request.review_note}
            </p>
          ) : null}
          {request.status === "approved" && request.approved_device_id ? (
            <Link
              className="inline-flex min-h-11 items-center font-semibold text-brand"
              href={`/app/devices/${request.approved_device_id}`}
            >
              View operational device
            </Link>
          ) : null}
        </section>
      )}

      <Link
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand"
        href="/app/devices/registrations"
      >
        Back to pending registrations
      </Link>
    </div>
  );
}
