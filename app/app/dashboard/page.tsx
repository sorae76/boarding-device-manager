import Link from "next/link";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { getDashboardDeviceCounts } from "@/lib/devices/data";

export const dynamic = "force-dynamic";

type DashboardCard = {
  detail: string;
  href?: string;
  state?: "normal" | "warning" | "disabled";
  title: string;
  value: string;
};

function cardStyles(state: DashboardCard["state"] = "normal") {
  if (state === "warning") {
    return "border-amber-200 bg-amber-50";
  }

  if (state === "disabled") {
    return "border-neutral-200 bg-neutral-50";
  }

  return "border-neutral-200 bg-white";
}

function DashboardCard({ card }: { card: DashboardCard }) {
  const content = (
    <>
      <p className="text-sm font-medium text-neutral-600">{card.title}</p>
      <p className="mt-3 text-2xl font-semibold text-neutral-950">{card.value}</p>
      <p className="mt-3 text-sm leading-5 text-neutral-500">{card.detail}</p>
    </>
  );
  const className = `block min-h-[142px] rounded-lg border p-5 shadow-sm ${cardStyles(card.state)}`;

  if (card.href) {
    return (
      <Link className={`${className} hover:border-brand hover:bg-neutral-50`} href={card.href}>
        {content}
      </Link>
    );
  }

  return <article className={className}>{content}</article>;
}

export default async function DashboardPage() {
  const context = await requireDeviceWorkflowContext();
  const counts = await getDashboardDeviceCounts(context);
  const locationCards: DashboardCard[] = [
    {
      title: "Total registered devices",
      value: counts.registeredDevices.toString(),
      detail: "All custody devices registered for the current school.",
      href: "/app/devices"
    },
    {
      title: "With students now",
      value: counts.withStudentsNow.toString(),
      detail: "Devices currently released to students.",
      href: "/app/devices?status=checked_out"
    },
    {
      title: "In device locker",
      value: counts.inDeviceLocker.toString(),
      detail: "Devices checked in to school storage.",
      href: "/app/devices?status=returned"
    },
    {
      title: "Overdue returns",
      value: counts.overdueReturns.toString(),
      detail: "Released devices past their return due time.",
      href: "/app/devices?attention=overdue",
      state: counts.overdueReturns > 0 ? "warning" : "normal"
    },
    {
      title: "Missing / lost",
      value: counts.missingLost.toString(),
      detail: "Devices marked missing or lost.",
      href: "/app/devices?status=lost",
      state: counts.missingLost > 0 ? "warning" : "normal"
    },
    {
      title: "Broken / unusable",
      value: counts.brokenUnusable.toString(),
      detail: "Devices stored as inactive until a dedicated status exists.",
      href: "/app/devices?status=inactive"
    },
    {
      title: "Pending notices",
      value: counts.pendingNotices.toString(),
      detail: "Post-return pass activity notices awaiting review.",
      href: "/app/notices",
      state: counts.pendingNotices > 0 ? "warning" : "normal"
    },
    {
      title: "Disposed / retired",
      value: "Not configured",
      detail: "The current schema has no disposed or retired device status.",
      state: "disabled"
    },
    {
      title: "WiFi control",
      value: "Not configured",
      detail: "No WiFi identifier or block/allow job schema exists yet.",
      state: "disabled"
    },
    {
      title: "Student self-registration",
      value: "Not configured",
      detail: "No student request or Gmail matching schema exists yet.",
      state: "disabled"
    },
    {
      title: "Staff approval requests",
      value: "Not configured",
      detail: "No device registration request workflow exists yet.",
      state: "disabled"
    }
  ];
  const attentionItems = [
    {
      label: "Overdue returns",
      value: counts.overdueReturns,
      href: "/app/devices?attention=overdue"
    },
    {
      label: "Missing / lost devices",
      value: counts.missingLost,
      href: "/app/devices?status=lost"
    },
    {
      label: "Broken / unusable devices",
      value: counts.brokenUnusable,
      href: "/app/devices?status=inactive"
    },
    {
      label: "Pending notices",
      value: counts.pendingNotices,
      href: "/app/notices"
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-brand">Device Location Control</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
          {context.currentSchool.name} device dashboard
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Monitor where student devices are right now, which devices need staff follow-up, and
          which control features still need schema support.
        </p>
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
          <Link
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            href="/app/students"
          >
            View all students
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">Device Location Overview</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Counts use the existing custody status fields for this school only.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {locationCards.map((card) => (
            <DashboardCard card={card} key={card.title} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Attention Needed</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Devices and notices that need staff review before the end of the return cycle.
            </p>
          </div>
          <Link className="text-sm font-semibold text-brand" href="/app/devices">
            View all devices
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {attentionItems.map((item) => (
            <Link
              className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-3 hover:border-brand hover:bg-neutral-50"
              href={item.href}
              key={item.label}
            >
              <span className="text-sm font-medium text-neutral-700">{item.label}</span>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  item.value > 0 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                {item.value}
              </span>
            </Link>
          ))}
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-sm font-medium text-neutral-700">WiFi block/allow failures</p>
            <p className="mt-1 text-sm text-neutral-500">Not configured until WiFi job schema exists.</p>
          </div>
        </div>
      </section>

    </div>
  );
}
