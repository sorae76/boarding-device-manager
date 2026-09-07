import type { GlobalRole, SchoolRole } from "@/lib/auth/types";

export type ScheduleEventType = "release" | "return";

export type ScheduleWeeklyEvent = {
  id: string;
  school_id: string;
  policy_id: string;
  weekday: number;
  local_time: string;
  event_type: ScheduleEventType;
};

export type SchedulePolicy = {
  id: string;
  school_id: string;
  dorm_id: string | null;
  name: string;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  residenceName: string | null;
  events: ScheduleWeeklyEvent[];
};

export type ScheduleManagementData = {
  schoolWidePolicies: SchedulePolicy[];
  residencePolicies: SchedulePolicy[];
};

export const SCHEDULE_READER_ROLES = [
  "super_admin", "school_admin", "dorm_supervisor", "dorm_staff", "viewer"
] as const satisfies readonly (GlobalRole | SchoolRole)[];

export function isScheduleReaderRole(role: GlobalRole | SchoolRole) {
  return (SCHEDULE_READER_ROLES as readonly string[]).includes(role);
}

export function compareScheduleEvents(a: ScheduleWeeklyEvent, b: ScheduleWeeklyEvent) {
  return a.weekday - b.weekday || a.local_time.localeCompare(b.local_time) || a.event_type.localeCompare(b.event_type);
}

export function formatScheduleLocalTime(localTime: string) {
  const [hourText = "0", minute = "00"] = localTime.split(":");
  const hour = Number.parseInt(hourText, 10);
  const normalizedHour = Number.isFinite(hour) ? hour : 0;
  return `${normalizedHour % 12 || 12}:${minute} ${normalizedHour >= 12 ? "PM" : "AM"}`;
}
