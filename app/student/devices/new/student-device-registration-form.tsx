"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { colorOptions, deviceTypes } from "@/lib/devices/field-options";
import { deviceTypeLabels } from "@/lib/devices/format";
import {
  submitStudentDeviceRegistrationAction,
  type StudentDeviceRegistrationState
} from "@/lib/students/device-registration-actions";
import { studentRegistrationLimits } from "@/lib/students/device-registration";

const initialState: StudentDeviceRegistrationState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="min-h-11 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Submitting…" : "Submit registration"}</button>;
}

export default function StudentDeviceRegistrationForm() {
  const [state, action] = useFormState(submitStudentDeviceRegistrationAction, initialState);
  const fieldClass = "min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base sm:text-sm";

  if (state.status === "success") {
    return <div className="space-y-4"><p className="rounded-md bg-green-50 p-4 text-sm text-green-800">{state.message}</p><Link className="inline-flex min-h-11 items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" href="/student">Return to my devices</Link></div>;
  }

  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4">
        <label className="space-y-1 text-sm"><span className="font-medium text-neutral-700">Device type</span><select className={fieldClass} name="deviceType" required>{deviceTypes.map((type) => <option key={type} value={type}>{deviceTypeLabels[type]}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-neutral-700">Manufacturer</span><input className={fieldClass} maxLength={studentRegistrationLimits.manufacturer} name="manufacturer" required /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-neutral-700">Model</span><input className={fieldClass} maxLength={studentRegistrationLimits.model} name="model" required /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-neutral-700">Color</span><input className={fieldClass} list="student-device-colors" maxLength={studentRegistrationLimits.color} name="color" required /><datalist id="student-device-colors">{colorOptions.map((color) => <option key={color} value={color} />)}</datalist></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-neutral-700">Serial number</span><input className={fieldClass} maxLength={studentRegistrationLimits.serialNumber} name="serialNumber" required /><span className="block text-xs text-neutral-500">Enter the serial number exactly as shown on the device.</span></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-neutral-700">Student note (optional)</span><textarea className="min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-base sm:text-sm" maxLength={studentRegistrationLimits.studentNote} name="studentNote" /></label>
      </div>
      {state.status === "error" ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{state.message}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end"><Link className="min-h-11 rounded-md border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-semibold text-neutral-700" href="/student">Cancel</Link><SubmitButton /></div>
    </form>
  );
}
