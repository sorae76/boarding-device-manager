import { requireSessionContext } from "@/lib/auth/session";
import { getRoleLabel } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await requireSessionContext();

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-brand">Admin / Settings</p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Settings placeholder</h1>
      <dl className="mt-5 grid gap-4 text-sm md:grid-cols-3">
        <div>
          <dt className="font-medium text-neutral-500">Signed in as</dt>
          <dd className="mt-1 text-neutral-950">{context.profile.email}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-500">Current role</dt>
          <dd className="mt-1 text-neutral-950">{getRoleLabel(context.effectiveRole)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-500">Current school</dt>
          <dd className="mt-1 text-neutral-950">
            {context.currentSchool?.name ?? "No active school"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
