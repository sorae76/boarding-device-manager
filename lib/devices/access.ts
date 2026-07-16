import { notFound } from "next/navigation";

import { requireSessionContext } from "@/lib/auth/session";
import type { CurrentSessionContext } from "@/lib/auth/types";

export type DeviceWorkflowContext = CurrentSessionContext & {
  currentSchool: NonNullable<CurrentSessionContext["currentSchool"]>;
};

export function canAccessDeviceWorkflows(context: CurrentSessionContext) {
  return (
    context.effectiveRole === "super_admin" ||
    context.effectiveRole === "school_admin" ||
    context.effectiveRole === "dorm_staff"
  );
}

export function canAccessDeviceDashboard(context: CurrentSessionContext) {
  return (
    context.effectiveRole === "super_admin" ||
    context.effectiveRole === "school_admin" ||
    context.effectiveRole === "dorm_supervisor"
  );
}

export async function requireDeviceDashboardContext() {
  const context = await requireSessionContext();

  if (!canAccessDeviceDashboard(context) || !context.currentSchool) {
    notFound();
  }

  return context as DeviceWorkflowContext;
}

export async function requireDeviceWorkflowContext() {
  const context = await requireSessionContext();

  if (!canAccessDeviceWorkflows(context) || !context.currentSchool) {
    notFound();
  }

  return context as DeviceWorkflowContext;
}
