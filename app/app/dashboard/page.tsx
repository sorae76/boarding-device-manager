import Link from "next/link";

import { requireSessionContext } from "@/lib/auth/session";
import { canAccessDeviceWorkflows } from "@/lib/devices/access";
import type { DeviceWorkflowContext } from "@/lib/devices/access";
import { getDashboardDeviceCounts } from "@/lib/devices/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const context = await requireSessionContext();
  const canUseDevices = canAccessDeviceWorkflows(context);
  const workflowContext =
    canUseDevices && context.currentSchool ? (context as DeviceWorkflowContext) : null;
  const counts = workflowContext
    ? await getDashboardDeviceCounts(workflowContext)
    : {
        registeredDevices: 0,
        checkedOutDevices: 0,
        returnedToday: 0,
        pendingOrMissing: 0,
        pendingNotices: 0
      };
  const cards = [
    {
      title: "Registered devices",
      value: counts.registeredDevices.toString(),
      detail: "Devices currently in the custody registry."
    },
    {
      title: "Checked-out devices",
      value: counts.checkedOutDevices.toString(),
      detail: "Devices assigned out and not yet returned."
    },
    {
      title: "Returned today",
      value: counts.returnedToday.toString(),
      detail: "Return events recorded today."
    },
    {
      title: "Pending / missing",
      value: counts.pendingOrMissing.toString(),
      detail: "Checked-out devices past due plus lost devices."
    },
    {
      title: "Pending notices",
      value: counts.pendingNotices.toString(),
      detail: "Possible post-return app activity notices."
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-brand">Dorm Staff Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
          {context.currentSchool?.name ?? "School"} device operations
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          Track assigned student devices, return confirmations, and return exceptions through the
          protected custody workflow.
        </p>
        {workflowContext ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              href="/app/devices"
            >
              Open registry
            </Link>
            <Link
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
              href="/app/returns"
            >
              Record return
            </Link>
            <Link
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
              href="/app/notices"
            >
              Review notices
            </Link>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        {cards.map((card) => (
          <article
            className="min-h-[140px] rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
            key={card.title}
          >
            <p className="text-sm font-medium text-neutral-600">{card.title}</p>
            <p className="mt-3 text-2xl font-semibold text-neutral-950">{card.value}</p>
            <p className="mt-3 text-sm leading-5 text-neutral-500">{card.detail}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
