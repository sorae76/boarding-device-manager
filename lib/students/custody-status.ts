export type StudentManagementCustodyStatus =
  | "no_devices"
  | "missing"
  | "mixed_custody"
  | "with_student"
  | "checked_in"
  | "inactive";

export type StudentManagementDeviceCounts = {
  totalDevices: number;
  checkedOutDevices: number;
  returnedDevices: number;
  lostDevices: number;
};

export function studentManagementCustodyStatus(
  counts: StudentManagementDeviceCounts
): StudentManagementCustodyStatus {
  if (counts.totalDevices === 0) {
    return "no_devices";
  }

  if (counts.lostDevices > 0) {
    return "missing";
  }

  if (counts.checkedOutDevices > 0 && counts.returnedDevices > 0) {
    return "mixed_custody";
  }

  if (counts.checkedOutDevices > 0) {
    return "with_student";
  }

  if (counts.returnedDevices > 0) {
    return "checked_in";
  }

  return "inactive";
}
