import LogoutButton from "@/components/logout-button";
import { requireStudentPortalContext } from "@/lib/students/portal";
import type { DeviceCustodyStatus, DeviceType } from "@/lib/devices/types";

export const dynamic = "force-dynamic";

const deviceTypeLabels: Record<DeviceType, string> = {
  phone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  watch: "Watch",
  other: "Other"
};

const custodyLabels: Record<DeviceCustodyStatus, string> = {
  checked_out: "With you",
  returned: "In school storage",
  lost: "Missing",
  inactive: "Inactive"
};

export default async function StudentPortalPage() {
  const { devices, school, student } = await requireStudentPortalContext();

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-brand">{school.name}</p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-950">
              {student.first_name} {student.last_name}
            </h1>
            <div className="mt-2 space-y-1 text-sm text-neutral-600">
              {student.student_number ? <p>Student number: {student.student_number}</p> : null}
              {student.grade_level ? <p>Grade: {student.grade_level}</p> : null}
              <p>
                Primary residence: {student.primary_residence_name ?? "Unassigned"}
              </p>
            </div>
          </div>
          <LogoutButton />
        </header>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">My devices</h2>
          {devices.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {devices.map((device) => (
                <article
                  className="rounded-lg border border-neutral-200 p-4"
                  key={device.device_id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-neutral-950">
                        {device.manufacturer} {device.model}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {deviceTypeLabels[device.device_type]} · {device.color}
                      </p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
                      {custodyLabels[device.custody_status]}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-neutral-600">
                    {device.asset_tag ? (
                      <div className="flex gap-2">
                        <dt className="font-medium">Asset tag:</dt>
                        <dd>{device.asset_tag}</dd>
                      </div>
                    ) : null}
                    {device.serial_number ? (
                      <div className="flex gap-2">
                        <dt className="font-medium">Serial number:</dt>
                        <dd>{device.serial_number}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-600">
              No devices are registered to your account.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
