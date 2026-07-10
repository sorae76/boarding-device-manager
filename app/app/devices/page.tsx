import Link from "next/link";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { listDevices } from "@/lib/devices/data";
import {
  deviceName,
  deviceTypeLabels,
  formatDateTime,
  isPastDue,
  statusLabels,
  studentName
} from "@/lib/devices/format";
import type {
  DeviceCustodyStatus,
  DeviceRegistryAttention,
  DeviceRegistryFilters
} from "@/lib/devices/types";

export const dynamic = "force-dynamic";

const statusFilters: DeviceCustodyStatus[] = ["checked_out", "returned", "inactive", "lost"];
const filterLabels: Record<DeviceCustodyStatus | DeviceRegistryAttention, string> = {
  checked_out: "With students now",
  returned: "In device locker",
  inactive: "Broken / unusable",
  lost: "Missing / lost",
  overdue: "Overdue returns"
};

type DeviceRegistryPageProps = {
  searchParams?: {
    attention?: string | string[];
    status?: string | string[];
  };
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getFilters(searchParams: DeviceRegistryPageProps["searchParams"]): DeviceRegistryFilters {
  const attention = firstParam(searchParams?.attention);
  const status = firstParam(searchParams?.status);

  if (attention === "overdue") {
    return { attention };
  }

  if (status && statusFilters.includes(status as DeviceCustodyStatus)) {
    return { status: status as DeviceCustodyStatus };
  }

  return {};
}

function getFilterLabel(filters: DeviceRegistryFilters) {
  if (filters.attention) {
    return filterLabels[filters.attention];
  }

  if (filters.status) {
    return filterLabels[filters.status];
  }

  return null;
}

export default async function DeviceRegistryPage({ searchParams }: DeviceRegistryPageProps) {
  const context = await requireDeviceWorkflowContext();
  const filters = getFilters(searchParams);
  const activeFilterLabel = getFilterLabel(filters);
  const devices = await listDevices(context, filters);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand">Device Registry</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Registered Devices</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Manage registered student devices, CSV import/export, and inventory details.
          </p>
          {activeFilterLabel ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                Filter: {activeFilterLabel}
              </span>
              <Link className="text-sm font-semibold text-brand" href="/app/devices">
                View all devices
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            href="/app/devices/template"
          >
            Download template
          </Link>
          <Link
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            href="/app/devices/import"
          >
            Import CSV
          </Link>
          <Link
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            href="/app/devices/export"
          >
            Export CSV
          </Link>
          <Link
            className="rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-dark"
            href="/app/devices/new"
          >
            Add device
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Device</th>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Return due</th>
              <th className="px-4 py-3 font-semibold">Identifier</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {devices.map((device) => (
              <tr key={device.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link className="font-semibold text-brand" href={`/app/devices/${device.id}`}>
                    {deviceName(device)}
                  </Link>
                  <p className="mt-1 text-xs text-neutral-500">
                    {deviceTypeLabels[device.device_type]} / {device.color}
                  </p>
                </td>
                <td className="px-4 py-3 text-neutral-700">{studentName(device.students)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
                    {statusLabels[device.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={isPastDue(device) ? "font-semibold text-brand" : "text-neutral-700"}>
                    {formatDateTime(device.return_due_at)}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {device.asset_tag ?? device.serial_number ?? device.qr_token}
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatDateTime(device.updated_at)}</td>
              </tr>
            ))}
            {devices.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500" colSpan={6}>
                  No devices are registered yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
