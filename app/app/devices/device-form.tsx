import Link from "next/link";

import { saveDeviceAction } from "@/lib/devices/actions";
import {
  deviceTypeLabels,
  formatForDateTimeInput,
  statusLabels,
  studentName
} from "@/lib/devices/format";
import type { CustodyDevice, DeviceCustodyStatus, DeviceType, StudentSummary } from "@/lib/devices/types";

const deviceTypes: DeviceType[] = ["phone", "tablet", "laptop", "watch", "other"];
const statuses: DeviceCustodyStatus[] = ["checked_out", "returned", "inactive", "lost"];

type DeviceFormProps = {
  cancelHref?: string;
  device?: CustodyDevice;
  students: StudentSummary[];
};

export default function DeviceForm({ cancelHref, device, students }: DeviceFormProps) {
  return (
    <form action={saveDeviceAction} className="space-y-5">
      {device ? <input name="deviceId" type="hidden" value={device.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Student</span>
          <select
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            defaultValue={device?.student_id ?? ""}
            name="studentId"
            required
          >
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {studentName(student)}
                {student.student_number ? ` (${student.student_number})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Status</span>
          <select
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            defaultValue={device?.status ?? "checked_out"}
            name="status"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Device type</span>
          <select
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            defaultValue={device?.device_type ?? "phone"}
            name="deviceType"
          >
            {deviceTypes.map((deviceType) => (
              <option key={deviceType} value={deviceType}>
                {deviceTypeLabels[deviceType]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Return due</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={formatForDateTimeInput(device?.return_due_at ?? null)}
            name="returnDueAt"
            type="datetime-local"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Manufacturer</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.manufacturer ?? ""}
            name="manufacturer"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Model</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.model ?? ""}
            name="model"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Color</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.color ?? ""}
            name="color"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Asset tag</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.asset_tag ?? ""}
            name="assetTag"
          />
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-neutral-700">Serial number</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.serial_number ?? ""}
            name="serialNumber"
          />
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-neutral-700">Notes</span>
          <textarea
            className="min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={device?.notes ?? ""}
            name="notes"
          />
        </label>
      </div>

      <div className="flex justify-end gap-3">
        {cancelHref ? (
          <Link
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            href={cancelHref}
          >
            Cancel
          </Link>
        ) : null}
        <button
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          type="submit"
        >
          {device ? "Save device" : "Create device"}
        </button>
      </div>
    </form>
  );
}
