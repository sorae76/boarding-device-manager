"use server";

import { revalidatePath } from "next/cache";

import {
  canManageStudentAccountEmail,
  canManageStudentPrimaryResidence,
  requireStudentContext
} from "@/lib/students/access";
import { createClient } from "@/lib/supabase/server";
import type { StudentActionState } from "@/lib/students/types";

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function studentAccountError(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("valid school email")) {
    return "Enter a valid school email.";
  }
  if (normalized.includes("already assigned")) {
    return "This email is already assigned to another student.";
  }
  if (normalized.includes("already linked")) {
    return "This student account is already linked.";
  }
  if (normalized.includes("not allowed")) {
    return "You are not allowed to manage student accounts.";
  }

  return "The student account email could not be updated.";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function setStudentPrimaryResidenceAction(
  _previousState: StudentActionState,
  formData: FormData
): Promise<StudentActionState> {
  try {
    const context = await requireStudentContext();

    if (!canManageStudentPrimaryResidence(context)) {
      return { status: "error", message: "You are not allowed to change residences." };
    }

    const studentId = formText(formData, "studentId");
    const residenceIdValue = formText(formData, "residenceId");
    const residenceId = residenceIdValue || null;

    if (!isUuid(studentId) || (residenceId !== null && !isUuid(residenceId))) {
      return { status: "error", message: "The student or residence is invalid." };
    }

    const supabase = createClient();
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", context.currentSchool.id)
      .eq("id", studentId)
      .maybeSingle();

    if (studentError || !student) {
      return { status: "error", message: "The student could not be found." };
    }

    if (residenceId) {
      const { data: residence, error: residenceError } = await supabase
        .from("dorms")
        .select("id")
        .eq("school_id", context.currentSchool.id)
        .eq("id", residenceId)
        .eq("is_active", true)
        .maybeSingle();

      if (residenceError || !residence) {
        return { status: "error", message: "Choose an active residence." };
      }
    }

    const { error } = await supabase.rpc("set_student_primary_residence", {
      target_student_id: studentId,
      target_dorm_id: residenceId
    });

    if (error) {
      return { status: "error", message: "The primary residence could not be updated." };
    }

    revalidatePath("/app/students");

    return {
      status: "success",
      message: residenceId ? "Primary residence updated." : "Primary residence cleared."
    };
  } catch {
    return { status: "error", message: "The primary residence could not be updated." };
  }
}

export async function setStudentSchoolEmailAction(
  _previousState: StudentActionState,
  formData: FormData
): Promise<StudentActionState> {
  try {
    const context = await requireStudentContext();

    if (!canManageStudentAccountEmail(context)) {
      return {
        status: "error",
        message: "You are not allowed to manage student accounts."
      };
    }

    const studentId = formText(formData, "studentId");
    const schoolEmail = formText(formData, "schoolEmail").toLowerCase();

    if (!isUuid(studentId)) {
      return { status: "error", message: "The student could not be found." };
    }

    if (
      schoolEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolEmail)
    ) {
      return { status: "error", message: "Enter a valid school email." };
    }

    const supabase = createClient();
    const { error } = await supabase.rpc("set_student_school_email", {
      target_student_id: studentId,
      target_school_email: schoolEmail || null
    });

    if (error) {
      return { status: "error", message: studentAccountError(error.message) };
    }

    revalidatePath("/app/students");
    return {
      status: "success",
      message: schoolEmail ? "Student account email saved." : "Student account email cleared."
    };
  } catch {
    return {
      status: "error",
      message: "The student account email could not be updated."
    };
  }
}
