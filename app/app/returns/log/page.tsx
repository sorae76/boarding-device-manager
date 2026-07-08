import Link from "next/link";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { listEvents } from "@/lib/devices/data";
import {
  actionLabels,
  deviceName,
  formatDateTime,
  methodLabels,
  studentName
} from "@/lib/devices/format";

export const dynamic = "force-dynamic";

export default async function ReturnLogPage() {
  const context = await requireDeviceWorkflowContext();
  const events = await listEvents(context);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand">Custody Log</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Recent custody events</h1>
        </div>
        <Link
          className="rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-dark"
          href="/app/returns"
        >
          Record return
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Device</th>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Staff</th>
              <th className="px-4 py-3 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-950">{actionLabels[event.action]}</td>
                <td className="px-4 py-3">
                  {event.device_custody_devices ? (
                    <Link
                      className="font-semibold text-brand"
                      href={`/app/devices/${event.device_custody_devices.id}`}
                    >
                      {deviceName(event.device_custody_devices)}
                    </Link>
                  ) : (
                    "Device"
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">{studentName(event.students)}</td>
                <td className="px-4 py-3 text-neutral-700">{methodLabels[event.method]}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                  {event.performed_by_user_id}
                </td>
                <td className="px-4 py-3 text-neutral-700">{formatDateTime(event.performed_at)}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500" colSpan={6}>
                  No return events have been recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
