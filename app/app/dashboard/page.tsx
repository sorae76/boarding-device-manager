import Link from "next/link";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { getDashboardStudentCustody } from "@/lib/devices/data";
import { studentName } from "@/lib/devices/format";
import type { StudentCustodyStatus } from "@/lib/devices/types";

export const dynamic = "force-dynamic";

const statusLabels: Record<StudentCustodyStatus, string> = {
  complete: "Complete",
  pending: "Pending",
  missing: "Missing",
  no_devices: "No devices"
};

const statusStyles: Record<StudentCustodyStatus, string> = {
  complete: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  missing: "bg-rose-50 text-rose-700",
  no_devices: "bg-neutral-100 text-neutral-700"
};

export default async function DashboardPage() {
  const context = await requireDeviceWorkflowContext();
  const custody = await getDashboardStudentCustody(context);
  const cards = [
    {
      title: "Students with devices",
      value: custody.studentsWithDevices.toString(),
      detail: "Active students with at least one custody device."
    },
    {
      title: "Complete / all returned",
      value: custody.completeStudents.toString(),
      detail: "Students with no devices out and no missing devices."
    },
    {
      title: "Pending / with student",
      value: custody.pendingStudents.toString(),
      detail: "Students with at least one device still with them."
    },
    {
      title: "Missing devices",
      value: custody.missingDevices.toString(),
      detail: "Lost devices across the current school."
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-brand">Dorm Staff Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
          {context.currentSchool.name} student custody
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          Review each student&apos;s assigned devices, what is still with them, what is checked in, and
          what needs follow-up.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            href="/app/devices"
          >
            Open registry
          </Link>
          <Link
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            href="/app/returns"
          >
            Record return
          </Link>
          <Link
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            href="/app/notices"
          >
            Review notices
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <article
            className="min-h-[140px] rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
            key={card.title}
          >
            <p className="text-sm font-medium text-neutral-600">{card.title}</p>
            <p className="mt-3 text-2xl font-semibold text-neutral-950">{card.value}</p>
            <p className="mt-3 text-sm leading-5 text-neutral-500">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Student custody</h2>
        </div>
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Total devices</th>
              <th className="px-4 py-3 font-semibold">With student</th>
              <th className="px-4 py-3 font-semibold">Checked in</th>
              <th className="px-4 py-3 font-semibold">Missing</th>
              <th className="px-4 py-3 font-semibold">Inactive</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {custody.studentSummaries.map((summary) => (
              <tr key={summary.student.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-neutral-950">{studentName(summary.student)}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {summary.student.student_number ?? "No student number"}
                    {summary.student.grade_level ? ` / Grade ${summary.student.grade_level}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-neutral-700">{summary.totalDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{summary.checkedOutDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{summary.returnedDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{summary.lostDevices}</td>
                <td className="px-4 py-3 text-neutral-700">{summary.inactiveDevices}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      statusStyles[summary.status]
                    }`}
                  >
                    {statusLabels[summary.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link className="font-semibold text-brand" href="/app/devices">
                    View devices
                  </Link>
                </td>
              </tr>
            ))}
            {custody.studentSummaries.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500" colSpan={8}>
                  No active students are available for this school.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
