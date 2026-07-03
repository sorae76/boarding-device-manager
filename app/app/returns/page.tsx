import { recordReturnEventAction } from "@/lib/devices/actions";
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
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <form action={recordReturnEventAction} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-neutral-700">QR token, device ID, asset tag, or serial number</span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                defaultValue={searchParams?.lookup ?? ""}
                name="lookup"
                required
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-neutral-700">Action</span>
              <select
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                defaultValue="returned"
                name="action"
              >
                <option value="returned">Returned</option>
                <option value="checked_out">Checked out</option>
                <option value="marked_missing">Marked missing</option>
                <option value="exception">Exception</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-neutral-700">Method</span>
              <select
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                defaultValue="qr_scan"
                name="method"
              >
                <option value="qr_scan">QR scan</option>
                <option value="manual">Manual</option>
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-neutral-700">Notes</span>
              <textarea
                className="min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                name="notes"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              type="submit"
            >
              Record event
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
