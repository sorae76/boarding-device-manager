import { notFound } from "next/navigation";
import { requireStudentPortalContext } from "@/lib/students/portal";
import StudentDeviceIssueForm from "./student-device-issue-form";

export const dynamic = "force-dynamic";

export default async function NewStudentDeviceIssuePage({ params }: { params: { deviceId: string } }) {
  const portal = await requireStudentPortalContext();
  const device = portal.devices.find((item) => item.device_id === params.deviceId);
  if (!device || !["checked_out", "returned"].includes(device.custody_status)) notFound();
  const pendingRequests = portal.issueRequests.filter(
    (request) => request.device_id === device.device_id && request.status === "pending"
  );
  return <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 sm:py-10"><div className="mx-auto max-w-xl"><section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-sm font-semibold text-brand">Student device support</p><h1 className="mt-1 text-2xl font-semibold">Report an issue</h1><p className="mt-2 text-sm text-neutral-600">{device.manufacturer} {device.model} / {device.color}</p><p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">Submitting a request does not immediately change the device custody or lifecycle status. Staff will review it first.</p><div className="mt-6"><StudentDeviceIssueForm deviceId={device.device_id} pendingRequests={pendingRequests} timeZone={portal.school.timezone} /></div></section></div></main>;
}
