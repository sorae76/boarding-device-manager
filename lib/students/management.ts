import type { CurrentSessionContext } from "../auth/types";
import type { StudentActionState, StudentManagementRow } from "./types";

export function canManageStudents(context: CurrentSessionContext) {
  const membership = context.currentMembership;
  const school = context.currentSchool;

  if (!membership || !school || !membership.is_active || membership.school_id !== school.id) {
    return false;
  }

  if (context.effectiveRole === "school_admin") {
    return membership.role === "school_admin";
  }

  return context.effectiveRole === "super_admin";
}

export function studentManagementError(code?: string, message?: string) {
  const value = `${code ?? ""} ${message ?? ""}`.trim().toUpperCase();

  if (value.includes("ZS001") || value.includes("STUDENT_DUPLICATE_EMAIL")) {
    return "This email is already assigned to another active student.";
  }
  if (value.includes("ZS002") || value.includes("STUDENT_DUPLICATE_NUMBER")) {
    return "This student number is already in use at this school.";
  }
  if (value.includes("STUDENT_LINKED_EMAIL_LOCKED")) {
    return "Linked account emails cannot be changed.";
  }
  if (value.includes("STUDENT_INVALID_RESIDENCE")) {
    return "Choose an active residence.";
  }
  if (value.includes("STUDENT_FORBIDDEN")) {
    return "You are not allowed to manage students.";
  }

  return "The student could not be saved.";
}

export function nextNewStudentEditorVersion(
  currentVersion: number,
  status: StudentActionState["status"]
) {
  return status === "success" ? currentVersion + 1 : currentVersion;
}

export function studentEditorVersion(student?: StudentManagementRow, newStudentVersion = 0) {
  if (!student) return `new-student-${newStudentVersion}`;

  return [
    student.id,
    student.first_name,
    student.last_name,
    student.student_number ?? "",
    student.grade_level ?? "",
    student.dorm_id ?? "",
    student.school_email ?? "",
    student.status,
    student.updated_at ?? ""
  ].join("|");
}
