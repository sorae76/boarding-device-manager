import Link from "next/link";
import { notFound } from "next/navigation";

import { transitionDeviceLifecycleAction } from "@/lib/devices/actions";
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
import type {
  CustodyDevice,
  DeviceCustodyStatus,
  DeviceLifecycleTransition
} from "@/lib/devices/types";

export const dynamic = "force-dynamic";

type DeviceDetailPageProps = {
  params: {
    deviceId: string;
  };
};

type LifecycleAction = {
  description: string;
  noteRequired?: boolean;
  submitLabel: string;
  transition: DeviceLifecycleTransition;
};

function isLifecycleAdmin(effectiveRole: string) {
  return effectiveRole === "super_admin" || effectiveRole === "school_admin";
}

function lifecycleActionsForStatus(
  status: DeviceCustodyStatus,
  isAdmin: boolean
): LifecycleAction[] {
  const inactiveAction: LifecycleAction | null = isAdmin
    ? {
        description: "Admin maintenance only. Requires a note and creates an exception event.",
        noteRequired: true,
        submitLabel: "Set inactive",
        transition: "set_inactive"
      }
    : null;

  if (status === "checked_out") {
    return [
      {
        description: "Student returned the device to school storage.",
        submitLabel: "Check in / Return to school",
        transition: "check_in"
      },
      {
        description: "Device is not currently accounted for.",
        submitLabel: "Mark missing",
        transition: "mark_missing"
      },
      ...(inactiveAction ? [inactiveAction] : [])
    ];
  }

  if (status === "returned") {
    return [
      {
        description: "Release the checked-in device back to the student.",
        submitLabel: "Check out / Release to student",
        transition: "check_out"
      },
      {
        description: "Device is missing from school storage.",
        submitLabel: "Mark missing",
        transition: "mark_missing"
      },
      ...(inactiveAction ? [inactiveAction] : [])
    ];
  }

  if (status === "lost") {
    return [
      {
        description: "Missing device was found and returned to school storage.",
        submitLabel: "Check in / Found and returned",
        transition: "check_in"
      },
      ...(inactiveAction ? [inactiveAction] : [])
    ];
  }

  return [];
}

function LifecycleActionForm({
  action,
  device
}: {
  action: LifecycleAction;
  device: CustodyDevice;
}) {
  return (
    <form action={transitionDeviceLifecycleAction} className="space-y-3 rounded-md border border-neutral-200 p-4">
      <input name="deviceId" type="hidden" value={device.id} />
      <input name="transition" type="hidden" value={action.transition} />
      <div>
        <p className="text-sm font-semibold text-neutral-950">{action.submitLabel}</p>
        <p className="mt-1 text-sm leading-5 text-neutral-600">{action.description}</p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">
          Notes{action.noteRequired ? " (required)" : " (optional)"}
        </span>
        <textarea
          className="min-h-20 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          name="notes"
          required={action.noteRequired}
        />
      </label>
      <button
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        type="submit"
      >
        {action.submitLabel}
      </button>
    </form>
  );
}

export default async function DeviceDetailPage({ params }: DeviceDetailPageProps) {
  const context = await requireDeviceWorkflowContext();
  const device = await getDevice(context, params.deviceId);

  if (!device) {
    notFound();
  }

  const events = await listDeviceEvents(context, device.id);
  const lifecycleActions = lifecycleActionsForStatus(
    device.status,
    isLifecycleAdmin(context.effectiveRole)
  );

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
          <Link
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            href={`/device-pass/${device.qr_token}`}
          >
            Pass
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

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Lifecycle actions</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              Record check-in, release, missing, and maintenance changes. These actions create
              custody events and use the existing device status workflow.
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
            {statusLabels[device.status]}
          </span>
        </div>

        {lifecycleActions.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {lifecycleActions.map((action) => (
              <LifecycleActionForm
                action={action}
                device={device}
                key={action.transition}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
            This device is inactive. Normal check-in and check-out are disabled for Phase 3A.
          </div>
        )}

        {!isLifecycleAdmin(context.effectiveRole) && device.status !== "inactive" ? (
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Setting a device inactive is restricted to school admins because the current schema has
            no inactive custody event type.
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Custody log</h2>
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
                  No custody events have been recorded for this device.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
