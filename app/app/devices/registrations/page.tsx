import Link from "next/link";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { listPendingDeviceRegistrations } from "@/lib/devices/data";
import { deviceTypeLabels, formatDateTimeInTimeZone } from "@/lib/devices/format";

export const dynamic = "force-dynamic";

export default async function PendingDeviceRegistrationsPage() {
  const context = await requireDeviceWorkflowContext();
  const requests = await listPendingDeviceRegistrations(context);
  const schoolTimeZone = context.currentSchool.timezone;
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Device Registry</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Pending registrations</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Review student submissions and approve or reject devices within your access scope.
        </p>
      </div>

      <div className="space-y-3 md:hidden" data-mobile-registration-cards>
        {requests.map((request) => (
          <article
            className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
            key={request.request_id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-semibold text-neutral-950">
                  {request.student_name}
                </h2>
                <p className="mt-1 break-words text-xs text-neutral-500">
                  {request.student_number ?? "No student number"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                Pending
              </span>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-neutral-500">Residence</dt>
                <dd className="mt-1 break-words text-neutral-900">
                  {request.residence_name ?? "Unassigned"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500">Device</dt>
                <dd className="mt-1 break-words text-neutral-900">
                  {request.manufacturer} {request.model} / {request.color}
                </dd>
                <dd className="mt-1 text-xs text-neutral-500">
                  {deviceTypeLabels[request.device_type]}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500">Serial number</dt>
                <dd className="mt-1 break-all text-neutral-900">{request.serial_number}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500">Submitted</dt>
                <dd className="mt-1 text-neutral-900">
                  {formatDateTimeInTimeZone(request.submitted_at, schoolTimeZone)}
                </dd>
              </div>
            </dl>
            <Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" href={`/app/devices/registrations/${request.request_id}`}>Review</Link>
          </article>
        ))}
        {requests.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
            No pending registrations are visible in your scope.
          </p>
        ) : null}
      </div>

      <section
        className="hidden overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm md:block"
        data-desktop-registration-table
      >
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              {["Student", "Residence", "Device", "Color", "Serial number", "Submitted", "Status", "Action"].map(
                (label) => <th className="px-3 py-3 font-semibold" key={label}>{label}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {requests.map((request) => (
              <tr key={request.request_id}>
                <td className="break-words px-3 py-3 align-top">
                  <p className="font-medium text-neutral-900">{request.student_name}</p>
                  <p className="text-xs text-neutral-500">
                    {request.student_number ?? "No student number"}
                  </p>
                </td>
                <td className="break-words px-3 py-3 align-top text-neutral-700">
                  {request.residence_name ?? "Unassigned"}
                </td>
                <td className="break-words px-3 py-3 align-top">
                  <p className="font-medium text-neutral-900">
                    {request.manufacturer} {request.model}
                  </p>
                  <p className="text-xs text-neutral-500">{deviceTypeLabels[request.device_type]}</p>
                </td>
                <td className="break-words px-3 py-3 align-top text-neutral-700">{request.color}</td>
                <td className="break-all px-3 py-3 align-top text-neutral-700">{request.serial_number}</td>
                <td className="px-3 py-3 align-top text-neutral-700">
                  {formatDateTimeInTimeZone(request.submitted_at, schoolTimeZone)}
                </td>
                <td className="px-3 py-3 align-top">
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                    Pending
                  </span>
                </td>
                <td className="px-3 py-3 align-top"><Link className="font-semibold text-brand hover:underline" href={`/app/devices/registrations/${request.request_id}`}>Review</Link></td>
              </tr>
            ))}
            {requests.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500" colSpan={8}>
                  No pending registrations are visible in your scope.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
