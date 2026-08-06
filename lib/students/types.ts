import type { StudentManagementCustodyStatus } from "@/lib/students/custody-status";

export type StudentResidence = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
};

export type StudentResidenceRow = {
  id: string;
  dorm_id: string | null;
  primaryResidence: StudentResidence | null;
  student_number: string | null;
  first_name: string;
  last_name: string;
  grade_level: string | null;
  status: "active" | "inactive";
  updated_at?: string;
  school_email?: string | null;
  auth_user_id?: string | null;
};

export type StudentManagementRow = StudentResidenceRow & {
  totalDevices: number;
  checkedOutDevices: number;
  returnedDevices: number;
  lostDevices: number;
  inactiveDevices: number;
  custodyStatus: StudentManagementCustodyStatus;
  school_email?: string | null;
  auth_user_id?: string | null;
};

export type StudentActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
