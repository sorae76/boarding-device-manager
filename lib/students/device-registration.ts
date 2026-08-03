import type { DeviceType } from "@/lib/devices/types";

export const studentRegistrationDeviceTypes: DeviceType[] = [
  "phone", "tablet", "laptop", "watch", "other"
];

export const studentRegistrationLimits = {
  manufacturer: 100,
  model: 100,
  color: 50,
  serialNumber: 200,
  studentNote: 1000
} as const;

export type StudentDeviceRegistrationInput = {
  deviceType: string;
  manufacturer: string;
  model: string;
  color: string;
  serialNumber: string;
  studentNote: string;
};

export type ValidStudentDeviceRegistrationInput = Omit<StudentDeviceRegistrationInput, "deviceType"> & {
  deviceType: DeviceType;
};

export function normalizeStudentDeviceRegistrationInput(
  input: StudentDeviceRegistrationInput
): StudentDeviceRegistrationInput {
  return {
    deviceType: input.deviceType.trim(),
    manufacturer: input.manufacturer.trim(),
    model: input.model.trim(),
    color: input.color.trim(),
    serialNumber: input.serialNumber.trim(),
    studentNote: input.studentNote.trim()
  };
}

export function validateStudentDeviceRegistrationInput(
  input: StudentDeviceRegistrationInput
): { input?: ValidStudentDeviceRegistrationInput; error?: string } {
  const normalized = normalizeStudentDeviceRegistrationInput(input);

  if (!studentRegistrationDeviceTypes.includes(normalized.deviceType as DeviceType)) {
    return { error: "Choose a valid device type." };
  }

  const required: Array<[keyof StudentDeviceRegistrationInput, string]> = [
    ["manufacturer", "Manufacturer"], ["model", "Model"],
    ["color", "Color"], ["serialNumber", "Serial number"]
  ];
  for (const [key, label] of required) {
    if (!normalized[key]) return { error: `${label} is required.` };
  }

  const lengths: Array<[keyof typeof studentRegistrationLimits, keyof StudentDeviceRegistrationInput, string]> = [
    ["manufacturer", "manufacturer", "Manufacturer"],
    ["model", "model", "Model"], ["color", "color", "Color"],
    ["serialNumber", "serialNumber", "Serial number"],
    ["studentNote", "studentNote", "Student note"]
  ];
  for (const [limitKey, inputKey, label] of lengths) {
    if (normalized[inputKey].length > studentRegistrationLimits[limitKey]) {
      return { error: `${label} must be ${studentRegistrationLimits[limitKey]} characters or fewer.` };
    }
  }

  return { input: normalized as ValidStudentDeviceRegistrationInput };
}

export function studentDeviceRegistrationError(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("student_registration_duplicate") || normalized.includes("23505")) {
    return "A device with that serial number is already registered or awaiting verification.";
  }
  if (normalized.includes("student_registration_invalid_input")) {
    return "Check the device details and try again.";
  }
  if (normalized.includes("student_registration_auth_required") || normalized.includes("student_registration_identity_invalid")) {
    return "Your student account could not be verified. Sign in again and try once more.";
  }
  return "The registration request could not be submitted.";
}
