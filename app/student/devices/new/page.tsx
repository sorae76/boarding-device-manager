import StudentDeviceRegistrationForm from "@/app/student/devices/new/student-device-registration-form";
import { requireStudentPortalContext } from "@/lib/students/portal";

export const dynamic = "force-dynamic";

export default async function NewStudentDevicePage() {
  await requireStudentPortalContext();
  return <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 sm:py-10"><div className="mx-auto max-w-xl"><section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-sm font-semibold text-brand">Student device registration</p><h1 className="mt-1 text-2xl font-semibold text-neutral-950">Add a device</h1><p className="mt-2 text-sm leading-6 text-neutral-600">Submit your device for staff verification. It will not be part of the school custody registry until it is approved.</p><div className="mt-6"><StudentDeviceRegistrationForm /></div></section></div></main>;
}
