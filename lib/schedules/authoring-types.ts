import type { ScopeSnapshot, ScheduleResolution } from "./resolver";
import type { AllowException } from "./exceptions";

export type WeeklyDraft = { weekday: number; local_time: string; event_type: "release" | "return" };
export type ScheduleDraft = {
  dorm_id: string | null; name: string; effective_from: string; effective_to: string | null;
  expected_revision: string; predecessor_id: string | null; replaces_id: string | null;
  idempotency_key: string; events: WeeklyDraft[];
};
export type AuthoringSnapshot = {
  school_id: string; timezone: string; observed_at: string; today: string;
  can_manage_school: boolean;
  residences: { id: string; name: string }[];
  scopes: (Omit<ScopeSnapshot, "publications"> & { publications: (ScopeSnapshot["publications"][number] & { name: string })[] })[];
  exceptions: AllowException[];
  intervals: { id: string; start: string; end: string | null; timezone: string }[];
};
export type DraftPreview = { resolution: ScheduleResolution; start: string; end: string | null; fingerprint: string; timezone: string };
export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string };
