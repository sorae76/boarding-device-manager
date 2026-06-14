import type { CurrentSessionContext, SchoolRole } from "@/lib/auth/types";

const roleLabels: Record<SchoolRole | "super_admin" | "user", string> = {
  super_admin: "Super Admin",
  user: "User",
  school_admin: "School Admin",
  dorm_supervisor: "Dorm Supervisor",
  dorm_staff: "Dorm Staff",
  viewer: "Viewer",
  parent: "Parent"
};

export function getRoleLabel(role: CurrentSessionContext["effectiveRole"]) {
  return roleLabels[role];
}

export function getDefaultAppPath(context: CurrentSessionContext) {
  if (context.effectiveRole === "super_admin") {
    return "/app/settings";
  }

  if (context.effectiveRole === "school_admin" || context.effectiveRole === "dorm_supervisor") {
    return "/app/settings";
  }

  return "/app/dashboard";
}
