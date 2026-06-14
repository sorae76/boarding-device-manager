import Link from "next/link";

import { getRoleLabel } from "@/lib/auth/roles";
import { requireSessionContext } from "@/lib/auth/session";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await requireSessionContext();

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-brand">OAc Device Management</p>
            <p className="text-xs text-neutral-500">
              {context.currentSchool?.name ?? "No school selected"} ·{" "}
              {getRoleLabel(context.effectiveRole)}
            </p>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
              href="/app/dashboard"
            >
              Dashboard
            </Link>
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
