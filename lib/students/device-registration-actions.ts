"use server";

import { revalidatePath } from "next/cache";

import { requireStudentPortalContext } from "@/lib/students/portal";
import {
  studentDeviceRegistrationError,
  validateStudentDeviceRegistrationInput
} from "@/lib/students/device-registration";
import { createClient } from "@/lib/supabase/server";

export type StudentDeviceRegistrationState = {
  status: "idle" | "success" | "error";
  message: string;
};

function allowedText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function submitStudentDeviceRegistrationAction(
  _previousState: StudentDeviceRegistrationState,
  formData: FormData
): Promise<StudentDeviceRegistrationState> {
  try {
    await requireStudentPortalContext();
    const validation = validateStudentDeviceRegistrationInput({
      deviceType: allowedText(formData, "deviceType"),
      manufacturer: allowedText(formData, "manufacturer"),
      model: allowedText(formData, "model"),
      color: allowedText(formData, "color"),
      serialNumber: allowedText(formData, "serialNumber"),
      studentNote: allowedText(formData, "studentNote")
    });

    if (!validation.input) {
      return { status: "error", message: validation.error ?? "Check the device details." };
    }

    const input = validation.input;
    const { error } = await createClient().rpc(
      "submit_current_student_device_registration",
      {
        target_device_type: input.deviceType,
        target_manufacturer: input.manufacturer,
        target_model: input.model,
        target_color: input.color,
        target_serial_number: input.serialNumber,
        target_student_note: input.studentNote || null
      }
    );

    if (error) {
      return { status: "error", message: studentDeviceRegistrationError(error.message) };
    }

    revalidatePath("/student");
    return { status: "success", message: "Your device registration was submitted for verification." };
  } catch {
    return { status: "error", message: "The registration request could not be submitted." };
  }
}
