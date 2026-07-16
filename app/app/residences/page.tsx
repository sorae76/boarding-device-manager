import { canManageResidences, requireResidenceContext } from "@/lib/residences/access";
import { listResidences } from "@/lib/residences/data";
import ResidenceManagement from "@/app/app/residences/residence-management";

export const dynamic = "force-dynamic";

export default async function ResidencesPage() {
  const context = await requireResidenceContext();
  const residences = await listResidences(context);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Residence Management</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Residences</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          Manage residence names, codes, and active status for the current school.
        </p>
      </div>

      <ResidenceManagement
        canManage={canManageResidences(context)}
        residences={residences}
      />
    </div>
  );
}
