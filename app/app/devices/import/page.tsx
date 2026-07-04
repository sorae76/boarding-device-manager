import Link from "next/link";

import DeviceImportForm from "@/app/app/devices/import/import-form";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";

export const dynamic = "force-dynamic";

export default async function DeviceImportPage() {
  await requireDeviceWorkflowContext();

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-medium text-brand" href="/app/devices">
          Back to registry
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Import devices</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Preview a CSV before importing device records for the current school.
        </p>
      </div>

      <DeviceImportForm />
    </div>
  );
}
