export type DeviceCustodyStatus = "checked_out" | "returned" | "inactive" | "lost";

export type DeviceCustodyEventAction =
  | "returned"
  | "checked_out"
  | "marked_missing"
  | "exception";

export type DeviceCustodyEventMethod = "qr_scan" | "manual";

export type DeviceType = "phone" | "tablet" | "laptop" | "watch" | "other";

export type StudentSummary = {
  id: string;
  student_number: string | null;
  first_name: string;
  last_name: string;
  grade_level: string | null;
};

export type CustodyDevice = {
  id: string;
  school_id: string;
  student_id: string;
  device_type: DeviceType;
  manufacturer: string;
  model: string;
  color: string;
  serial_number: string | null;
  asset_tag: string | null;
  qr_token: string;
  status: DeviceCustodyStatus;
  return_due_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  students: StudentSummary | null;
};

export type CustodyEvent = {
  id: string;
  school_id: string;
  device_id: string;
  student_id: string | null;
  action: DeviceCustodyEventAction;
  method: DeviceCustodyEventMethod;
  performed_by_user_id: string;
  performed_at: string;
  notes: string | null;
  device_custody_devices: Pick<
    CustodyDevice,
    "id" | "manufacturer" | "model" | "asset_tag" | "qr_token" | "device_type"
  > | null;
  students: StudentSummary | null;
};

export type DashboardDeviceCounts = {
  registeredDevices: number;
  checkedOutDevices: number;
  returnedToday: number;
  pendingOrMissing: number;
  pendingNotices: number;
};

export type DeviceCustodyNoticeStatus =
  | "pending"
  | "reviewed"
  | "excused"
  | "violation_foundation";

export type DevicePass = {
  student_first_name: string;
  student_last_name: string;
  device_type: DeviceType;
  manufacturer: string;
  model: string;
  status: DeviceCustodyStatus;
  return_due_at: string | null;
  qr_token: string;
};

export type CustodyNotice = {
  id: string;
  school_id: string;
  device_id: string;
  student_id: string | null;
  notice_type: "post_return_app_activity";
  status: DeviceCustodyNoticeStatus;
  reason: string;
  occurred_at: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  device_custody_devices: Pick<
    CustodyDevice,
    "id" | "manufacturer" | "model" | "asset_tag" | "qr_token" | "device_type"
  > | null;
  students: StudentSummary | null;
};
