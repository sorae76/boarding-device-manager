import { notFound } from "next/navigation";

import { requireSessionContext } from "@/lib/auth/session";
import type { CurrentSessionContext } from "@/lib/auth/types";
import { isScheduleReaderRole } from "@/lib/schedules/types";

export type ScheduleContext = CurrentSessionContext & {
  currentSchool: NonNullable<CurrentSessionContext["currentSchool"]>;
};

export function canReadSchedules(context: CurrentSessionContext) {
  return Boolean(context.currentSchool) && isScheduleReaderRole(context.effectiveRole);
}

export async function requireScheduleContext() {
  const context = await requireSessionContext();
  if (!canReadSchedules(context)) notFound();
  return context as ScheduleContext;
}
