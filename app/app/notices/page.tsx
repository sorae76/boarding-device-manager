import Link from "next/link";

import { reviewNoticeAction } from "@/lib/devices/actions";
import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { listNotices } from "@/lib/devices/data";
import {
  deviceName,
  formatDateTime,
  noticeStatusLabels,
  studentName
} from "@/lib/devices/format";
import type { DeviceCustodyNoticeStatus } from "@/lib/devices/types";

export const dynamic = "force-dynamic";

const reviewStatuses: DeviceCustodyNoticeStatus[] = [
  "reviewed",
  "excused",
  "violation_foundation"
];

export default async function NoticesPage() {
  const context = await requireDeviceWorkflowContext();
  const notices = await listNotices(context);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Device Notices</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Pending device notices</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          These notices are a foundation for reviewing possible post-return app activity. They are
          created when a returned device opens the student device pass page. This does not detect
          all phone activity.
        </p>
      </div>

      <div className="space-y-3">
        {notices.map((notice) => (
          <article
            className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
            key={notice.id}
          >
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-neutral-950">
                    Possible post-return app activity
                  </h2>
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
                    {noticeStatusLabels[notice.status]}
                  </span>
                </div>
                <p className="text-sm text-neutral-600">{notice.reason}</p>
                <dl className="grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <dt className="font-medium text-neutral-500">Device</dt>
                    <dd className="mt-1 text-neutral-950">
                      {notice.device_custody_devices ? (
                        <Link
                          className="font-semibold text-brand"
                          href={`/app/devices/${notice.device_custody_devices.id}`}
                        >
                          {deviceName(notice.device_custody_devices)}
                        </Link>
                      ) : (
                        "Device"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-neutral-500">Student</dt>
                    <dd className="mt-1 text-neutral-950">{studentName(notice.students)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-neutral-500">Time</dt>
                    <dd className="mt-1 text-neutral-950">{formatDateTime(notice.occurred_at)}</dd>
                  </div>
                </dl>
              </div>

              <form action={reviewNoticeAction} className="min-w-[240px] space-y-2">
                <input name="noticeId" type="hidden" value={notice.id} />
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-neutral-700">Review status</span>
                  <select
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                    defaultValue="reviewed"
                    name="status"
                  >
                    {reviewStatuses.map((status) => (
                      <option key={status} value={status}>
                        {noticeStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-neutral-700">Notes</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    name="reviewNotes"
                  />
                </label>
                <button
                  className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                  type="submit"
                >
                  Save review
                </button>
              </form>
            </div>
          </article>
        ))}

        {notices.length === 0 ? (
          <section className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500 shadow-sm">
            No device notices have been recorded yet.
          </section>
        ) : null}
      </div>
    </div>
  );
}
