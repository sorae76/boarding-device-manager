import Link from "next/link";
import { notFound } from "next/navigation";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { getDevice, listDeviceEvents } from "@/lib/devices/data";
import {
  actionLabels,
  deviceName,
  deviceTypeLabels,
  formatDateTime,
  isPastDue,
  methodLabels,
  statusLabels,
  studentName
} from "@/lib/devices/format";

export const dynamic = "force-dynamic";

type DeviceDetailPageProps = {
  params: {
    deviceId: string;
  };
};

export default async function DeviceDetailPage({ params }: DeviceDetailPageProps) {
  const context = await requireDeviceWorkflowContext();
  const device = await getDevice(context, params.deviceId);

  if (!device) {
    notFound();
  }

  const events = await listDeviceEvents(context, device.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <Link className="text-sm font-medium text-brand" href="/app/devices">
            Back to registry
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">{deviceName(device)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {deviceTypeLabels[device.device_type]} / QR token {device.qr_token}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            href={`/app/devices/${device.id}/edit`}
          >
            Edit
          </Link>
          <Link
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            href={`/app/returns?lookup=${device.qr_token}`}
          >
            Return
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-neutral-500">Status</p>
          <p className="mt-2 text-lg font-semibold text-neutral-950">{statusLabels[device.status]}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-neutral-500">Student</p>
          <p className="mt-2 text-lg font-semibold text-neutral-950">{studentName(device.students)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-neutral-500">Return due</p>
          <p className={isPastDue(device) ? "mt-2 text-lg font-semibold text-brand" : "mt-2 text-lg font-semibold text-neutral-950"}>
            {formatDateTime(device.return_due_at)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-neutral-500">Asset tag</p>
          <p className="mt-2 text-lg font-semibold text-neutral-950">{device.asset_tag ?? "Not set"}</p>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Device details</h2>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <dt className="font-medium text-neutral-500">Manufacturer</dt>
            <dd className="mt-1 text-neutral-950">{device.manufacturer}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Model</dt>
            <dd className="mt-1 text-neutral-950">{device.model}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Color</dt>
            <dd className="mt-1 text-neutral-950">{device.color}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Serial number</dt>
            <dd className="mt-1 text-neutral-950">{device.serial_number ?? "Not set"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="font-medium text-neutral-500">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-neutral-950">{device.notes ?? "No notes"}</dd>
          </div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Return log</h2>
        </div>
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Staff</th>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3 font-medium text-neutral-950">{actionLabels[event.action]}</td>
                <td className="px-4 py-3 text-neutral-700">{methodLabels[event.method]}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                  {event.performed_by_user_id}
                </td>
                <td className="px-4 py-3 text-neutral-700">{formatDateTime(event.performed_at)}</td>
                <td className="px-4 py-3 text-neutral-500">{event.notes ?? ""}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500" colSpan={5}>
                  No return events have been recorded for this device.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
