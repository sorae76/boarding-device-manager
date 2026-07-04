import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getDevicePass, recordDevicePassOpen } from "@/lib/devices/data";
import { deviceTypeLabels, formatDateTime, statusLabels } from "@/lib/devices/format";
import { createQrSvg } from "@/lib/qr/svg";

export const dynamic = "force-dynamic";

type DevicePassPageProps = {
  params: {
    qrToken: string;
  };
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default async function DevicePassPage({ params }: DevicePassPageProps) {
  if (!isUuid(params.qrToken)) {
    notFound();
  }

  const pass = await getDevicePass(params.qrToken);

  if (!pass) {
    notFound();
  }

  await recordDevicePassOpen(params.qrToken);

  const headerList = headers();
  const host = headerList.get("host") ?? "";
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const passUrl = `${protocol}://${host}/device-pass/${pass.qr_token}`;
  const qrSvg = createQrSvg(passUrl);

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-6">
      <section className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-brand">Student Device Pass</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
          {pass.student_last_name}, {pass.student_first_name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Show this QR code to Dorm Staff during return. This page uses a device token link for the
          MVP because student authentication is not implemented yet.
        </p>

        <div
          className="mx-auto mt-5 w-full max-w-[320px]"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <dl className="mt-5 grid gap-3 text-sm">
          <div>
            <dt className="font-medium text-neutral-500">Device</dt>
            <dd className="mt-1 text-neutral-950">
              {deviceTypeLabels[pass.device_type]} / {pass.manufacturer} {pass.model}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Current status</dt>
            <dd className="mt-1 text-neutral-950">{statusLabels[pass.status]}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Return due</dt>
            <dd className="mt-1 text-neutral-950">{formatDateTime(pass.return_due_at)}</dd>
          </div>
        </dl>

        {pass.status === "returned" ? (
          <p className="mt-5 rounded-md border border-brand/30 bg-brand-soft p-3 text-sm leading-6 text-brand-dark">
            This device is already marked returned. Opening this pass after return records a staff
            notice for possible post-return app activity. This does not detect all phone activity.
          </p>
        ) : null}
      </section>
    </main>
  );
}
