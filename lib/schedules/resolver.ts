import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";

/** Pure server-side core. Inputs must be a complete, consistent, trusted G1-A
 * snapshot, not rows from the policy-only UI read model. No I/O or mutations. */
export type ScheduleState = "RESTRICTED" | "ALLOWED" | "UNCONFIGURED" | "INVALID";
type Event = { id: string; weekday: number; local_time: string; event_type: "return" | "release" };
export type Publication = {
  id: string;
  school_id: string;
  dorm_id: string | null;
  scope_revision: string;
  policy_id: string;
  predecessor_publication_id: string | null;
  replaces_publication_id: string | null;
  timezone_snapshot: string;
  effective_from: string;
  declared_effective_to: string | null;
  is_active: boolean;
  events: Event[];
};
export type LedgerEntry = {
  id: string;
  school_id: string;
  dorm_id: string | null;
  scope_revision: string;
  operation: "publish" | "replace" | "cancel";
  publication_id: string | null;
  predecessor_publication_id: string | null;
  replaced_publication_id: string | null;
  cutover_date: string;
};
export type ScopeSnapshot = {
  school_id: string;
  dorm_id: string | null;
  /** Decimal bigint string. Includes every ledger row through this revision. */
  revision: string;
  publications: Publication[];
  ledger: LedgerEntry[];
};
export type AssignmentSnapshot = {
  id: string;
  school_id: string;
  subject_id: string;
  /** Evidence reference, not an assertion derived from today's students row. */
  evidence: string;
  start: string;
  end: string;
  /** null means proven school-only context. Omitted intervals mean unknown. */
  dorm_id: string | null;
};
export type ResolverVersions = {
  resolver: string;
  temporal: string;
  node: string;
  icu: string;
  tzdata: string;
};
export function scheduleResolverVersions(): ResolverVersions {
  return {
    resolver: "g1b/1", temporal: "@js-temporal/polyfill@0.5.1",
    node: process.versions.node, icu: process.versions.icu ?? "unknown",
    tzdata: process.versions.tz ?? "unknown"
  };
}
export type ResolverInput = {
  school_id: string;
  /** Identity whose assignment is being resolved; no implicit current lookup. */
  subject_id: string;
  assignments: AssignmentSnapshot[];
  scopes: ScopeSnapshot[];
  query: { instant: string } | { start: string; end: string };
  /** Supply the saved versions when replaying a previously frozen evaluation. */
  expected_versions?: ResolverVersions;
};
export type EventBoundary = {
  event_id: string;
  event_type: "return" | "release";
  local: string;
  utc: string;
  resolved_local: string;
  disambiguation: "earlier" | "later";
};
export type Provenance = {
  assignment: AssignmentSnapshot;
  publication_id: string;
  policy_id: string;
  publication_revision: string;
  scope: "school" | "residence";
  selection: "school_only" | "residence_override" | "school_fallback";
  timezone_snapshot: string;
  effective_start: string;
  effective_end: string | null;
  successor_publication_id: string | null;
  return: EventBoundary | null;
  release: EventBoundary | null;
  start: string;
  end: string;
  local_start: string;
  local_end: string;
};
export type RestrictedWindow = {
  restricted_window_id: string;
  school_id: string;
  subject_id: string;
  restricted_window_start: string;
  restricted_window_end: string;
  versions: ResolverVersions;
  provenance: Provenance[];
};
export type ResolutionSegment = {
  start: string; end: string; state: ScheduleState; reason: string;
  provenance: Provenance[];
  restricted_window_id: string | null;
};
export type ScheduleResolution = {
  versions: ResolverVersions;
  publication_revisions: { dorm_id: string | null; revision: string }[];
  configuration_errors: { dorm_id: string | null; publication_ids: string[]; reason: string }[];
  segments: ResolutionSegment[];
  windows: RestrictedWindow[];
};

const DAY = 86_400_000;
function requireValue(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function instant(text: string) {
  const value = Temporal.Instant.from(text);
  requireValue(value.epochNanoseconds % BigInt(1_000_000) === BigInt(0), "unsupported_submillisecond_instant");
  return value.epochMilliseconds;
}
function utc(value: number) { return Temporal.Instant.fromEpochMilliseconds(value).toString(); }
function local(value: number, zone: string) {
  return Temporal.Instant.fromEpochMilliseconds(value).toZonedDateTimeISO(zone).toString();
}
function date(text: string) {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(text), "invalid_policy_date");
  return Temporal.PlainDate.from(text, { overflow: "reject" });
}
function startOfDay(text: string, zone: string) {
  // The date boundary is the first actual instant of that local date. A skipped
  // civil date is unsupported, rather than silently moving a policy to tomorrow.
  const day = date(text);
  requireValue(typeof zone === "string" && zone.length > 0 && !/^[+-]/.test(zone), "invalid_iana_timezone");
  const start = day.toZonedDateTime(zone);
  requireValue(start.toPlainDate().equals(day), "nonexistent_policy_date");
  return start.epochMilliseconds;
}
function revision(value: string) {
  requireValue(/^(0|[1-9]\d*)$/.test(value), "invalid_publication_revision");
  return BigInt(value);
}
function reason(error: unknown) {
  return error instanceof Error ? error.message : "unresolvable_schedule";
}

type EffectivePublication = { publication: Publication; start: number; end: number; successor: string | null };
type EffectiveScope = { rows: EffectivePublication[]; error?: string };

function effectiveScope(scope: ScopeSnapshot, school: string): EffectiveScope {
  try {
    requireValue(scope.school_id === school, "cross_school_scope");
    const targetRevision = revision(scope.revision);
    const ledger = [...scope.ledger].sort((a, b) => revision(a.scope_revision) < revision(b.scope_revision) ? -1 : 1);
    requireValue(BigInt(ledger.length) === targetRevision, "incomplete_publication_ledger");
    const publications = new Map(scope.publications.map((p) => [p.id, p]));
    requireValue(publications.size === scope.publications.length, "duplicate_publication");
    const seen = new Set<string>();
    const ledgerIds = new Set<string>();
    const active: Publication[] = [];
    for (let index = 0; index < ledger.length; index++) {
      const entry = ledger[index];
      requireValue(entry.school_id === school && entry.dorm_id === scope.dorm_id, "cross_scope_ledger");
      requireValue(revision(entry.scope_revision) === BigInt(index + 1), "noncontiguous_publication_revision");
      requireValue(entry.id && !ledgerIds.has(entry.id), "duplicate_ledger_entry");
      ledgerIds.add(entry.id);
      if (entry.operation === "replace" || entry.operation === "cancel") {
        const tail = active.pop();
        requireValue(tail && tail.id === entry.replaced_publication_id &&
          tail.predecessor_publication_id === entry.predecessor_publication_id, "invalid_replacement_path");
        if (entry.operation === "cancel") {
          requireValue(entry.publication_id === null && entry.cutover_date === tail.effective_from, "invalid_cancellation");
          continue;
        }
      } else {
        requireValue(entry.operation === "publish" && entry.replaced_publication_id === null, "invalid_ledger_operation");
      }
      const p = publications.get(entry.publication_id ?? "");
      requireValue(p && p.school_id === school && p.dorm_id === scope.dorm_id &&
        p.scope_revision === entry.scope_revision && p.effective_from === entry.cutover_date &&
        p.predecessor_publication_id === entry.predecessor_publication_id &&
        p.replaces_publication_id === entry.replaced_publication_id && !seen.has(p.id), "publication_ledger_mismatch");
      requireValue(p.predecessor_publication_id === (active.at(-1)?.id ?? null), "invalid_predecessor_path");
      requireValue(!active.length || p.effective_from > active[active.length - 1].effective_from, "invalid_cutover_order");
      date(p.effective_from);
      requireValue(p.declared_effective_to === null || date(p.declared_effective_to).toString() >= p.effective_from, "invalid_policy_dates");
      seen.add(p.id);
      active.push(p);
    }
    requireValue(seen.size === publications.size, "unledgered_publication");
    const starts = active.map((p) => startOfDay(p.effective_from, p.timezone_snapshot));
    const rows = active.map((publication, i) => {
      const declaredEnd = publication.declared_effective_to === null ? Infinity : startOfDay(
        date(publication.declared_effective_to).add({ days: 1 }).toString(), publication.timezone_snapshot
      );
      const end = Math.min(declaredEnd, starts[i + 1] ?? Infinity);
      requireValue(end > starts[i], "invalid_publication_interval");
      return { publication, start: starts[i], end, successor: active[i + 1]?.id ?? null };
    });
    return { rows };
  } catch (error) {
    return { rows: [], error: reason(error) };
  }
}

function eventRing(p: Publication) {
  requireValue(p.is_active === true, "inactive_published_policy");
  const events = p.events.map((event) => {
    requireValue(event.id && Number.isInteger(event.weekday) && event.weekday >= 0 && event.weekday <= 6 &&
      /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(event.local_time) &&
      (event.event_type === "return" || event.event_type === "release"), "invalid_weekly_event");
    return { ...event, local_time: Temporal.PlainTime.from(event.local_time).toString() };
  }).sort((a, b) => a.weekday - b.weekday || compareText(a.local_time, b.local_time));
  requireValue(events.length >= 2 && new Set(events.map((event) => event.id)).size === events.length, "incomplete_event_ring");
  events.forEach((event, index) => {
    const next = events[(index + 1) % events.length];
    requireValue(event.event_type !== next.event_type, "nonalternating_event_ring");
    requireValue(event.weekday !== next.weekday || event.local_time !== next.local_time, "duplicate_local_event");
  });
  return events;
}

function boundary(day: Temporal.PlainDate, event: Event, zone: string): EventBoundary {
  const wall = day.toPlainDateTime(event.local_time);
  const disambiguation = event.event_type === "return" ? "earlier" : "later";
  const resolved = wall.toZonedDateTime(zone, { disambiguation });
  return { event_id: event.id, event_type: event.event_type, local: wall.toString(),
    utc: resolved.toInstant().toString(), resolved_local: resolved.toString(), disambiguation };
}

type Pair = { start: number; end: number; return: EventBoundary; release: EventBoundary };
function weeklyPairs(p: Publication, start: number, end: number): Pair[] {
  const events = eventRing(p);
  const zone = p.timezone_snapshot;
  const startDay = Temporal.Instant.fromEpochMilliseconds(start).toZonedDateTimeISO(zone).toPlainDate();
  const endDay = Temporal.Instant.fromEpochMilliseconds(end).toZonedDateTimeISO(zone).toPlainDate();
  let monday = startDay.subtract({ days: startDay.dayOfWeek - 1 + 7 });
  const lastDay = endDay.add({ days: 7 });
  const pairs: Pair[] = [];
  for (; Temporal.PlainDate.compare(monday, lastDay) <= 0; monday = monday.add({ days: 7 })) {
    events.forEach((event, index) => {
      if (event.event_type !== "return") return;
      const next = events[(index + 1) % events.length];
      const returned = boundary(monday.add({ days: event.weekday }), event, zone);
      const released = boundary(monday.add({ days: next.weekday + (index === events.length - 1 ? 7 : 0) }), next, zone);
      const pair = { start: instant(returned.utc), end: instant(released.utc), return: returned, release: released };
      requireValue(pair.end > pair.start, "nonpositive_dst_interval");
      if (pair.start < end && pair.end > start) pairs.push(pair);
    });
  }
  return pairs;
}

type Assignment = { snapshot: AssignmentSnapshot; start: number; end: number };
type Piece = { start: number; end: number; state: ScheduleState; reason: string; provenance: Provenance[] };
function source(row: EffectivePublication, assignment: Assignment, start: number, end: number, pair?: Pair): Provenance {
  const p = row.publication;
  return {
    assignment: { ...assignment.snapshot }, publication_id: p.id, policy_id: p.policy_id,
    publication_revision: p.scope_revision, scope: p.dorm_id === null ? "school" : "residence",
    selection: p.dorm_id !== null ? "residence_override" : assignment.snapshot.dorm_id === null ? "school_only" : "school_fallback",
    timezone_snapshot: p.timezone_snapshot, effective_start: utc(row.start),
    effective_end: Number.isFinite(row.end) ? utc(row.end) : null, successor_publication_id: row.successor,
    return: pair?.return ?? null, release: pair?.release ?? null,
    start: utc(start), end: utc(end), local_start: local(start, p.timezone_snapshot), local_end: local(end, p.timezone_snapshot)
  };
}

function resolveDomain(scopes: Map<string | null, EffectiveScope>, assignments: Assignment[], start: number, end: number): Piece[] {
  const bounds = new Set([start, end]);
  for (const a of assignments) { if (a.start > start && a.start < end) bounds.add(a.start); if (a.end > start && a.end < end) bounds.add(a.end); }
  for (const s of scopes.values()) for (const p of s.rows) {
    if (p.start > start && p.start < end) bounds.add(p.start);
    if (p.end > start && p.end < end) bounds.add(p.end);
  }
  const cuts = [...bounds].sort((a, b) => a - b);
  const pieces: Piece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i], to = cuts[i + 1];
    const blank = (state: ScheduleState, reason: string) => pieces.push({ start: from, end: to, state, reason, provenance: [] });
    const assignment = assignments.find((a) => a.start <= from && a.end > from);
    if (!assignment) { blank("UNCONFIGURED", "unknown_as_of_assignment"); continue; }
    const residence = assignment.snapshot.dorm_id;
    const residenceScope = residence === null ? undefined : scopes.get(residence);
    if (residence !== null && !residenceScope) { blank("UNCONFIGURED", "missing_residence_publication_snapshot"); continue; }
    if (residenceScope?.error) { blank("INVALID", residenceScope.error); continue; }
    let row = residenceScope?.rows.find((p) => p.start <= from && p.end > from);
    if (!row) {
      const school = scopes.get(null);
      if (!school) { blank("UNCONFIGURED", "missing_school_publication_snapshot"); continue; }
      if (school.error) { blank("INVALID", school.error); continue; }
      row = school.rows.find((p) => p.start <= from && p.end > from);
    }
    if (!row) { blank("UNCONFIGURED", "no_effective_publication"); continue; }
    try {
      const selected = row;
      const pairs = weeklyPairs(selected.publication, from, to);
      const points = new Set([from, to]);
      for (const pair of pairs) { points.add(Math.max(from, pair.start)); points.add(Math.min(to, pair.end)); }
      const sorted = [...points].sort((a, b) => a - b);
      for (let j = 0; j < sorted.length - 1; j++) {
        const left = sorted[j], right = sorted[j + 1];
        const covering = pairs.filter((pair) => pair.start <= left && pair.end > left);
        pieces.push({ start: left, end: right, state: covering.length ? "RESTRICTED" : "ALLOWED",
          reason: covering.length ? "weekly_return_to_release" : "outside_restricted_window",
          provenance: covering.length ? covering.map((pair) => source(selected, assignment, left, right, pair)) : [source(selected, assignment, left, right)] });
      }
    } catch (error) {
      pieces.push({ start: from, end: to, state: "INVALID", reason: reason(error),
        provenance: [source(row, assignment, from, to)] });
    }
  }
  return pieces;
}

/** Coalesce provenance split by irrelevant scope boundaries or overlapping pairs.
 * Keep different publication versions and actual assignment evidence separate. */
function normalizeProvenance(items: Provenance[]): Provenance[] {
  const groups = new Map<string, Provenance[]>();
  for (const item of items) {
    const identity = { ...item, start: "", end: "", local_start: "", local_end: "" };
    const key = canonical(identity);
    groups.set(key, [...(groups.get(key) ?? []), { ...item }]);
  }
  const result: Provenance[] = [];
  for (const values of groups.values()) {
    values.sort((a, b) => instant(a.start) - instant(b.start));
    let previous: Provenance | undefined;
    for (const item of values) {
      if (previous && instant(item.start) <= instant(previous.end)) {
        if (instant(item.end) > instant(previous.end)) { previous.end = item.end; previous.local_end = item.local_end; }
      } else { result.push(item); previous = item; }
    }
  }
  return result.sort((a, b) => instant(a.start) - instant(b.start) || compareText(canonical(a), canonical(b)));
}

/** Window expansion is independent of the observation query: returned windows
 * retain their whole canonical extent, even for a single instant. Assignment
 * evidence bounds are real configuration boundaries, never invented history. */
export function resolveSchedule(input: ResolverInput): ScheduleResolution {
  const versions = scheduleResolverVersions();
  const result: ScheduleResolution = { versions, publication_revisions: [], configuration_errors: [], segments: [], windows: [] };
  let queryStart: number, queryEnd: number;
  try {
    queryStart = instant("instant" in input.query ? input.query.instant : input.query.start);
    queryEnd = "instant" in input.query ? queryStart + 1 : instant(input.query.end);
    requireValue(queryEnd > queryStart && queryEnd - queryStart <= 366 * DAY, "invalid_or_excessive_query_range");
  } catch (error) {
    // A malformed request has no trustworthy UTC bounds.
    return { ...result, segments: [{ start: "", end: "", state: "INVALID", reason: reason(error), provenance: [], restricted_window_id: null }] };
  }
  const failure = (message: string): ScheduleResolution => ({ ...result, windows: [], segments: [{
    start: utc(queryStart), end: utc(queryEnd), state: "INVALID", reason: message, provenance: [], restricted_window_id: null
  }] });
  try {
    requireValue(input.school_id && input.subject_id, "missing_resolution_identity");
    requireValue(versions.icu !== "unknown" && versions.tzdata !== "unknown", "unknown_timezone_runtime_version");
    requireValue(!input.expected_versions || canonical(input.expected_versions) === canonical(versions), "resolver_runtime_version_mismatch");
    const assignments = input.assignments.map((snapshot) => {
      requireValue(snapshot.school_id === input.school_id && snapshot.subject_id === input.subject_id &&
        snapshot.id && snapshot.evidence, "invalid_assignment_evidence");
      const start = instant(snapshot.start), end = instant(snapshot.end);
      requireValue(end > start, "invalid_assignment_interval");
      return { snapshot, start, end };
    }).sort((a, b) => a.start - b.start);
    requireValue(new Set(assignments.map((a) => a.snapshot.id)).size === assignments.length, "duplicate_assignment_evidence");
    assignments.forEach((a, i) => requireValue(i === 0 || assignments[i - 1].end <= a.start, "overlapping_assignment_evidence"));
    const relevant = new Set<string | null>([null, ...assignments.map((a) => a.snapshot.dorm_id)]);
    const scopes = new Map<string | null, EffectiveScope>();
    for (const scope of input.scopes) {
      requireValue(scope.school_id === input.school_id, "cross_school_scope");
      if (!relevant.has(scope.dorm_id)) continue;
      requireValue(!scopes.has(scope.dorm_id), "duplicate_scope_snapshot");
      const effective = effectiveScope(scope, input.school_id);
      scopes.set(scope.dorm_id, effective);
      if (effective.error) result.configuration_errors.push({ dorm_id: scope.dorm_id,
        publication_ids: scope.publications.map((p) => p.id).sort(), reason: effective.error });
      result.publication_revisions.push({ dorm_id: scope.dorm_id, revision: scope.revision });
    }
    result.publication_revisions.sort((a, b) => compareText(a.dorm_id ?? "", b.dorm_id ?? ""));
    result.configuration_errors.sort((a, b) => compareText(a.dorm_id ?? "", b.dorm_id ?? ""));
    for (let padding = 16 * DAY; padding <= 4096 * DAY; padding *= 2) {
      const start = queryStart - padding, end = queryEnd + padding;
      const pieces = resolveDomain(scopes, assignments, start, end);
      const runs: { start: number; end: number; provenance: Provenance[] }[] = [];
      for (const piece of pieces) {
        if (piece.state !== "RESTRICTED") continue;
        const last = runs.at(-1);
        if (last && last.end === piece.start) { last.end = piece.end; last.provenance.push(...piece.provenance); }
        else runs.push({ start: piece.start, end: piece.end, provenance: [...piece.provenance] });
      }
      const relevantRuns = runs.filter((run) => run.start < queryEnd && run.end > queryStart);
      if (relevantRuns.some((run) => run.start === start || run.end === end)) continue;
      result.windows = relevantRuns.map((run) => {
        const window = { school_id: input.school_id, subject_id: input.subject_id,
          restricted_window_start: utc(run.start), restricted_window_end: utc(run.end), versions,
          provenance: normalizeProvenance(run.provenance) };
        // Distant future cutovers can change explanatory policy end metadata
        // without changing this window. Hash only the participating boundaries,
        // versions and assignment/publication identities, not remote cutovers.
        const identity = { ...window, provenance: window.provenance.map((p) => ({
          ...p, effective_start: "", effective_end: null, successor_publication_id: null
        })) };
        return { restricted_window_id: `rw_${createHash("sha256").update(canonical(identity)).digest("hex")}`, ...window };
      });
      result.segments = pieces.filter((piece) => piece.start < queryEnd && piece.end > queryStart).map((piece) => ({
        start: utc(Math.max(queryStart, piece.start)), end: utc(Math.min(queryEnd, piece.end)), state: piece.state,
        reason: piece.reason, provenance: normalizeProvenance(piece.provenance),
        restricted_window_id: piece.state === "RESTRICTED" ? result.windows.find((window) =>
          instant(window.restricted_window_start) <= piece.start && instant(window.restricted_window_end) >= piece.end
        )?.restricted_window_id ?? null : null
      }));
      return result;
    }
    return failure("canonical_window_expansion_limit");
  } catch (error) { return failure(reason(error)); }
}
