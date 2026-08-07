import Link from "next/link";

import LogoutButton from "@/components/logout-button";
import { formatDateInTimeZone } from "@/lib/devices/format";
import { issueStatusBadgeClasses, issueStatusLabels, issueTypeLabels } from "@/lib/devices/issue-review";
import type { DeviceCustodyStatus, DeviceType } from "@/lib/devices/types";
import { requireStudentPortalContext } from "@/lib/students/portal";

export const dynamic = "force-dynamic";

const deviceTypeLabels: Record<DeviceType, string> = {
  phone: "Phone", tablet: "Tablet", laptop: "Laptop", watch: "Watch", other: "Other"
};

const custodyLabels: Record<DeviceCustodyStatus, string> = {
  checked_out: "With you", returned: "In school storage", lost: "Missing", inactive: "Inactive"
};

const registrationBadgeClasses = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-800"
} as const;

const badgeClass = "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold";

export default async function StudentPortalPage() {
  const { devices, registrationRequests, issueRequests, school, student } = await requireStudentPortalContext();
  const pendingRegistrations = registrationRequests.filter((request) => request.status === "pending");
  const pendingIssues = issueRequests.filter((request) => request.status === "pending");
  const registrationHistory = registrationRequests.filter((request) => request.status !== "pending");
  const issueHistory = issueRequests.filter((request) => request.status !== "pending");
  const historyCount = registrationHistory.length + issueHistory.length;

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div><p className="text-sm font-semibold text-brand">{school.name}</p><h1 className="mt-1 text-2xl font-semibold text-neutral-950">{student.first_name} {student.last_name}</h1><div className="mt-2 space-y-1 text-sm text-neutral-600">{student.student_number ? <p>Student number: {student.student_number}</p> : null}{student.grade_level ? <p>Grade: {student.grade_level}</p> : null}<p>Primary residence: {student.primary_residence_name ?? "Unassigned"}</p></div></div>
          <LogoutButton />
        </header>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-neutral-950">My devices</h2><p className="mt-1 text-sm text-neutral-600">Devices currently registered to you.</p></div><Link className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" href="/student/devices/new">Add device</Link></div>
          {devices.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{devices.map((device) => {
            const devicePendingIssues = pendingIssues.filter((request) => request.device_id === device.device_id);
            const canReport = ["checked_out", "returned"].includes(device.custody_status);
            const anotherTypeAvailable = devicePendingIssues.length < 3;
            return <article className="min-w-0 rounded-lg border border-neutral-200 p-4" key={device.device_id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-neutral-950">{device.manufacturer} {device.model}</p><p className="mt-1 text-sm text-neutral-600">{deviceTypeLabels[device.device_type]} / {device.color}</p></div><span className={`${badgeClass} bg-neutral-100 text-neutral-700`}>{custodyLabels[device.custody_status]}</span></div><dl className="mt-3 space-y-1 text-xs text-neutral-500">{device.asset_tag ? <div className="flex min-w-0 gap-2"><dt className="shrink-0 font-medium">Asset tag:</dt><dd className="truncate">{device.asset_tag}</dd></div> : null}{device.serial_number ? <div className="flex min-w-0 gap-2"><dt className="shrink-0 font-medium">Serial:</dt><dd className="truncate">{device.serial_number}</dd></div> : null}</dl>{canReport ? <div className="mt-4">{devicePendingIssues.length ? <p className="text-sm font-semibold text-amber-800">Issue pending{anotherTypeAvailable ? " · Report another" : ""}</p> : null}{anotherTypeAvailable ? <Link className="inline-flex min-h-11 items-center font-semibold text-brand" href={`/student/devices/${device.device_id}/issues/new`}>{devicePendingIssues.length ? "View issue options" : "Report an issue"}</Link> : null}</div> : null}</article>;
          })}</div> : <p className="mt-4 text-sm text-neutral-600">No devices are registered to your account.</p>}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div><h2 className="text-lg font-semibold text-neutral-950">Open requests</h2><p className="mt-1 text-sm text-neutral-600">Requests waiting for staff review.</p></div>
          {pendingRegistrations.length || pendingIssues.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{pendingRegistrations.map((request) => <article className="min-w-0 rounded-lg border border-neutral-200 p-4" key={request.request_id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{request.manufacturer} {request.model}</p><p className="mt-1 text-sm text-neutral-600">Device registration</p></div><span className={`${badgeClass} ${registrationBadgeClasses.pending}`}>Pending verification</span></div><p className="mt-3 text-sm text-neutral-600">{deviceTypeLabels[request.device_type]} / {request.color}</p><p className="mt-1 text-xs text-neutral-500">Submitted {formatDateInTimeZone(request.submitted_at, school.timezone)}</p></article>)}{pendingIssues.map((request) => <article className="min-w-0 rounded-lg border border-neutral-200 p-4" key={request.request_id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{request.manufacturer} {request.model}</p><p className="mt-1 text-sm text-neutral-600">{issueTypeLabels[request.request_type]}</p></div><span className={`${badgeClass} ${issueStatusBadgeClasses.pending}`}>{issueStatusLabels.pending}</span></div><p className="mt-3 text-xs text-neutral-500">Submitted {formatDateInTimeZone(request.submitted_at, school.timezone)}</p></article>)}</div> : <p className="mt-3 text-sm text-neutral-600">Nothing is waiting for staff review.</p>}
        </section>

        {historyCount ? <details className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer font-semibold text-neutral-950">View request history ({historyCount})</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{registrationHistory.map((request) => <article className="rounded-lg border border-neutral-200 p-4" key={request.request_id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{request.manufacturer} {request.model}</p><p className="mt-1 text-sm text-neutral-600">Device registration</p></div><span className={`${badgeClass} ${registrationBadgeClasses[request.status]}`}>{request.status === "approved" ? "Approved" : "Rejected"}</span></div><p className="mt-3 text-xs text-neutral-500">Submitted {formatDateInTimeZone(request.submitted_at, school.timezone)}</p>{request.review_note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-600">Staff feedback: {request.review_note}</p> : null}</article>)}{issueHistory.map((request) => <article className="rounded-lg border border-neutral-200 p-4" key={request.request_id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{request.manufacturer} {request.model}</p><p className="mt-1 text-sm text-neutral-600">{issueTypeLabels[request.request_type]}</p></div><span className={`${badgeClass} ${issueStatusBadgeClasses[request.status]}`}>{issueStatusLabels[request.status]}</span></div><p className="mt-3 text-xs text-neutral-500">Submitted {formatDateInTimeZone(request.submitted_at, school.timezone)}</p>{request.review_note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-600">Staff feedback: {request.review_note}</p> : null}</article>)}</div></details> : null}
      </div>
    </main>
  );
}
