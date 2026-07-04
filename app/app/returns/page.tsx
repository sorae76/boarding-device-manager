import ReturnScanner from "@/app/app/returns/return-scanner";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";

export const dynamic = "force-dynamic";

type ReturnPageProps = {
  searchParams?: {
    lookup?: string;
  };
};

export default async function ReturnPage({ searchParams }: ReturnPageProps) {
  await requireDeviceWorkflowContext();

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Return Scan / Manual Return</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Confirm device return</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          Use the camera scanner for student device pass QR codes. Manual lookup remains available
          for fallback. This records app QR activity only, not all phone activity.
        </p>
      </div>

      <ReturnScanner initialLookup={searchParams?.lookup} />
    </div>
  );
}
