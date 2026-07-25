import type { StudentCustodyStatus } from "@/lib/devices/types";

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
  school_email?: string | null;
  auth_user_id?: string | null;
};

export type StudentManagementRow = StudentResidenceRow & {
  student_number: string | null;
  first_name: string;
  last_name: string;
  grade_level: string | null;
  totalDevices: number;
  checkedOutDevices: number;
  returnedDevices: number;
  lostDevices: number;
  inactiveDevices: number;
  custodyStatus: StudentCustodyStatus;
  school_email?: string | null;
  auth_user_id?: string | null;
};

export type StudentActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
