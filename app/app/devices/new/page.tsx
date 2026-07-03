import Link from "next/link";

import DeviceForm from "@/app/app/devices/device-form";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { listStudents } from "@/lib/devices/data";

export const dynamic = "force-dynamic";

export default async function NewDevicePage() {
  const context = await requireDeviceWorkflowContext();
  const students = await listStudents(context);

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-medium text-brand" href="/app/devices">
          Back to registry
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Add device</h1>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <DeviceForm students={students} />
      </section>
    </div>
  );
}
