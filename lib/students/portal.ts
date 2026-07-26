import { redirect } from "next/navigation";

import { getDefaultAppPath } from "@/lib/auth/roles";
import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { runStudentPortalFlow } from "@/lib/students/portal-flow";
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
  let supabase: ReturnType<typeof createClient> | null = null;
  const result = await runStudentPortalFlow({
    requireSession: requireSessionContext,
    redirectNonStudent(context) {
      redirect(getDefaultAppPath(context));
    },
    redirectInvalidStudent() {
      redirect("/login?error=session&reason=student_identity_link_invalid");
    },
    async rpc(name) {
      supabase ??= createClient();
      const { data, error } = await supabase.rpc(name);

      return { data, error };
    }
  });

  const student = result.profile as StudentPortalStudent;

  return {
    context: result.context,
    school: { name: student.school_name },
    student,
    devices: result.devices as StudentPortalDevice[]
  };
}
