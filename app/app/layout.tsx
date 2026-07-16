import Link from "next/link";

import { getRoleLabel } from "@/lib/auth/roles";
import { requireSessionContext } from "@/lib/auth/session";
import { canAccessDeviceDashboard, canAccessDeviceWorkflows } from "@/lib/devices/access";
import { canReadResidences } from "@/lib/residences/access";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await requireSessionContext();
  const canUseDashboard = canAccessDeviceDashboard(context);
  const canUseDeviceWorkflows = canAccessDeviceWorkflows(context);
  const canUseResidences = canReadResidences(context);

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-brand">OAc Device Management</p>
            <p className="text-xs text-neutral-500">
              {context.currentSchool?.name ?? "No school selected"} /{" "}
              {getRoleLabel(context.effectiveRole)}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {canUseDashboard ? (
              <Link
                className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                href="/app/dashboard"
              >
                Dashboard
              </Link>
            ) : null}
            {canUseDeviceWorkflows ? (
              <>
                <Link
                  className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  href="/app/students"
                >
                  Students
                </Link>
                <Link
                  className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  href="/app/devices"
                >
                  Devices
                </Link>
              </>
            ) : null}
            {canUseResidences ? (
              <Link
                className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                href="/app/residences"
              >
                Residences
              </Link>
            ) : null}
            {canUseDeviceWorkflows ? (
              <>
                <Link
                  className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  href="/app/returns"
                >
                  Returns
                </Link>
                <Link
                  className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  href="/app/returns/log"
                >
                  Log
                </Link>
                <Link
                  className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  href="/app/notices"
                >
                  Notices
                </Link>
              </>
            ) : null}
            <Link
              className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
              href="/app/settings"
            >
              Settings
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
