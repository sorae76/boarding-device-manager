import { redirect } from "next/navigation";

import { getDefaultAppPath } from "@/lib/auth/roles";
import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { DeviceCustodyStatus, DeviceType } from "@/lib/devices/types";

export type StudentPortalStudent = {
  student_id: string;
  school_name: string;
  student_number: string | null;
  first_name: string;
  last_name: string;
  grade_level: string | null;
  primary_residence_name: string | null;
  primary_residence_code: string | null;
};

export type StudentPortalDevice = {
  device_id: string;
  device_type: DeviceType;
  manufacturer: string;
  model: string;
  color: string;
  asset_tag: string | null;
  serial_number: string | null;
  custody_status: DeviceCustodyStatus;
};

export async function requireStudentPortalContext() {
  const context = await requireSessionContext();

  if (context.effectiveRole !== "student") {
    redirect(getDefaultAppPath(context));
  }

  const supabase = createClient();
  const { data: profileData, error: profileError } = await supabase.rpc(
    "get_current_student_portal_profile"
  );

  if (profileError || profileData?.length !== 1 || !context.currentSchool) {
    redirect("/login?error=session&reason=student_identity_link_invalid");
  }

  const { data: deviceData, error: deviceError } = await supabase.rpc(
    "list_current_student_portal_devices"
  );

  if (deviceError) {
    throw new Error("Could not load the student portal.");
  }

  return {
    context,
    school: { name: profileData[0].school_name },
    student: profileData[0] as StudentPortalStudent,
    devices: (deviceData ?? []) as StudentPortalDevice[]
  };
}
