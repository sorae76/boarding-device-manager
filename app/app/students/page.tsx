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

export default async function StudentsPage() {
  const context = await requireDeviceWorkflowContext();
  const custody = await getDashboardStudentCustody(context);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Students</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Students</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          View each student&apos;s assigned device custody status.
        </p>
      </div>

      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
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
                  <span className="text-sm font-medium text-neutral-500">Details coming soon</span>
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
