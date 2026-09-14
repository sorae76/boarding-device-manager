import { Temporal } from "@js-temporal/polyfill";
// @ts-expect-error Native Node test runner requires the source extension.
import { resolveSchedule } from "./resolver.ts";
import type { AssignmentSnapshot, ResolverInput, ResolutionSegment, ScheduleResolution } from "./resolver";

export type AllowException = {
  id: string; school_id: string; effect: "allow";
  device_id: string | null; student_id: string | null; dorm_id: string | null;
  start_at: string; end_at: string; reason: string; created_by_user_id: string; created_at: string;
  revoked_at: string | null; revoked_by_user_id: string | null; revoke_reason: string | null;
};
export type AllowResolverInput = ResolverInput & {
  subject_kind: "device" | "student";
  /** Proven event-time ownership, never inferred from today's device/student. */
  assignments: (AssignmentSnapshot & { student_id: string | null })[];
  exceptions: AllowException[];
  as_of: string;
};
export type EffectiveSegment = ResolutionSegment & { allow_exception_ids: string[] };
export type EffectiveResolution = Omit<ScheduleResolution, "segments"> & {
  segments: EffectiveSegment[]; base: ScheduleResolution; exception_as_of: string; exception_version: "g1c/1";
};
function ms(text: string) {
  const value = Temporal.Instant.from(text);
  if (value.epochNanoseconds % BigInt(1_000_000)) throw new Error("unsupported_exception_precision");
  return value.epochMilliseconds;
}
const utc = (value: number) => Temporal.Instant.fromEpochMilliseconds(value).toString();

/** Overlay only. Canonical windows and provenance are the untouched G1-B output. */
export function resolveScheduleWithAllows(input: AllowResolverInput): EffectiveResolution {
  // Ownership is overlay evidence, not a new field in G1-B's canonical identity.
  const base = resolveSchedule({ ...input, assignments: input.assignments.map((a) => ({
    id: a.id, school_id: a.school_id, subject_id: a.subject_id, evidence: a.evidence,
    start: a.start, end: a.end, dorm_id: a.dorm_id
  })) });
  const result: EffectiveResolution = { ...base, base, segments: [], exception_as_of: input.as_of, exception_version: "g1c/1" };
  try {
    const asOf = ms(input.as_of);
    if (!["device", "student"].includes(input.subject_kind)) throw new Error("invalid_exception_subject");
    const seen = new Set<string>();
    const allows = input.exceptions.map((exception) => {
      const start = ms(exception.start_at), end = ms(exception.end_at), created = ms(exception.created_at);
      const revoked = exception.revoked_at === null ? Infinity : ms(exception.revoked_at);
      if (!exception.id || seen.has(exception.id) || exception.school_id !== input.school_id || exception.effect !== "allow" ||
          [exception.device_id, exception.student_id, exception.dorm_id].filter(Boolean).length !== 1 ||
          !exception.reason.trim() || !exception.created_by_user_id || end <= start || start < created || revoked < created ||
          (exception.revoked_at === null ? exception.revoked_by_user_id !== null || exception.revoke_reason !== null :
            !exception.revoked_by_user_id || !exception.revoke_reason?.trim())) throw new Error("invalid_allow_exception_snapshot");
      seen.add(exception.id);
      return { exception, start, end: Math.min(end, revoked <= asOf ? revoked : Infinity), created };
    }).filter((allow) => allow.created <= asOf && allow.end > allow.start);
    for (const segment of base.segments) {
      if (segment.state !== "RESTRICTED") { result.segments.push({ ...segment, allow_exception_ids: [] }); continue; }
      const start = ms(segment.start), end = ms(segment.end);
      const spans: { start: number; end: number; id: string }[] = [];
      for (const { exception, start: allowStart, end: allowEnd } of allows) {
        for (const assignment of input.assignments) {
          const matches = exception.device_id !== null ? input.subject_kind === "device" && exception.device_id === input.subject_id :
            exception.student_id !== null ? (input.subject_kind === "student" ? exception.student_id === input.subject_id : exception.student_id === assignment.student_id) :
              exception.dorm_id === assignment.dorm_id;
          if (!matches) continue;
          const left = Math.max(start, allowStart, ms(assignment.start));
          const right = Math.min(end, allowEnd, ms(assignment.end));
          if (right > left) spans.push({ start: left, end: right, id: exception.id });
        }
      }
      const cuts = [...new Set([start, end, ...spans.flatMap((span) => [span.start, span.end])])].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const ids = [...new Set(spans.filter((span) => span.start <= cuts[i] && span.end > cuts[i]).map((span) => span.id))].sort();
        result.segments.push({ ...segment, start: utc(cuts[i]), end: utc(cuts[i + 1]),
          state: ids.length ? "ALLOWED" : "RESTRICTED", reason: ids.length ? "active_allow_exception" : segment.reason,
          allow_exception_ids: ids });
      }
    }
    return result;
  } catch (error) {
    return { ...result, segments: base.segments.map((segment) => ({ ...segment, state: "INVALID", reason:
      error instanceof Error ? error.message : "invalid_allow_snapshot", allow_exception_ids: [] })) };
  }
}
