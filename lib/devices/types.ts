export type DeviceCustodyStatus = "checked_out" | "returned" | "inactive" | "lost";

export type DeviceRegistryAttention = "overdue";

export type DeviceRegistryFilters = {
  attention?: DeviceRegistryAttention;
  status?: DeviceCustodyStatus;
};

export type DeviceCustodyEventAction =
  | "returned"
  | "checked_out"
  | "marked_missing"
  | "exception";

export type DeviceCustodyEventMethod = "qr_scan" | "manual";

export type DeviceLifecycleTransition =
  | "check_in"
  | "check_out"
  | "mark_missing"
  | "set_inactive";

export type DeviceCustodyTransitionOutcome =
  | "applied"
  | "stale_status"
  | "not_authorized"
  | "not_available";

export type DeviceCustodyTransitionResult = {
  outcome: DeviceCustodyTransitionOutcome;
  event_id: string | null;
  device_id: string | null;
  previous_status: DeviceCustodyStatus | null;
  current_status: DeviceCustodyStatus | null;
  performed_at: string | null;
};

export type DeviceCustodyOperation =
  | "return"
  | "release"
  | "mark_missing"
  | "recover_missing";

export type DeviceType = "phone" | "tablet" | "laptop" | "watch" | "other";

export type DeviceRegistrationStatus = "pending" | "approved" | "rejected";
export type DeviceIssueStatus = "pending" | "approved" | "rejected";
export type DeviceIssueType = "lost" | "broken" | "disposal";
export type DeviceIssueResolution = "lost_marked_missing" | "broken_exception" | "disposal_inactivated";
export type StaffDeviceIssueRequest = {
  request_id: string; student_id: string; student_name: string; student_number: string | null;
  residence_name: string | null; device_id: string; device_type: DeviceType;
  manufacturer: string; model: string; color: string; serial_number: string | null;
  asset_tag: string | null; current_custody_status: DeviceCustodyStatus;
  device_status_at_submission: DeviceCustodyStatus; request_type: DeviceIssueType;
  student_reason: string; status: DeviceIssueStatus; submitted_at: string;
  reviewed_at: string | null; review_note: string | null; resolution: DeviceIssueResolution | null;
};
export type DeviceIssueReviewActionState = { status: "idle" | "error"; message: string };

export type StaffDeviceRegistrationRequest = {
  request_id: string;
  student_name: string;
  student_number: string | null;
  residence_name: string | null;
  device_type: DeviceType;
  manufacturer: string;
  model: string;
  color: string;
  serial_number: string;
  submitted_at: string;
  status: "pending";
};

export type StaffDeviceRegistrationDetail = {
  request_id: string;
  school_id: string;
  student_id: string;
  student_name: string;
  student_number: string | null;
  residence_name: string | null;
  device_type: DeviceType;
  manufacturer: string;
  model: string;
  color: string;
  serial_number: string;
  student_note: string | null;
  status: DeviceRegistrationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  approved_device_id: string | null;
};

export type RegistrationReviewActionState = {
  status: "idle" | "error";
  message: string;
};

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
  withStudentsNow: number;
  inDeviceLocker: number;
  overdueReturns: number;
  missingLost: number;
  brokenUnusable: number;
  pendingNotices: number;
};

export type StudentCustodyStatus = "complete" | "pending" | "missing" | "no_devices";

export type StudentCustodySummary = {
  student: StudentSummary;
  totalDevices: number;
  checkedOutDevices: number;
  returnedDevices: number;
  lostDevices: number;
  inactiveDevices: number;
  status: StudentCustodyStatus;
};

export type DashboardStudentCustody = {
  studentsWithDevices: number;
  completeStudents: number;
  pendingStudents: number;
  missingDevices: number;
  studentSummaries: StudentCustodySummary[];
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
