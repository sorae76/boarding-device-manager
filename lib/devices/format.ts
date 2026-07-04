import type {
  CustodyDevice,
  DeviceCustodyEventAction,
  DeviceCustodyEventMethod,
  DeviceCustodyNoticeStatus,
  DeviceCustodyStatus,
  DeviceType,
  StudentSummary
} from "@/lib/devices/types";

export const deviceTypeLabels: Record<DeviceType, string> = {
  phone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  watch: "Watch",
  other: "Other"
};

export const statusLabels: Record<DeviceCustodyStatus, string> = {
  checked_out: "Checked out",
  returned: "Returned",
  inactive: "Inactive",
  lost: "Lost"
};

export const actionLabels: Record<DeviceCustodyEventAction, string> = {
  returned: "Returned",
  checked_out: "Checked out",
  marked_missing: "Marked missing",
  exception: "Exception"
};

export const methodLabels: Record<DeviceCustodyEventMethod, string> = {
  qr_scan: "QR scan",
  manual: "Manual"
};

export const noticeStatusLabels: Record<DeviceCustodyNoticeStatus, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  excused: "Excused",
  violation_foundation: "Violation foundation"
};

export function studentName(student: StudentSummary | null) {
  if (!student) {
    return "Unassigned";
  }

  return `${student.last_name}, ${student.first_name}`;
}

export function deviceName(device: Pick<CustodyDevice, "manufacturer" | "model" | "asset_tag">) {
  return [device.manufacturer, device.model].filter(Boolean).join(" ") || device.asset_tag || "Device";
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatForDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function isPastDue(device: Pick<CustodyDevice, "status" | "return_due_at">) {
  return (
    device.status === "checked_out" &&
    Boolean(device.return_due_at) &&
    new Date(device.return_due_at as string).getTime() < Date.now()
  );
}
