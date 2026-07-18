import { notFound } from "next/navigation";

import { requireSessionContext } from "@/lib/auth/session";
import type { CurrentSessionContext } from "@/lib/auth/types";

export type StudentContext = CurrentSessionContext & {
  currentSchool: NonNullable<CurrentSessionContext["currentSchool"]>;
};

export function canReadStudents(context: CurrentSessionContext) {
  return (
    context.effectiveRole === "super_admin" ||
    context.effectiveRole === "school_admin" ||
    context.effectiveRole === "dorm_supervisor" ||
    context.effectiveRole === "dorm_staff" ||
    context.effectiveRole === "viewer"
  );
}

export function canManageStudentPrimaryResidence(context: CurrentSessionContext) {
  return (
    context.effectiveRole === "super_admin" ||
    context.effectiveRole === "school_admin" ||
    context.effectiveRole === "dorm_supervisor"
  );
}

export async function requireStudentContext() {
  const context = await requireSessionContext();

  if (!context.currentSchool || !canReadStudents(context)) {
    notFound();
  }

  return context as StudentContext;
}
