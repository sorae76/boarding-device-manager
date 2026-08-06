import { getDashboardStudentCustody } from "@/lib/devices/data";
import { createClient } from "@/lib/supabase/server";
import {
  canManageStudentAccountEmail,
  type StudentContext
} from "@/lib/students/access";
import { studentManagementCustodyStatus } from "@/lib/students/custody-status";
import type {
  StudentManagementRow,
  StudentResidence,
  StudentResidenceRow
} from "@/lib/students/types";

type ResidenceRelation = StudentResidence | StudentResidence[] | null;

type StudentResidenceQueryRow = {
  id: string;
  dorm_id: string | null;
  dorms: ResidenceRelation;
  school_email?: string | null;
  auth_user_id?: string | null;
  student_number: string | null;
  first_name: string;
  last_name: string;
  grade_level: string | null;
  status: "active" | "inactive";
  updated_at: string;
};

function singleResidence(value: ResidenceRelation): StudentResidence | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function listStudentResidenceRows(
  context: StudentContext
): Promise<StudentResidenceRow[]> {
  const supabase = createClient();
  const includeAccountData = canManageStudentAccountEmail(context);
  const result = includeAccountData
    ? await supabase
        .from("students")
        .select("id,dorm_id,student_number,first_name,last_name,grade_level,status,updated_at,school_email,auth_user_id,dorms(id,name,code,is_active)")
        .eq("school_id", context.currentSchool.id)
        .in("status", ["active", "inactive"])
        .order("last_name", { ascending: true })
    : await supabase
        .from("students")
        .select("id,dorm_id,student_number,first_name,last_name,grade_level,status,updated_at,dorms(id,name,code,is_active)")
        .eq("school_id", context.currentSchool.id)
        .in("status", ["active", "inactive"])
        .order("last_name", { ascending: true });
  const { data, error } = result;

  if (error) {
    throw new Error("Could not load student residences.");
  }

  return ((data ?? []) as StudentResidenceQueryRow[]).map((row) => ({
    id: row.id,
    dorm_id: row.dorm_id,
    primaryResidence: singleResidence(row.dorms),
    student_number: row.student_number,
    first_name: row.first_name,
    last_name: row.last_name,
    grade_level: row.grade_level,
    status: row.status,
    updated_at: row.updated_at,
    ...(includeAccountData
      ? {
          school_email: row.school_email ?? null,
          auth_user_id: row.auth_user_id ?? null
        }
      : {})
  }));
}

export async function listActiveStudentResidenceOptions(
  context: StudentContext
): Promise<StudentResidence[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dorms")
    .select("id,name,code,is_active")
    .eq("school_id", context.currentSchool.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load residence options.");
  }

  return (data ?? []) as StudentResidence[];
}

export async function getStudentManagementData(context: StudentContext) {
  const [custody, residenceRows, activeResidences] = await Promise.all([
    getDashboardStudentCustody(context),
    listStudentResidenceRows(context),
    listActiveStudentResidenceOptions(context)
  ]);
  const custodyByStudentId = new Map(custody.studentSummaries.map((row) => [row.student.id, row]));
  const students: StudentManagementRow[] = residenceRows.map((residence) => {
    const summary = custodyByStudentId.get(residence.id);
    const deviceCounts = {
      totalDevices: summary?.totalDevices ?? 0,
      checkedOutDevices: summary?.checkedOutDevices ?? 0,
      returnedDevices: summary?.returnedDevices ?? 0,
      lostDevices: summary?.lostDevices ?? 0,
      inactiveDevices: summary?.inactiveDevices ?? 0
    };

    return {
      ...residence,
      ...(canManageStudentAccountEmail(context)
        ? {
            school_email: residence.school_email ?? null,
            auth_user_id: residence.auth_user_id ?? null
          }
        : {}),
      ...deviceCounts,
      custodyStatus: studentManagementCustodyStatus(deviceCounts)
    };
  });

  return { activeResidences, students };
}
