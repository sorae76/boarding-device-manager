import { notFound } from "next/navigation";

import { requireSessionContext } from "@/lib/auth/session";
import type { CurrentSessionContext } from "@/lib/auth/types";

export type ResidenceContext = CurrentSessionContext & {
  currentSchool: NonNullable<CurrentSessionContext["currentSchool"]>;
};

export function canReadResidences(context: CurrentSessionContext) {
  return (
    context.effectiveRole === "super_admin" ||
    context.effectiveRole === "school_admin" ||
    context.effectiveRole === "dorm_supervisor" ||
    context.effectiveRole === "dorm_staff" ||
    context.effectiveRole === "viewer"
  );
}

export function canManageResidences(context: CurrentSessionContext) {
  return (
    context.effectiveRole === "super_admin" ||
    context.effectiveRole === "school_admin" ||
    context.effectiveRole === "dorm_supervisor"
  );
}

export async function requireResidenceContext() {
  const context = await requireSessionContext();

  if (!context.currentSchool || !canReadResidences(context)) {
    notFound();
  }

  return context as ResidenceContext;
}
