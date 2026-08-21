import RapidScanWorkstation from "@/app/app/rapid-scan/rapid-scan-workstation";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { listRapidScanStudents } from "@/lib/devices/data";

export const dynamic = "force-dynamic";

export default async function RapidScanPage() {
  const context = await requireDeviceWorkflowContext();
  const students = await listRapidScanStudents(context);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Dorm operations</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Rapid Scan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          Select morning release or evening return, find a student, and process each eligible
          device. Every change uses the residence-scoped custody workflow.
        </p>
      </div>

      <RapidScanWorkstation initialStudents={students} />
    </div>
  );
}
