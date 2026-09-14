import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
// @ts-expect-error Native Node test runner requires the source extension.
import { resolveSchedule } from "./resolver.ts";
import type { ScopeSnapshot } from "./resolver";
import type { AuthoringSnapshot, DraftPreview, ScheduleDraft } from "./authoring-types";

export function activePublications(scope: ScopeSnapshot) {
  const removed = new Set(scope.ledger.flatMap((entry) => entry.replaced_publication_id ? [entry.replaced_publication_id] : []));
  return scope.publications.filter((p) => !removed.has(p.id)).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}
export function publicationIntervals(scope: ScopeSnapshot) {
  return activePublications(scope).map((p, i, rows) => {
    const start = Temporal.PlainDate.from(p.effective_from).toZonedDateTime(p.timezone_snapshot).toInstant();
    const declaredEnd = p.declared_effective_to ? Temporal.PlainDate.from(p.declared_effective_to).add({ days: 1 }).toZonedDateTime(p.timezone_snapshot).toInstant() : null;
    const next = rows[i + 1];
    const cutover = next ? Temporal.PlainDate.from(next.effective_from).toZonedDateTime(next.timezone_snapshot).toInstant() : null;
    const end = declaredEnd && cutover ? (Temporal.Instant.compare(declaredEnd, cutover) < 0 ? declaredEnd : cutover) : declaredEnd ?? cutover;
    return { id: p.id, start: start.toString(), end: end?.toString() ?? null, timezone: p.timezone_snapshot };
  });
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateDraft(draft: ScheduleDraft) {
  if (!draft || typeof draft.name !== "string" || !draft.name.trim() || draft.name.trim().length > 200 ||
      !uuid.test(draft.idempotency_key) || !/^(0|[1-9]\d*)$/.test(draft.expected_revision) ||
      BigInt(draft.expected_revision) >= BigInt("9223372036854775807") ||
      [draft.dorm_id, draft.predecessor_id, draft.replaces_id].some((id) => id !== null && !uuid.test(id)) ||
      !Array.isArray(draft.events) || draft.events.length < 2 || draft.events.length > 1008) throw new Error("Invalid schedule draft.");
  for (const date of [draft.effective_from, draft.effective_to].filter((value) => value !== null)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Temporal.PlainDate.from(date, { overflow: "reject" }).toString() !== date) throw new Error("Invalid schedule date.");
  }
  if (draft.effective_to && draft.effective_to < draft.effective_from) throw new Error("End date must follow the start date.");
}

export function previewScheduleDraft(snapshot: AuthoringSnapshot, draft: ScheduleDraft): DraftPreview {
  validateDraft(draft);
  if (draft.effective_from <= snapshot.today) throw new Error("Publication must start tomorrow or later in the school timezone.");
  const scope = snapshot.scopes.find((s) => s.dorm_id === draft.dorm_id);
  if (!scope || (draft.dorm_id === null ? !snapshot.can_manage_school : !snapshot.residences.some((r) => r.id === draft.dorm_id))) throw new Error("Not authorized for this schedule scope.");
  if (scope.revision !== draft.expected_revision) throw new Error("Schedule changed. Reload the scope and preview again; your draft is preserved.");
  const tail = activePublications(scope).at(-1);
  if (draft.replaces_id ? !tail || tail.id !== draft.replaces_id || tail.effective_from <= snapshot.today || tail.predecessor_publication_id !== draft.predecessor_id :
      (tail?.id ?? null) !== draft.predecessor_id) throw new Error("Publication chain changed. Reload and preview again.");
  const predecessor = scope.publications.find((p) => p.id === draft.predecessor_id);
  if (predecessor && predecessor.effective_from >= draft.effective_from) throw new Error("The successor must start after its predecessor.");
  const rev = (BigInt(scope.revision) + BigInt(1)).toString();
  const publication = { id: "draft-publication", school_id: snapshot.school_id, dorm_id: draft.dorm_id, scope_revision: rev,
    policy_id: "draft-policy", predecessor_publication_id: draft.predecessor_id, replaces_publication_id: draft.replaces_id,
    timezone_snapshot: snapshot.timezone, effective_from: draft.effective_from, declared_effective_to: draft.effective_to,
    is_active: true, events: draft.events.map((event, i) => ({ ...event, id: `draft-event-${i}` })) };
  const proposed: ScopeSnapshot = { ...scope, revision: rev, publications: [...scope.publications, publication], ledger: [...scope.ledger, {
    id: "draft-ledger", school_id: snapshot.school_id, dorm_id: draft.dorm_id, scope_revision: rev,
    operation: draft.replaces_id ? "replace" : "publish", publication_id: publication.id,
    predecessor_publication_id: draft.predecessor_id, replaced_publication_id: draft.replaces_id, cutover_date: draft.effective_from
  }] };
  const startDay = Temporal.PlainDate.from(draft.effective_from);
  const start = startDay.toZonedDateTime(snapshot.timezone).toInstant().toString();
  const end = startDay.add({ days: 8 }).toZonedDateTime(snapshot.timezone).toInstant().toString();
  const resolution = resolveSchedule({ school_id: snapshot.school_id, subject_id: "draft-scope-preview",
    scopes: snapshot.scopes.map((s) => s.dorm_id === draft.dorm_id ? proposed : s), query: { start, end },
    assignments: [{ id: "hypothetical-scope", school_id: snapshot.school_id, subject_id: "draft-scope-preview", dorm_id: draft.dorm_id,
      evidence: "Authoring scope preview only; not student assignment evidence", start: startDay.subtract({ days: 4100 }).toZonedDateTime(snapshot.timezone).toInstant().toString(),
      end: startDay.add({ days: 4100 }).toZonedDateTime(snapshot.timezone).toInstant().toString() }] });
  const invalid = resolution.segments.find((s) => s.state === "INVALID");
  if (invalid) throw new Error(`Invalid schedule: ${invalid.reason}`);
  const interval = publicationIntervals(proposed).find((p) => p.id === publication.id)!;
  const fingerprint = createHash("sha256").update(JSON.stringify({ draft, timezone: snapshot.timezone,
    revisions: snapshot.scopes.map((s) => [s.dorm_id, s.revision]), versions: resolution.versions })).digest("hex");
  return { resolution, start: interval.start, end: interval.end, fingerprint, timezone: snapshot.timezone };
}
