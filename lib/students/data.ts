import { getDashboardStudentCustody } from "@/lib/devices/data";
import { createClient } from "@/lib/supabase/server";
import type { StudentContext } from "@/lib/students/access";
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
};

function singleResidence(value: ResidenceRelation): StudentResidence | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function listStudentResidenceRows(
  context: StudentContext
): Promise<StudentResidenceRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("students")
    .select("id,dorm_id,dorms(id,name,code,is_active)")
    .eq("school_id", context.currentSchool.id)
    .eq("status", "active");

  if (error) {
    throw new Error("Could not load student residences.");
  }

  return ((data ?? []) as StudentResidenceQueryRow[]).map((row) => ({
    id: row.id,
    dorm_id: row.dorm_id,
    primaryResidence: singleResidence(row.dorms)
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
  const residencesByStudentId = new Map(residenceRows.map((row) => [row.id, row]));
  const students: StudentManagementRow[] = custody.studentSummaries.map((summary) => {
    const residence = residencesByStudentId.get(summary.student.id);

    return {
      ...summary.student,
      dorm_id: residence?.dorm_id ?? null,
      primaryResidence: residence?.primaryResidence ?? null,
      totalDevices: summary.totalDevices,
      checkedOutDevices: summary.checkedOutDevices,
      returnedDevices: summary.returnedDevices,
      lostDevices: summary.lostDevices,
      inactiveDevices: summary.inactiveDevices,
      custodyStatus: summary.status
    };
  });

  return { activeResidences, students };
}
