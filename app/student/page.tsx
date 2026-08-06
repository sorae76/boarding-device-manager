import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import { requireStudentPortalContext } from "@/lib/students/portal";
import type { DeviceCustodyStatus, DeviceType } from "@/lib/devices/types";
import { formatDateInTimeZone } from "@/lib/devices/format";
import { issueStatusBadgeClasses, issueStatusLabels, issueTypeLabels } from "@/lib/devices/issue-review";

export const dynamic = "force-dynamic";

const deviceTypeLabels: Record<DeviceType, string> = {
  phone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  watch: "Watch",
  other: "Other"
};

const custodyLabels: Record<DeviceCustodyStatus, string> = {
  checked_out: "With you",
  returned: "In school storage",
  lost: "Missing",
  inactive: "Inactive"
};

const registrationBadgeClasses = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-800"
} as const;

export default async function StudentPortalPage() {
  const { devices, registrationRequests, issueRequests, school, student } = await requireStudentPortalContext();

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-brand">{school.name}</p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-950">
              {student.first_name} {student.last_name}
            </h1>
            <div className="mt-2 space-y-1 text-sm text-neutral-600">
              {student.student_number ? <p>Student number: {student.student_number}</p> : null}
              {student.grade_level ? <p>Grade: {student.grade_level}</p> : null}
              <p>
                Primary residence: {student.primary_residence_name ?? "Unassigned"}
              </p>
            </div>
          </div>
          <LogoutButton />
        </header>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">My devices</h2>
          {devices.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {devices.map((device) => (
                <article
                  className="rounded-lg border border-neutral-200 p-4"
                  key={device.device_id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-neutral-950">
                        {device.manufacturer} {device.model}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {deviceTypeLabels[device.device_type]} · {device.color}
                      </p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
                      {custodyLabels[device.custody_status]}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-neutral-600">
                    {device.asset_tag ? (
                      <div className="flex gap-2">
                        <dt className="font-medium">Asset tag:</dt>
                        <dd>{device.asset_tag}</dd>
                      </div>
                    ) : null}
                    {device.serial_number ? (
                      <div className="flex gap-2">
                        <dt className="font-medium">Serial number:</dt>
                        <dd>{device.serial_number}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {["checked_out", "returned"].includes(device.custody_status) ? (
                    <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand" href={`/student/devices/${device.device_id}/issues/new`}>Report an issue</Link>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-600">
              No devices are registered to your account.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div><h2 className="text-lg font-semibold text-neutral-950">Device issue requests</h2><p className="mt-1 text-sm text-neutral-600">Lost, damaged, and disposal requests submitted for staff review.</p></div>
          {issueRequests.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{issueRequests.map((request) => (
            <article className="rounded-lg border border-neutral-200 p-4" key={request.request_id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{request.manufacturer} {request.model}</p><p className="mt-1 text-sm text-neutral-600">{issueTypeLabels[request.request_type]}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${issueStatusBadgeClasses[request.status]}`}>{issueStatusLabels[request.status]}</span></div>
              <dl className="mt-3 space-y-2 text-sm text-neutral-600"><div><dt className="inline font-medium">Device: </dt><dd className="inline">{deviceTypeLabels[request.device_type]} / {request.color}</dd></div><div><dt className="font-medium">Student reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{request.student_reason}</dd></div><div><dt className="inline font-medium">Submitted: </dt><dd className="inline">{formatDateInTimeZone(request.submitted_at, school.timezone)}</dd></div>{request.reviewed_at ? <div><dt className="inline font-medium">Reviewed: </dt><dd className="inline">{formatDateInTimeZone(request.reviewed_at, school.timezone)}</dd></div> : null}{request.review_note ? <div><dt className="font-medium">Staff feedback</dt><dd className="mt-1 whitespace-pre-wrap break-words">{request.review_note}</dd></div> : null}{request.resolution ? <div><dt className="inline font-medium">Resolution: </dt><dd className="inline">{request.resolution.replaceAll("_", " ")}</dd></div> : null}</dl>
            </article>
          ))}</div> : <p className="mt-4 text-sm text-neutral-600">You have no device issue requests.</p>}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-semibold text-neutral-950">Registration requests</h2><p className="mt-1 text-sm text-neutral-600">Devices you submitted for staff verification.</p></div>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" href="/student/devices/new">Add device</Link>
          </div>
          {registrationRequests.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {registrationRequests.map((request) => (
                <article className="min-w-0 rounded-lg border border-neutral-200 p-4" key={request.request_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="font-semibold text-neutral-950">{request.manufacturer} {request.model}</p><p className="mt-1 text-sm text-neutral-600">{deviceTypeLabels[request.device_type]} · {request.color}</p></div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${registrationBadgeClasses[request.status]}`}>
                      {request.status === "pending" ? "Pending verification" : request.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-neutral-600">
                    <div><dt className="inline font-medium">Submitted: </dt><dd className="inline">{formatDateInTimeZone(request.submitted_at, school.timezone)}</dd></div>
                    {request.status !== "pending" && request.reviewed_at ? (
                      <div><dt className="inline font-medium">Reviewed: </dt><dd className="inline">{formatDateInTimeZone(request.reviewed_at, school.timezone)}</dd></div>
                    ) : null}
                    <div className="min-w-0"><dt className="inline font-medium">Serial number: </dt><dd className="break-all">{request.serial_number}</dd></div>
                    {request.status !== "pending" && request.review_note ? (
                      <div className="pt-2">
                        <dt className="font-medium">Staff feedback</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words">{request.review_note}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-neutral-600">You have no registration requests.</p>}
        </section>
      </div>
    </main>
  );
}
