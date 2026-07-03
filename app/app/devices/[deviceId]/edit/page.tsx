import Link from "next/link";
import { notFound } from "next/navigation";

import DeviceForm from "@/app/app/devices/device-form";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { getDevice, listStudents } from "@/lib/devices/data";
import { deviceName } from "@/lib/devices/format";

export const dynamic = "force-dynamic";

type EditDevicePageProps = {
  params: {
    deviceId: string;
  };
};

export default async function EditDevicePage({ params }: EditDevicePageProps) {
  const context = await requireDeviceWorkflowContext();
  const [device, students] = await Promise.all([
    getDevice(context, params.deviceId),
    listStudents(context)
  ]);

  if (!device) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-medium text-brand" href={`/app/devices/${device.id}`}>
          Back to device
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
          Edit {deviceName(device)}
        </h1>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <DeviceForm device={device} students={students} />
      </section>
    </div>
  );
}
